import React, { useEffect, useMemo, useState } from 'react';
import type { AgentEvent, Session, TerminalInfo, WorkspaceFolder } from '@open-paw/shared';
import { useStore, type WbGroup, type WbPane } from '../store.js';
import { ChatPane } from '../components/ChatPane.js';
import { TerminalPane } from '../components/TerminalPane.js';
import { ChatIcon, TerminalIcon, PlusIcon, SplitIcon, CloseIcon, RobotIcon, FolderIcon } from '../icons.js';

/**
 * The workbench: a Warp/Devin-style multi-pane surface. The left sidebar groups
 * work by project (chats, terminals, and nested sub-agents); the center hosts
 * tabbed panes that can be split side by side so many agents and terminals run
 * at once.
 */
export function WorkbenchView() {
  const {
    sessions, terminals, groups, activeGroupId, settings, activeSessionId,
    refreshSessions, refreshTerminals, openChatPane, openTerminalPane, newTerminal,
    setActivePane, closePane, focusGroup, splitRight, newChat, setActiveWorkspace,
  } = useStore();

  const [running, setRunning] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => { refreshTerminals(); }, [refreshTerminals]);

  // Open the active session as a pane if the workbench is empty (e.g. arriving
  // from the Command Center or command palette).
  useEffect(() => {
    if (groups.length === 0 && activeSessionId) openChatPane(activeSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track which sessions are mid-run (for sidebar/tab activity dots) and surface
  // freshly spawned sub-agents by refreshing the list when an unknown id appears.
  useEffect(() => {
    const known = new Set(sessions.map((s) => s.id));
    const off = window.nekko.onAgentEvent((e: AgentEvent) => {
      if (e.type === 'done' || e.type === 'error') {
        setRunning((r) => { const n = new Set(r); n.delete(e.sessionId); return n; });
      } else {
        setRunning((r) => (r.has(e.sessionId) ? r : new Set(r).add(e.sessionId)));
      }
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
        <button className="btn btn-ghost px-2 py-1" title="New chat" onClick={() => newChat()}><PlusIcon /></button>
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
                    <ChatRow key={s.id} session={s} depth={0} running={running} childrenOf={childrenOf}
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
                running={running}
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
  session, depth, running, childrenOf, activeSessionId, onOpen,
}: {
  session: Session; depth: number; running: Set<string>;
  childrenOf: Map<string, Session[]>; activeSessionId: string | null; onOpen: (id: string) => void;
}) {
  const kids = childrenOf.get(session.id) ?? [];
  const isRunning = running.has(session.id);
  return (
    <>
      <button
        onClick={() => onOpen(session.id)}
        className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-[12.5px] ${
          session.id === activeSessionId ? 'bg-surface-2 font-medium' : 'text-ink-soft hover:bg-surface-2'
        }`}
        style={{ paddingLeft: 12 + depth * 14 }}
      >
        {depth > 0 ? <RobotIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" /> : <ChatIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />}
        <span className="min-w-0 flex-1 truncate">{session.title}</span>
        {isRunning && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" title="Running" />}
      </button>
      {kids.map((k) => (
        <ChatRow key={k.id} session={k} depth={depth + 1} running={running} childrenOf={childrenOf} activeSessionId={activeSessionId} onOpen={onOpen} />
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
  group, isActive, canSplit, running, sessions, titleFor,
  onFocus, onSelect, onClose, onSplit, onNewChat, onNewTerminal,
}: {
  group: WbGroup; isActive: boolean; canSplit: boolean; running: Set<string>;
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
          const isRunning = p.kind === 'chat' && running.has(p.refId);
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
              {isRunning && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
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
