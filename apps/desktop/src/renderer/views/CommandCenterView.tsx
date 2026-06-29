import React, { useEffect, useMemo, useState } from 'react';
import type { AgentEvent, ProviderConfig, Session, TerminalInfo, UsageSummary, AutomationTask } from '@open-paw/shared';
import type { RemoteStatus } from '@open-paw/shared';
import { estimateCostUSD, formatUSD, optimizationTips, MODEL_PRICING, taskCadence } from '@open-paw/shared';
import type { OptimizationTip } from '@open-paw/shared';
import { useStore } from '../store.js';
import { Markdown } from '../components/Markdown.js';
import { ChatIcon, FolderIcon, ServerIcon, PlusIcon, CheckIcon, TerminalIcon, RobotIcon, TrashIcon } from '../icons.js';

const LOCAL_KINDS = ['ollama', 'lmstudio', 'vllm', 'openai-compat'];
const MIN = 60_000;
const HOUR = 60 * MIN;

type Lane = 'active' | 'recent' | 'idle';
const LANES: Array<{ key: Lane; label: string; color: string; hint: string }> = [
  { key: 'active', label: 'Active', color: '#4ec98a', hint: 'touched in the last 15 min' },
  { key: 'recent', label: 'Recent', color: '#e0a44a', hint: 'earlier today' },
  { key: 'idle', label: 'Idle', color: '#8a8f98', hint: 'older' },
];

function laneOf(s: Session, now: number): Lane {
  const age = now - s.updatedAt;
  if (age < 15 * MIN) return 'active';
  if (age < 24 * HOUR) return 'recent';
  return 'idle';
}

export function CommandCenterView() {
  const { sessions, terminals, providers, settings, setView, newChat, openChatPane, openTerminalPane, newTerminal, setActiveWorkspace, refreshSessions, refreshTerminals } = useStore();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);
  const now = Date.now();

  useEffect(() => {
    window.nekko.getUsageSummary().then(setUsage);
    refreshSessions();
    refreshTerminals();
  }, [refreshSessions, refreshTerminals]);

  // Track running sessions live; surface freshly spawned sub-agents.
  useEffect(() => {
    const known = new Set(sessions.map((s) => s.id));
    const off = window.nekko.onAgentEvent((e: AgentEvent) => {
      if (e.type === 'done' || e.type === 'error') {
        setRunning((r) => { const n = new Set(r); n.delete(e.sessionId); return n; });
        window.nekko.getUsageSummary().then(setUsage);
      } else {
        setRunning((r) => (r.has(e.sessionId) ? r : new Set(r).add(e.sessionId)));
      }
      if (!known.has(e.sessionId)) { known.add(e.sessionId); refreshSessions(); }
    });
    return off;
  }, [sessions, refreshSessions]);

  // Tick once a second so elapsed timers update while work is in flight.
  useEffect(() => {
    if (running.size === 0) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running.size]);

  const childrenOf = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of sessions) if (s.parentSessionId) m.set(s.parentSessionId, [...(m.get(s.parentSessionId) ?? []), s]);
    return m;
  }, [sessions]);

  const recentSession = sessions.find((s) => !s.parentSessionId);
  const recentWorkspace = settings?.workspaces?.[0];
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayTokens = usage?.daily.find((d) => d.date === todayKey);
  const tokensToday = todayTokens ? todayTokens.input + todayTokens.output : 0;

  // The prominent board: anything running, then anything touched recently. Top-
  // level sessions only (sub-agents are shown nested on their parent's card).
  const board = useMemo(() => {
    const top = sessions.filter((s) => !s.parentSessionId);
    return top
      .map((s) => ({ s, isRunning: running.has(s.id) || (childrenOf.get(s.id) ?? []).some((k) => running.has(k.id)) }))
      .filter(({ s, isRunning }) => isRunning || now - s.updatedAt < 60 * MIN)
      .sort((a, b) => (Number(b.isRunning) - Number(a.isRunning)) || b.s.updatedAt - a.s.updatedAt)
      .slice(0, 8);
  }, [sessions, running, childrenOf, now]);

  const openChat = (id: string) => { openChatPane(id); setView('chat'); };
  const openTerminal = (id: string) => { openTerminalPane(id); setView('chat'); };

  const lanes = useMemo(() => {
    const m: Record<Lane, Session[]> = { active: [], recent: [], idle: [] };
    for (const s of sessions.filter((x) => !x.parentSessionId)) m[laneOf(s, now)].push(s);
    return m;
  }, [sessions, now]);

  const totalCost = usage?.totalCost ?? 0;
  const liveTerminals = terminals.filter((t) => t.running).length;
  const stats = [
    { label: 'Running agents', value: running.size, color: '#4ec98a' },
    { label: 'Live terminals', value: liveTerminals, color: '#5b8def' },
    { label: 'Tokens today', value: tokensToday.toLocaleString(), color: '#c08adb' },
    { label: 'Cost (est.)', value: formatUSD(totalCost), color: '#e0a44a' },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-gradient text-2xl font-semibold">Command Center</h1>
            <p className="mt-1.5 text-[13px] text-ink-faint">Everything in flight, at a glance.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-outline" onClick={() => { newTerminal(); }}><TerminalIcon className="h-4 w-4" /> Terminal</button>
            <button className="btn btn-primary" onClick={() => { newChat(); }}><PlusIcon className="h-4 w-4" /> New chat</button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="card relative overflow-hidden p-5">
              <span className="absolute left-0 top-0 h-full w-1" style={{ background: s.color }} />
              <div className="text-[26px] font-semibold leading-none tracking-tight">{s.value}</div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-faint">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* THE BOARD — prominent live agent work */}
        <div className="mt-7 flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">Active agent work</h2>
          {running.size > 0 && (
            <span className="chip !text-white" style={{ background: '#4ec98a' }}>
              <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white align-middle" />{running.size} running
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] text-ink-faint">Live status of every agent and its sub-agents. Open one to take over, or stop a run.</p>
        {board.length === 0 ? (
          <div className="card mt-3 p-6 text-center text-[13px] text-ink-faint">
            No agent work in flight. <button className="text-accent hover:underline" onClick={() => newChat()}>Start a chat</button> to kick one off.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {board.map(({ s, isRunning }) => (
              <AgentCard
                key={s.id}
                session={s}
                provider={providers.find((p) => p.id === s.providerId)}
                childrenOf={childrenOf}
                running={running}
                isRunning={isRunning}
                tokens={usage?.bySession[s.id]}
                now={now}
                onOpen={openChat}
              />
            ))}
          </div>
        )}

        {/* Optimization insights */}
        <OptimizePanel usage={usage} sessions={sessions} providers={providers} onOpenModels={() => setView('models')} />

        {/* Terminals */}
        {terminals.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[15px] font-semibold">Terminals</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              {terminals.map((t) => (
                <TerminalCard key={t.id} term={t} workspaceName={settings?.workspaces.find((w) => w.id === t.workspaceId)?.name} onOpen={openTerminal} />
              ))}
            </div>
          </section>
        )}

        {/* Quick suggestions */}
        <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
          {recentWorkspace && (
            <Suggestion icon={<FolderIcon className="h-4 w-4" />} title={`Continue ${recentWorkspace.name}`} sub="New chat scoped to this project"
              onClick={() => { setActiveWorkspace(recentWorkspace.id); newChat(); }} />
          )}
          {recentSession && (
            <Suggestion icon={<ChatIcon className="h-4 w-4" />} title={`Respond to “${recentSession.title}”`} sub="Pick up your most recent conversation"
              onClick={() => openChat(recentSession.id)} />
          )}
          <Suggestion icon={<TerminalIcon className="h-4 w-4" />} title="Open a terminal" sub="Run commands in Warp-style blocks" onClick={() => newTerminal()} />
        </div>

        {/* Full backlog as lanes (secondary) */}
        <h2 className="mt-8 text-[15px] font-semibold">All chats</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          {LANES.map((lane) => (
            <div key={lane.key}>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: lane.color }} />
                <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">{lane.label}</span>
                <span className="chip">{lanes[lane.key].length}</span>
              </div>
              <div className="space-y-2">
                {lanes[lane.key].length === 0 && <p className="px-1 text-[11px] text-ink-faint">{`Nothing ${lane.hint}.`}</p>}
                {lanes[lane.key].map((s) => (
                  <KanbanCard key={s.id} session={s} provider={providers.find((p) => p.id === s.providerId)} laneColor={lane.color}
                    expanded={expanded === s.id} onToggle={() => setExpanded(expanded === s.id ? null : s.id)} onOpen={() => openChat(s.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Tasks & scheduled work */}
        <TasksDashboard sessions={sessions} running={running} onOpen={openChat} />

        {/* Cost */}
        <CostPanel usage={usage} sessions={sessions} providers={providers} />

        {/* Services & model servers */}
        <WorkersDashboard providers={providers} usage={usage} />

        {/* Token usage */}
        <UsagePanel usage={usage} />
      </div>
    </div>
  );
}

function relTime(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Count every descendant sub-agent under a session (the whole subtree). */
function countDescendants(id: string, childrenOf: Map<string, Session[]>): number {
  const kids = childrenOf.get(id) ?? [];
  return kids.reduce((n, k) => n + 1 + countDescendants(k.id, childrenOf), 0);
}

/** Recursive sub-agent tree — the swarm under one agent, nested by parentage. */
function SubAgentTree({
  parentId, childrenOf, running, onOpen, depth = 0,
}: {
  parentId: string; childrenOf: Map<string, Session[]>; running: Set<string>;
  onOpen: (id: string) => void; depth?: number;
}) {
  const kids = childrenOf.get(parentId) ?? [];
  if (kids.length === 0) return null;
  return (
    <div className={depth > 0 ? 'ml-3 border-l border-line pl-2' : 'space-y-0.5'}>
      {kids.map((k) => {
        const live = running.has(k.id);
        const grandkids = countDescendants(k.id, childrenOf);
        return (
          <div key={k.id}>
            <button
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] hover:bg-surface-2"
              onClick={() => onOpen(k.id)}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${live ? 'animate-pulse bg-accent' : 'bg-ink-faint'}`} />
              <span className="min-w-0 flex-1 truncate text-ink-soft">{k.title}</span>
              {grandkids > 0 && <span className="shrink-0 text-[10px] text-ink-faint">{grandkids}↳</span>}
              {live && <span className="shrink-0 text-[10px] text-accent">live</span>}
            </button>
            <SubAgentTree parentId={k.id} childrenOf={childrenOf} running={running} onOpen={onOpen} depth={depth + 1} />
          </div>
        );
      })}
    </div>
  );
}

function AgentCard({
  session, provider, childrenOf, running, isRunning, tokens, now, onOpen,
}: {
  session: Session; provider?: ProviderConfig; childrenOf: Map<string, Session[]>; running: Set<string>;
  isRunning: boolean; tokens?: { input: number; output: number }; now: number; onOpen: (id: string) => void;
}) {
  const msgs = session.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  const lastAssistant = [...session.messages].reverse().find((m) => m.role === 'assistant' && m.content.trim());
  const tok = tokens ? tokens.input + tokens.output : 0;
  const swarmSize = countDescendants(session.id, childrenOf);
  const liveSwarm = (function tally(id): number {
    return (childrenOf.get(id) ?? []).reduce((n, k) => n + (running.has(k.id) ? 1 : 0) + tally(k.id), 0);
  })(session.id);
  return (
    <div className={`card overflow-hidden p-4 ${isRunning ? 'border-accent' : ''}`} style={isRunning ? { boxShadow: '0 0 0 1px var(--accent)' } : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isRunning ? 'animate-pulse' : ''}`} style={{ background: isRunning ? '#4ec98a' : '#8a8f98' }} />
          <span className="truncate text-[14px] font-semibold">{session.title}</span>
        </div>
        <span className="shrink-0 text-[11px] text-ink-faint">{isRunning ? 'working…' : relTime(now - session.updatedAt)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] text-ink-faint">
        <span className="chip">{provider?.label ?? 'no model'}</span>
        {session.modelId && <span className="chip max-w-[140px] truncate">{session.modelId}</span>}
        <span className="chip">{msgs.length} msg{msgs.length === 1 ? '' : 's'}</span>
        {tok > 0 && <span className="chip">{tok.toLocaleString()} tok</span>}
        {session.mode && <span className="chip">{session.mode}</span>}
        {session.incognito && <span className="chip">🕶</span>}
      </div>

      {lastAssistant && (
        <p className="mt-2 line-clamp-2 text-[12px] text-ink-soft">{lastAssistant.content.slice(0, 180)}</p>
      )}

      {swarmSize > 0 && (
        <div className="mt-2.5 border-t border-line pt-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-ink-faint">
            <RobotIcon className="h-3.5 w-3.5" /> swarm · {swarmSize} agent{swarmSize === 1 ? '' : 's'}
            {liveSwarm > 0 && <span className="text-accent">· {liveSwarm} live</span>}
          </div>
          <SubAgentTree parentId={session.id} childrenOf={childrenOf} running={running} onOpen={onOpen} />
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        {isRunning && (
          <button className="btn btn-outline py-1.5 text-[12px]" onClick={() => window.nekko.abortChat(session.id)}>Stop</button>
        )}
        <button className="btn btn-primary py-1.5 text-[12px]" onClick={() => onOpen(session.id)}>Open →</button>
      </div>
    </div>
  );
}

function TerminalCard({ term, workspaceName, onOpen }: { term: TerminalInfo; workspaceName?: string; onOpen: (id: string) => void }) {
  return (
    <button className="card p-4 text-left transition-colors hover:border-accent" onClick={() => onOpen(term.id)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4 text-ink-faint" />
          <span className="text-[13px] font-medium">{term.title}</span>
        </div>
        <StatusPill state={term.running ? 'online' : 'offline'} onlineLabel="live" offlineLabel="exited" />
      </div>
      <div className="mt-2 truncate font-mono text-[11px] text-ink-faint">{term.cwd}</div>
      {workspaceName && <div className="mt-0.5 text-[11px] text-ink-faint">{workspaceName}</div>}
    </button>
  );
}

function Suggestion({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button className="card p-4 text-left transition-colors hover:border-accent" onClick={onClick}>
      <div className="flex items-center gap-2 text-accent">{icon}<span className="text-[13px] font-semibold text-ink">{title}</span></div>
      <p className="mt-1 text-[12px] text-ink-faint">{sub}</p>
    </button>
  );
}

function KanbanCard({
  session,
  provider,
  laneColor,
  expanded,
  onToggle,
  onOpen,
}: {
  session: Session;
  provider?: ProviderConfig;
  laneColor: string;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const msgs = session.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  return (
    <div className={`card overflow-hidden ${expanded ? 'border-accent' : ''}`}>
      <button className="w-full p-3 text-left" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: laneColor }} />
          <span className="truncate text-[13px] font-medium">{session.title}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-ink-faint">
          <span className="chip">{provider?.label ?? 'no model'}</span>
          {session.modelId && <span className="chip truncate max-w-[120px]">{session.modelId}</span>}
          <span>{msgs.length} msg{msgs.length === 1 ? '' : 's'}</span>
          {session.incognito && <span className="chip">🕶</span>}
          {session.offline && <span className="chip">✈</span>}
        </div>
      </button>

      {expanded && (
        <div className="fade-in border-t border-line">
          <div className="max-h-72 space-y-2 overflow-y-auto p-3">
            {msgs.length === 0 && <p className="text-[12px] text-ink-faint">No messages yet.</p>}
            {msgs.slice(-8).map((m, i) => (
              <div key={m.id + i} className={`text-[12.5px] ${m.role === 'user' ? 'text-ink' : 'text-ink-soft'}`}>
                <span className="mr-1.5 text-[10px] uppercase text-ink-faint">{m.role === 'user' ? 'you' : 'nekko'}</span>
                {m.role === 'assistant' ? (
                  <div className="mt-0.5"><Markdown text={m.content.slice(0, 600)} /></div>
                ) : (
                  <span className="whitespace-pre-wrap">{m.content.slice(0, 600)}</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end border-t border-line p-2">
            <button className="btn btn-primary py-1.5 text-[12px]" onClick={onOpen}>Open in Chat →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkersDashboard({ providers, usage }: { providers: ProviderConfig[]; usage: UsageSummary | null }) {
  const [remote, setRemote] = useState<RemoteStatus | null>(null);
  const [mcp, setMcp] = useState<import('@open-paw/shared').McpServerStatus[]>([]);
  useEffect(() => { window.nekko.getRemoteStatus().then(setRemote).catch(() => setRemote(null)); }, []);
  useEffect(() => { window.nekko.getMcpStatus().then(setMcp).catch(() => setMcp([])); }, []);
  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-semibold">Services &amp; model servers</h2>
      <p className="mt-0.5 text-[12px] text-ink-faint">Model providers, MCP servers, and the remote relay, with live status.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <RemoteCard remote={remote} />
        {providers.map((p) => (
          <WorkerCard key={p.id} provider={p} tokens={usage?.byProvider[p.id]} />
        ))}
        {mcp.map((m) => (
          <div key={m.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🔌</span>
                <span className="text-[13px] font-medium">{m.name}</span>
                <span className="chip">MCP</span>
              </div>
              <StatusPill state={m.connected ? 'online' : 'offline'} />
            </div>
            <p className="mt-2 text-[12px] text-ink-faint">
              {m.connected ? `${m.tools.length} tool${m.tools.length === 1 ? '' : 's'} available` : m.error ?? 'Not connected'}
            </p>
          </div>
        ))}
        {providers.length === 0 && mcp.length === 0 && (
          <div className="card p-4 text-[12px] text-ink-faint">No model providers yet — add one in Models.</div>
        )}
      </div>
    </section>
  );
}

function WorkerCard({ provider, tokens }: { provider: ProviderConfig; tokens?: { input: number; output: number } }) {
  const [state, setState] = useState<'checking' | 'online' | 'offline'>('checking');
  useEffect(() => {
    window.nekko.testProvider(provider.id).then((r) => setState(r.ok ? 'online' : 'offline')).catch(() => setState('offline'));
  }, [provider.id]);
  const total = tokens ? tokens.input + tokens.output : 0;
  const isLocal = LOCAL_KINDS.includes(provider.kind);
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ServerIcon className="h-4 w-4 text-ink-faint" />
          <span className="text-[13px] font-medium">{provider.label}</span>
          <span className="chip">{isLocal ? 'local' : 'cloud'}</span>
        </div>
        <StatusPill state={state} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[12px] text-ink-faint">
        <span className="font-mono">{provider.baseUrl}</span>
        <span>{total.toLocaleString()} tok</span>
      </div>
    </div>
  );
}

function RemoteCard({ remote }: { remote: RemoteStatus | null }) {
  const online = !!remote?.enabled;
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📱</span>
          <span className="text-[13px] font-medium">Remote relay</span>
        </div>
        <StatusPill state={online ? 'online' : 'offline'} onlineLabel="enabled" offlineLabel="off" />
      </div>
      <p className="mt-2 text-[12px] text-ink-faint">
        {online ? 'Your phone can reach this machine’s model over an encrypted relay.' : 'Enable in Settings → Remote access to drive your local model from anywhere.'}
      </p>
    </div>
  );
}

function StatusPill({ state, onlineLabel = 'online', offlineLabel = 'offline' }: { state: 'checking' | 'online' | 'offline'; onlineLabel?: string; offlineLabel?: string }) {
  if (state === 'checking') return <span className="chip">checking…</span>;
  const online = state === 'online';
  return (
    <span className="chip !text-white" style={{ background: online ? '#4ec98a' : '#8a8f98' }}>
      {online && <CheckIcon className="h-3 w-3" />} {online ? onlineLabel : offlineLabel}
    </span>
  );
}

const TIP_STYLE: Record<OptimizationTip['severity'], { color: string; icon: string; label: string }> = {
  warn: { color: '#e0a44a', icon: '!', label: 'Heads up' },
  suggest: { color: '#4ec98a', icon: '↳', label: 'Suggestion' },
  info: { color: '#5b9dd9', icon: 'i', label: 'Insight' },
};

function OptimizePanel({
  usage, sessions, providers, onOpenModels,
}: {
  usage: UsageSummary | null; sessions: Session[]; providers: ProviderConfig[]; onOpenModels: () => void;
}) {
  const tips = useMemo(() => optimizationTips({ usage, sessions, providers }), [usage, sessions, providers]);
  if (tips.length === 0) return null;
  const totalSaving = tips.reduce((s, t) => s + (t.saving ?? 0), 0);
  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold">Optimize</h2>
        {totalSaving > 0.01 && <span className="chip">~{formatUSD(totalSaving)} potential savings</span>}
      </div>
      <p className="mt-0.5 text-[12px] text-ink-faint">Ways to cut token spend and run leaner, from your own usage.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {tips.map((t) => {
          const st = TIP_STYLE[t.severity];
          return (
            <div key={t.id} className="card flex gap-3 p-4">
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: st.color }}
                title={st.label}
              >
                {st.icon}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold">{t.title}</span>
                  {t.saving && t.saving > 0.01 && <span className="chip">~{formatUSD(t.saving)}</span>}
                </div>
                <p className="mt-0.5 text-[12px] text-ink-soft">{t.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
      <button className="mt-3 text-[12px] text-accent hover:underline" onClick={onOpenModels}>
        Manage models & providers →
      </button>
    </section>
  );
}

function UsagePanel({ usage }: { usage: UsageSummary | null }) {
  if (!usage) return null;
  const max = Math.max(1, ...usage.daily.map((d) => d.input + d.output));
  return (
    <section className="card mt-8 p-5">
      <h2 className="text-[15px] font-semibold">Token usage</h2>
      <div className="mt-3 flex gap-6 text-[13px]">
        <div><span className="text-ink-faint">Input</span> <span className="font-semibold">{usage.totalInput.toLocaleString()}</span></div>
        <div><span className="text-ink-faint">Output</span> <span className="font-semibold">{usage.totalOutput.toLocaleString()}</span></div>
      </div>
      {usage.daily.length > 0 ? (
        <div className="mt-4 flex h-32 items-end gap-1">
          {usage.daily.slice(-30).map((d) => (
            <div key={d.date} className="flex flex-1 flex-col justify-end" title={`${d.date}: ${(d.input + d.output).toLocaleString()} tok`}>
              <div className="rounded-t" style={{ height: `${((d.input + d.output) / max) * 100}%`, background: 'var(--accent)', minHeight: 2 }} />
            </div>
          ))}
        </div>
      ) : (
        <ChartEmpty message="No usage recorded yet — start a chat to see token analytics here." />
      )}
      {Object.keys(usage.byModel).length > 0 && (
        <div className="mt-4 space-y-1">
          {Object.entries(usage.byModel).map(([model, v]) => (
            <div key={model} className="flex justify-between gap-3 text-[12px]">
              <span className="truncate font-mono text-ink-soft">{model}</span>
              <span className="shrink-0 text-ink-faint">
                {(v.input + v.output).toLocaleString()} tok
                <span className="ml-2 text-ink">{formatUSD(estimateCostUSD(model, v.input, v.output))}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** A friendly skeleton placeholder for a chart with no data yet. */
function ChartEmpty({ message, bars = 12 }: { message: string; bars?: number }) {
  // Deterministic pseudo-random heights so the skeleton looks like a chart.
  const heights = Array.from({ length: bars }, (_, i) => 30 + ((i * 37) % 60));
  return (
    <div className="mt-4 rounded-xl border border-dashed border-line p-4">
      <div className="flex h-24 items-end gap-1 opacity-40">
        {heights.map((h, i) => (
          <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: 'var(--ink-faint)' }} />
        ))}
      </div>
      <p className="mt-3 text-center text-[12px] text-ink-faint">{message}</p>
    </div>
  );
}

/** Cost breakdowns: monthly actual + projection, per-agent, per-model, and pricing. */
function CostPanel({ usage, sessions, providers }: { usage: UsageSummary | null; sessions: Session[]; providers: ProviderConfig[] }) {
  const titleOf = (id: string) => sessions.find((s) => s.id === id)?.title ?? 'Chat';
  const hasData = !!usage && (usage.totalCost ?? 0) > 0.0000001;

  // This month's actual + a simple linear projection to month-end.
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthDaily = (usage?.daily ?? []).filter((d) => d.date.startsWith(monthKey));
  const monthActual = monthDaily.reduce((s, d) => s + (d.cost ?? 0), 0);
  const dayOfMonth = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projected = dayOfMonth > 0 ? (monthActual / dayOfMonth) * daysInMonth : monthActual;

  const topAgents = useMemo(() => {
    return Object.entries(usage?.bySessionCost ?? {})
      .filter(([, c]) => c > 0.0000001)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [usage]);
  const maxAgent = Math.max(0.0001, ...topAgents.map(([, c]) => c));

  const recentCost = (usage?.daily ?? []).slice(-30);
  const maxDayCost = Math.max(0.0001, ...recentCost.map((d) => d.cost ?? 0));

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold">Cost</h2>
        <span className="chip" title="Estimated from published provider list prices; local models are $0.">est. · list prices</span>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-faint">Spend by agent and model, monthly actuals + projection. Local models are free.</p>

      {!hasData ? (
        <ChartEmpty message="No spend yet. Once you run a cloud model, monthly spend, projections, and per-agent costs show up here." />
      ) : (
        <>
          {/* Monthly actual + projection */}
          <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="card p-4">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">This month</div>
              <div className="mt-1 text-[22px] font-semibold">{formatUSD(monthActual)}</div>
              <div className="text-[11px] text-ink-faint">actual, {dayOfMonth}/{daysInMonth} days</div>
            </div>
            <div className="card p-4">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">Projected</div>
              <div className="mt-1 text-[22px] font-semibold">{formatUSD(projected)}</div>
              <div className="text-[11px] text-ink-faint">at this pace, month-end</div>
            </div>
            <div className="card p-4">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">All time</div>
              <div className="mt-1 text-[22px] font-semibold">{formatUSD(usage!.totalCost ?? 0)}</div>
              <div className="text-[11px] text-ink-faint">{(usage!.totalInput + usage!.totalOutput).toLocaleString()} tok</div>
            </div>
          </div>

          {/* Daily spend chart */}
          <div className="card mt-4 p-4">
            <div className="text-[12px] font-medium">Daily spend (last 30 days)</div>
            <div className="mt-3 flex h-24 items-end gap-1">
              {recentCost.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col justify-end" title={`${d.date}: ${formatUSD(d.cost ?? 0)}`}>
                  <div className="rounded-t" style={{ height: `${((d.cost ?? 0) / maxDayCost) * 100}%`, background: '#e0a44a', minHeight: (d.cost ?? 0) > 0 ? 2 : 0 }} />
                </div>
              ))}
            </div>
          </div>

          {/* Per-agent breakdown */}
          {topAgents.length > 0 && (
            <div className="card mt-4 p-4">
              <div className="text-[12px] font-medium">By agent</div>
              <div className="mt-2 space-y-2">
                {topAgents.map(([sid, cost]) => (
                  <div key={sid}>
                    <div className="flex justify-between gap-3 text-[12px]">
                      <span className="truncate text-ink-soft">{titleOf(sid)}</span>
                      <span className="shrink-0 text-ink">{formatUSD(cost)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
                      <div className="h-full rounded-full" style={{ width: `${(cost / maxAgent) * 100}%`, background: 'var(--accent)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Pricing reference — token/$ estimates */}
      <details className="card mt-4 p-4">
        <summary className="cursor-pointer text-[12px] font-medium">Token pricing reference (USD per 1M tokens)</summary>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-3">
          {MODEL_PRICING.map((p) => (
            <div key={p.match} className="flex justify-between gap-2 text-[11.5px]">
              <span className="font-mono text-ink-soft">{p.match}</span>
              <span className="text-ink-faint">in ${p.input} · out ${p.output}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">Published list prices, matched by model id. Estimates only — your billed amount may differ. Local models (Ollama / LM Studio / vLLM) cost $0.</p>
      </details>
    </section>
  );
}

const TASK_KIND_META: Record<AutomationTask['kind'], { icon: string; label: string }> = {
  scheduled: { icon: '⏰', label: 'Scheduled' },
  recurring: { icon: '🔁', label: 'Recurring' },
  background: { icon: '♾️', label: 'Background' },
};
const TASK_STATUS_COLOR: Record<AutomationTask['status'], string> = {
  active: '#4ec98a', paused: '#8a8f98', done: '#5b9dd9', error: '#e0574a',
};

/** Scheduled / recurring / background automation tasks + long-running agents. */
function TasksDashboard({ sessions, running, onOpen }: { sessions: Session[]; running: Set<string>; onOpen: (id: string) => void }) {
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  useEffect(() => {
    window.nekko.listTasks().then(setTasks).catch(() => setTasks([]));
    const off = window.nekko.onTasksUpdated(setTasks);
    return off;
  }, []);

  const sorted = [...tasks].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.createdAt - a.createdAt);

  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-semibold">Tasks &amp; scheduled work</h2>
      <p className="mt-0.5 text-[12px] text-ink-faint">Scheduled, recurring, and long-running background agents. Create one from a chat's ⚡ menu.</p>
      {sorted.length === 0 ? (
        <div className="card mt-3 p-6 text-center text-[13px] text-ink-faint">
          No scheduled or background tasks yet. Open a chat and use the <span className="font-medium">⚡ Automate</span> menu to schedule a run, repeat it, or keep an agent working in the background.
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {sorted.map((t) => {
            const meta = TASK_KIND_META[t.kind];
            const live = !!t.lastSessionId && running.has(t.lastSessionId);
            return (
              <div key={t.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-base">{meta.icon}</span>
                    <span className="truncate text-[14px] font-semibold">{t.title}</span>
                  </div>
                  <span className="chip !text-white shrink-0" style={{ background: TASK_STATUS_COLOR[t.status] }}>
                    {live ? <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white align-middle" /> : null}
                    {live ? 'working' : t.status}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-ink-faint">
                  <span className="chip">{meta.label}</span>
                  <span className="chip">{taskCadence(t)}</span>
                  {t.runCount > 0 && <span className="chip">{t.runCount} run{t.runCount === 1 ? '' : 's'}</span>}
                  {t.lastRunAt && <span>last {relTime(Date.now() - t.lastRunAt)}</span>}
                </div>
                {t.lastResult && <p className="mt-2 line-clamp-2 text-[12px] text-ink-soft">{t.lastResult}</p>}
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {t.status !== 'done' && (
                    <button className="btn btn-ghost py-1 text-[12px]" onClick={() => window.nekko.runTaskNow(t.id)}>Run now</button>
                  )}
                  {t.status === 'active' ? (
                    <button className="btn btn-ghost py-1 text-[12px]" onClick={() => window.nekko.updateTask(t.id, { status: 'paused' })}>Pause</button>
                  ) : t.status === 'paused' ? (
                    <button className="btn btn-ghost py-1 text-[12px]" onClick={() => window.nekko.updateTask(t.id, { status: 'active' })}>Resume</button>
                  ) : null}
                  {t.lastSessionId && (
                    <button className="btn btn-outline py-1 text-[12px]" onClick={() => onOpen(t.lastSessionId!)}>Open chat →</button>
                  )}
                  <button className="rounded p-1.5 text-ink-faint hover:text-red-400" title="Delete task" onClick={() => window.nekko.deleteTask(t.id)}><TrashIcon className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
