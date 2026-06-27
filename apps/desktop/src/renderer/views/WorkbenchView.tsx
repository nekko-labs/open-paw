import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent, Session, ShellOption, TerminalInfo, WorkspaceFolder } from '@open-paw/shared';
import { useStore, type WbGroup, type WbPane } from '../store.js';
import { ChatPane } from '../components/ChatPane.js';
import { TerminalPane } from '../components/TerminalPane.js';
import { ChatIcon, TerminalIcon, PlusIcon, SplitIcon, CloseIcon, FolderIcon } from '../icons.js';

/**
 * The workbench: a Warp/Devin-style multi-pane surface. The left sidebar groups
 * work by project (chats, terminals, and nested sub-agents); the center hosts
 * tabbed panes that can be split side by side so many agents and terminals run
 * at once.
 */

/** Live state of an agent, surfaced as a dot on its sidebar row and tab. */
type AgentStatus = 'working' | 'input' | 'error';
const STATUS_META: Record<AgentStatus, { color: string; label: string; pulse: boolean }> = {
  working: { color: 'var(--accent)', label: 'Working…', pulse: true },
  input: { color: '#e0a23a', label: 'Needs your input', pulse: true },
  error: { color: '#e0574a', label: 'Stopped on an error', pulse: false },
};

function StatusDot({ status, className = '' }: { status: AgentStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.pulse ? 'animate-pulse' : ''} ${className}`}
      style={{ background: m.color }}
      title={m.label}
    />
  );
}

/** Fold an agent event into the per-session status (undefined = idle). */
function statusFromEvent(type: AgentEvent['type']): AgentStatus | null {
  switch (type) {
    case 'tool_approval_required': return 'input';
    case 'error': return 'error';
    case 'done': return null;
    default: return 'working';
  }
}

export function WorkbenchView() {
  const {
    sessions, terminals, groups, activeGroupId, settings, activeSessionId,
    refreshSessions, refreshTerminals, openChatPane, openTerminalPane, newTerminal,
    setActivePane, closePane, focusGroup, splitRight, newChat, setActiveWorkspace,
  } = useStore();

  const [statuses, setStatuses] = useState<Map<string, AgentStatus>>(new Map());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [mobileNav, setMobileNav] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [shells, setShells] = useState<ShellOption[]>([]);
  const newMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { refreshTerminals(); }, [refreshTerminals]);
  useEffect(() => { window.nekko.listShells().then(setShells).catch(() => {}); }, []);

  // Close the "+" create menu on an outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) setNewMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Open the active session as a pane if the workbench is empty (e.g. arriving
  // from the Command Center or command palette).
  useEffect(() => {
    if (groups.length === 0 && activeSessionId) openChatPane(activeSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive each session's status (working / needs-input / error / idle) from its
  // agent events for the sidebar + tab dots, and surface freshly spawned
  // sub-agents by refreshing the list when an unknown id appears.
  useEffect(() => {
    const known = new Set(sessions.map((s) => s.id));
    const off = window.nekko.onAgentEvent((e: AgentEvent) => {
      const next = statusFromEvent(e.type);
      setStatuses((prev) => {
        const m = new Map(prev);
        if (next === null) m.delete(e.sessionId);
        else m.set(e.sessionId, next);
        return m;
      });
      if (!known.has(e.sessionId)) { known.add(e.sessionId); refreshSessions(); }
    });
    return off;
  }, [sessions, refreshSessions]);

  const childrenOf = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of sessions) if (s.parentSessionId) {
      const arr = m.get(s.parentSessionId) ?? [];
      arr.push(s);
      m.set(s.parentSessionId, arr);
    }
    return m;
  }, [sessions]);

  const toggleCollapse = (id: string) =>
    setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const titleFor = (pane: WbPane): string => {
    if (pane.kind === 'chat') return sessions.find((s) => s.id === pane.refId)?.title ?? 'Chat';
    const t = terminals.find((x) => x.id === pane.refId);
    return t?.title || 'Terminal';
  };

  // Project buckets: each workspace + an "unassigned" bucket.
  const buckets: Array<{ ws?: WorkspaceFolder; key: string; name: string }> = [
    ...(settings?.workspaces ?? []).map((w) => ({ ws: w, key: w.id, name: w.name })),
    { key: '__none', name: 'No project' },
  ];
  const topChats = (key: string) =>
    sessions.filter((s) => !s.parentSessionId && (key === '__none' ? !s.workspaceId : s.workspaceId === key));
  const bucketTerminals = (key: string) =>
    terminals.filter((t) => (key === '__none' ? !t.workspaceId : t.workspaceId === key));

  const Sidebar = (
    <div className="flex h-full w-64 flex-col border-r border-line" style={{ background: 'var(--paper)' }}>
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-sm font-semibold">Workbench</span>
        <div className="relative" ref={newMenuRef}>
          <button className="btn btn-ghost px-2 py-1" title="New agent or terminal"
            onClick={() => setNewMenuOpen((o) => !o)}><PlusIcon /></button>
          {newMenuOpen && (
            <div className="card absolute right-0 top-9 z-40 w-60 p-1.5 shadow-lg">
              <button
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-2"
                onClick={() => { setNewMenuOpen(false); newChat(); }}
              >
                <ChatIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium">New agent</span>
                  <span className="block text-[11px] text-ink-faint">Chat that drives an agent</span>
                </span>
              </button>

              <div className="my-1 border-t border-line" />
              <p className="px-2.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Terminal</p>
              {shells.length === 0 ? (
                <button
                  className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-2"
                  onClick={() => { setNewMenuOpen(false); newTerminal(); }}
                >
                  <TerminalIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                  <span className="text-[12.5px] font-medium">New terminal</span>
                </button>
              ) : (
                shells.map((sh) => (
                  <button
                    key={sh.id}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-2"
                    title={sh.path}
                    onClick={() => { setNewMenuOpen(false); newTerminal(undefined, sh.path); }}
                  >
                    <TerminalIcon className="h-4 w-4 shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{sh.label}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {buckets.map((b) => {
          const chats = topChats(b.key);
          const terms = bucketTerminals(b.key);
          if (b.key === '__none' && chats.length === 0 && terms.length === 0) return null;
          const isCollapsed = collapsed.has(b.key);
          return (
            <div key={b.key} className="mb-1">
              <div className="group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => toggleCollapse(b.key)}>
                  <span className="text-[10px] text-ink-faint">{isCollapsed ? '▸' : '▾'}</span>
                  <FolderIcon className="h-3.5 w-3.5 text-ink-faint" />
                  <span className="truncate text-[12px] font-semibold uppercase tracking-wide text-ink-soft">{b.name}</span>
                </button>
                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button className="rounded p-1 text-ink-faint hover:text-ink" title="New chat in project"
                    onClick={() => { if (b.ws) setActiveWorkspace(b.ws.id); newChat(); }}><ChatIcon className="h-3.5 w-3.5" /></button>
                  <button className="rounded p-1 text-ink-faint hover:text-ink" title="New terminal in project"
                    onClick={() => newTerminal(b.ws?.id)}><TerminalIcon className="h-3.5 w-3.5" /></button>
                </span>
              </div>
              {!isCollapsed && (
                <div className="mt-0.5 space-y-0.5">
                  {chats.length === 0 && terms.length === 0 && (
                    <p className="px-3 py-1 text-[11px] text-ink-faint">Empty — start a chat or terminal.</p>
                  )}
                  {chats.map((s) => (
                    <ChatRow key={s.id} session={s} depth={0} statuses={statuses} childrenOf={childrenOf}
                      activeSessionId={activeSessionId} onOpen={openChatPane} />
                  ))}
                  {terms.map((t) => (
                    <TerminalRow key={t.id} term={t} onOpen={openTerminalPane} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      {mobileNav && <div className="absolute inset-0 z-20 bg-black/40 md:hidden" onClick={() => setMobileNav(false)} />}
      <aside className={`${mobileNav ? 'absolute inset-y-0 left-0 z-30 flex' : 'hidden'} md:relative md:z-auto md:flex`}>{Sidebar}</aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line px-2 py-1.5 md:hidden">
          <button className="btn btn-ghost px-2 py-1" onClick={() => setMobileNav(true)} aria-label="Open sidebar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          <span className="text-[13px] font-semibold">Workbench</span>
        </div>

        {groups.length === 0 ? (
          <EmptyState onNewChat={newChat} onNewTerminal={() => newTerminal()} />
        ) : (
          <div className="flex min-h-0 flex-1">
            {groups.map((g) => (
              <PaneGroupView
                key={g.id}
                group={g}
                isActive={g.id === activeGroupId}
                canSplit={groups.length < 3}
                statuses={statuses}
                sessions={sessions}
                titleFor={titleFor}
                onFocus={() => focusGroup(g.id)}
                onSelect={(pid) => setActivePane(g.id, pid)}
                onClose={(pid) => closePane(g.id, pid)}
                onSplit={(pid) => splitRight(g.id, pid)}
                onNewChat={() => newChat()}
                onNewTerminal={() => newTerminal()}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ChatRow({
  session, depth, statuses, childrenOf, activeSessionId, onOpen,
}: {
  session: Session; depth: number; statuses: Map<string, AgentStatus>;
  childrenOf: Map<string, Session[]>; activeSessionId: string | null; onOpen: (id: string) => void;
}) {
  const kids = childrenOf.get(session.id) ?? [];
  const status = statuses.get(session.id);
  const isActive = session.id === activeSessionId;
  const nested = depth > 0;
  return (
    <>
      <button
        onClick={() => onOpen(session.id)}
        className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-[12.5px] ${
          isActive ? 'bg-surface-2 font-medium' : 'text-ink-soft hover:bg-surface-2'
        }`}
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        {/* Custom hierarchy bullet — filled for top-level chats, a hollow ring for
            nested sub-agents — so nesting reads clearly without per-row icons. */}
        <span
          aria-hidden
          className={`shrink-0 rounded-full transition-colors ${
            nested
              ? `bg-transparent ring-1 ${isActive ? 'ring-ink-soft' : 'ring-ink-faint'}`
              : isActive ? 'bg-ink-soft' : 'bg-ink-faint'
          }`}
          style={{ width: nested ? 5 : 6, height: nested ? 5 : 6, marginLeft: nested ? 1 : 0 }}
        />
        <span className="min-w-0 flex-1 truncate">{session.title}</span>
        {status && <StatusDot status={status} />}
      </button>
      {kids.map((k) => (
        <ChatRow key={k.id} session={k} depth={depth + 1} statuses={statuses} childrenOf={childrenOf} activeSessionId={activeSessionId} onOpen={onOpen} />
      ))}
    </>
  );
}

function TerminalRow({ term, onOpen }: { term: TerminalInfo; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen(term.id)}
      className="flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-[12.5px] text-ink-soft hover:bg-surface-2"
      style={{ paddingLeft: 12 }}
    >
      <TerminalIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
      <span className="min-w-0 flex-1 truncate">{term.title}</span>
      {!term.running && <span className="shrink-0 text-[10px] text-red-400">exited</span>}
    </button>
  );
}

function PaneGroupView({
  group, isActive, canSplit, statuses, sessions, titleFor,
  onFocus, onSelect, onClose, onSplit, onNewChat, onNewTerminal,
}: {
  group: WbGroup; isActive: boolean; canSplit: boolean; statuses: Map<string, AgentStatus>;
  sessions: Session[]; titleFor: (p: WbPane) => string;
  onFocus: () => void; onSelect: (paneId: string) => void; onClose: (paneId: string) => void;
  onSplit: (paneId: string) => void; onNewChat: () => void; onNewTerminal: () => void;
}) {
  const active = group.panes.find((p) => p.id === group.activeId) ?? group.panes[0];
  return (
    <div className={`flex min-w-0 flex-1 flex-col border-r border-line ${isActive ? '' : 'opacity-95'}`} onMouseDown={onFocus}>
      {/* Tab strip */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-1.5 py-1" style={{ background: 'var(--surface-2)' }}>
        {group.panes.map((p) => {
          const isActiveTab = p.id === active?.id;
          const status = p.kind === 'chat' ? statuses.get(p.refId) : undefined;
          return (
            <div
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] ${
                isActiveTab ? 'bg-paper font-medium shadow-sm' : 'text-ink-soft hover:bg-paper/50'
              }`}
              style={isActiveTab ? { background: 'var(--paper)' } : undefined}
            >
              {p.kind === 'terminal' ? <TerminalIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" /> : <ChatIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />}
              <span className="max-w-[140px] truncate">{titleFor(p)}</span>
              {status && <StatusDot status={status} />}
              <button
                className="ml-0.5 rounded p-0.5 text-ink-faint opacity-0 hover:text-ink group-hover:opacity-100"
                title="Close tab"
                onClick={(e) => { e.stopPropagation(); onClose(p.id); }}
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-1">
          <button className="rounded p-1 text-ink-faint hover:text-ink" title="New chat" onClick={onNewChat}><PlusIcon className="h-3.5 w-3.5" /></button>
          <button className="rounded p-1 text-ink-faint hover:text-ink" title="New terminal" onClick={onNewTerminal}><TerminalIcon className="h-3.5 w-3.5" /></button>
          {canSplit && group.panes.length > 1 && active && (
            <button className="rounded p-1 text-ink-faint hover:text-ink" title="Split tab to the right" onClick={() => onSplit(active.id)}><SplitIcon className="h-3.5 w-3.5" /></button>
          )}
        </div>
      </div>
      {/* Active pane */}
      <div className="min-h-0 flex-1">
        {active ? (
          active.kind === 'chat'
            ? <ChatPane key={active.refId} sessionId={active.refId} />
            : <TerminalPane key={active.refId} terminalId={active.refId} />
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ onNewChat, onNewTerminal }: { onNewChat: () => void; onNewTerminal: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl text-3xl" style={{ background: 'var(--accent-soft)' }}>🐾</div>
      <div>
        <h2 className="text-lg font-semibold">Your workbench is empty</h2>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-faint">Open a chat to drive an agent, or a terminal to run commands. Open several and split them side by side.</p>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={onNewChat}><ChatIcon className="h-4 w-4" /> New chat</button>
        <button className="btn btn-outline" onClick={onNewTerminal}><TerminalIcon className="h-4 w-4" /> New terminal</button>
      </div>
    </div>
  );
}
