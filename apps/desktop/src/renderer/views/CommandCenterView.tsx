import React, { useEffect, useMemo, useState } from 'react';
import type { ProviderConfig, Session, UsageSummary } from '@open-paw/shared';
import type { RemoteStatus } from '@open-paw/shared';
import { useStore } from '../store.js';
import { Markdown } from '../components/Markdown.js';
import { ChatIcon, FolderIcon, ServerIcon, PlusIcon, CheckIcon } from '../icons.js';

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
  const { sessions, providers, settings, setView, setActiveSession, newChat, setActiveWorkspace } = useStore();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const now = Date.now();

  useEffect(() => {
    window.nekko.getUsageSummary().then(setUsage);
  }, []);

  const recentSession = sessions[0]; // store keeps them sorted by updatedAt desc
  const recentWorkspace = settings?.workspaces?.[0];
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayTokens = usage?.daily.find((d) => d.date === todayKey);
  const tokensToday = todayTokens ? todayTokens.input + todayTokens.output : 0;

  const lanes = useMemo(() => {
    const m: Record<Lane, Session[]> = { active: [], recent: [], idle: [] };
    for (const s of sessions) m[laneOf(s, now)].push(s);
    return m;
  }, [sessions, now]);

  const openChat = (id: string) => {
    setActiveSession(id);
    setView('chat');
  };

  const stats = [
    { label: 'Projects', value: settings?.workspaces.length ?? 0 },
    { label: 'Chats', value: sessions.length },
    { label: 'Providers', value: providers.length },
    { label: 'Tokens today', value: tokensToday.toLocaleString() },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 py-8">
        <h1 className="text-2xl font-semibold">Command Center</h1>
        <p className="mt-1 text-[13px] text-ink-faint">Everything in flight, at a glance.</p>

        {/* Suggestions */}
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Suggestion
            icon={<PlusIcon className="h-4 w-4" />}
            title="Start a new chat"
            sub="Ask Nekko anything or kick off a task"
            onClick={() => { newChat(); setView('chat'); }}
          />
          {recentWorkspace && (
            <Suggestion
              icon={<FolderIcon className="h-4 w-4" />}
              title={`Continue ${recentWorkspace.name}`}
              sub="New chat scoped to this project"
              onClick={() => { setActiveWorkspace(recentWorkspace.id); newChat(); setView('chat'); }}
            />
          )}
          {recentSession && (
            <Suggestion
              icon={<ChatIcon className="h-4 w-4" />}
              title={`Respond to “${recentSession.title}”`}
              sub="Pick up your most recent conversation"
              onClick={() => openChat(recentSession.id)}
            />
          )}
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="card p-4">
              <div className="text-2xl font-semibold">{s.value}</div>
              <div className="mt-0.5 text-[12px] text-ink-faint">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Kanban of agent chats */}
        <h2 className="mt-8 text-[15px] font-semibold">Agent chats</h2>
        <p className="mt-0.5 text-[12px] text-ink-faint">Click a card to expand the conversation.</p>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          {LANES.map((lane) => (
            <div key={lane.key}>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: lane.color }} />
                <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">{lane.label}</span>
                <span className="chip">{lanes[lane.key].length}</span>
              </div>
              <div className="space-y-2">
                {lanes[lane.key].length === 0 && (
                  <p className="px-1 text-[11px] text-ink-faint">{`Nothing ${lane.hint}.`}</p>
                )}
                {lanes[lane.key].map((s) => (
                  <KanbanCard
                    key={s.id}
                    session={s}
                    provider={providers.find((p) => p.id === s.providerId)}
                    laneColor={lane.color}
                    expanded={expanded === s.id}
                    onToggle={() => setExpanded(expanded === s.id ? null : s.id)}
                    onOpen={() => openChat(s.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Background workers */}
        <WorkersDashboard providers={providers} usage={usage} />

        {/* Token usage (moved here from Models) */}
        <UsagePanel usage={usage} />
      </div>
    </div>
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
  useEffect(() => { window.nekko.getRemoteStatus().then(setRemote).catch(() => setRemote(null)); }, []);
  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-semibold">Background tasks &amp; agents</h2>
      <p className="mt-0.5 text-[12px] text-ink-faint">Model servers and the remote relay, with live status and usage.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <RemoteCard remote={remote} />
        {providers.map((p) => (
          <WorkerCard key={p.id} provider={p} tokens={usage?.byProvider[p.id]} />
        ))}
        {providers.length === 0 && (
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
            <div key={model} className="flex justify-between text-[12px]">
              <span className="truncate font-mono text-ink-soft">{model}</span>
              <span className="text-ink-faint">{(v.input + v.output).toLocaleString()} tok</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
