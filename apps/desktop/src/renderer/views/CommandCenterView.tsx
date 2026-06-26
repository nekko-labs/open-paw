import React, { useEffect, useMemo, useState } from 'react';
import type { AgentEvent, ProviderConfig, Session, TerminalInfo, UsageSummary } from '@open-paw/shared';
import type { RemoteStatus } from '@open-paw/shared';
import { estimateCostUSD, formatUSD } from '@open-paw/shared';
import { useStore } from '../store.js';
import { Markdown } from '../components/Markdown.js';
import { ChatIcon, FolderIcon, ServerIcon, PlusIcon, CheckIcon, TerminalIcon, RobotIcon } from '../icons.js';

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

  const totalCost = usage
    ? Object.entries(usage.byModel).reduce((sum, [model, v]) => sum + estimateCostUSD(model, v.input, v.output), 0)
    : 0;
  const liveTerminals = terminals.filter((t) => t.running).length;
  const stats = [
    { label: 'Running agents', value: running.size },
    { label: 'Live terminals', value: liveTerminals },
    { label: 'Tokens today', value: tokensToday.toLocaleString() },
    { label: 'Cost (est.)', value: formatUSD(totalCost) },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Command Center</h1>
            <p className="mt-1 text-[13px] text-ink-faint">Everything in flight, at a glance.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-outline" onClick={() => { newTerminal(); }}><TerminalIcon className="h-4 w-4" /> Terminal</button>
            <button className="btn btn-primary" onClick={() => { newChat(); }}><PlusIcon className="h-4 w-4" /> New chat</button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="card p-4">
              <div className="text-2xl font-semibold">{s.value}</div>
              <div className="mt-0.5 text-[12px] text-ink-faint">{s.label}</div>
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
                subAgents={childrenOf.get(s.id) ?? []}
                running={running}
                isRunning={isRunning}
                tokens={usage?.bySession[s.id]}
                now={now}
                onOpen={openChat}
              />
            ))}
          </div>
        )}

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

        {/* Background workers */}
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

function AgentCard({
  session, provider, subAgents, running, isRunning, tokens, now, onOpen,
}: {
  session: Session; provider?: ProviderConfig; subAgents: Session[]; running: Set<string>;
  isRunning: boolean; tokens?: { input: number; output: number }; now: number; onOpen: (id: string) => void;
}) {
  const msgs = session.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  const lastAssistant = [...session.messages].reverse().find((m) => m.role === 'assistant' && m.content.trim());
  const tok = tokens ? tokens.input + tokens.output : 0;
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

      {subAgents.length > 0 && (
        <div className="mt-2.5 border-t border-line pt-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-ink-faint">
            <RobotIcon className="h-3.5 w-3.5" /> {subAgents.length} sub-agent{subAgents.length === 1 ? '' : 's'}
          </div>
          <div className="space-y-1">
            {subAgents.slice(0, 4).map((k) => (
              <button key={k.id} className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] hover:bg-surface-2" onClick={() => onOpen(k.id)}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${running.has(k.id) ? 'animate-pulse bg-accent' : 'bg-ink-faint'}`} />
                <span className="min-w-0 flex-1 truncate text-ink-soft">{k.title}</span>
              </button>
            ))}
          </div>
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
      <h2 className="text-[15px] font-semibold">Background tasks &amp; agents</h2>
      <p className="mt-0.5 text-[12px] text-ink-faint">Model servers, MCP servers, and the remote relay, with live status.</p>
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
        <p className="mt-3 text-[12px] text-ink-faint">No usage recorded yet — start a chat to see analytics.</p>
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
