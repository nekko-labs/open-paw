import React, { useEffect, useState } from 'react';
import type { AppInfo, AppSettings, ChatMode, GuardrailRule, GuardrailAction, McpServerStatus, SandboxMode, ThemeMode, UpdateInfo } from '@open-paw/shared';
import { useStore } from '../store.js';
import { SPEC_METHODOLOGIES } from '@open-paw/shared';
import { ShieldIcon, SunIcon, TrashIcon } from '../icons.js';
import { RemoteAccess } from '../components/RemoteAccess.js';
import { useT, LANGUAGES } from '../i18n.js';

const SANDBOX_OPTS: Array<{ value: SandboxMode; label: string; desc: string }> = [
  { value: 'workspace-jail', label: 'Workspace jail', desc: 'File access is confined to your added folders.' },
  { value: 'ask-everything', label: 'Ask everything', desc: 'Every write or command asks for approval.' },
  { value: 'docker', label: 'Docker', desc: 'Run shell commands inside a container if Docker is present.' },
  { value: 'off', label: 'Off', desc: 'No restrictions (power users).' },
];

const ACTION_COLORS: Record<GuardrailAction, string> = { allow: '#4ec98a', ask: '#e0a44a', deny: '#e0574a' };

const CHAT_MODES: Array<{ value: ChatMode; label: string; desc: string }> = [
  { value: 'ask', label: 'Ask', desc: 'Confirm every file write and command before it runs.' },
  { value: 'guardrails', label: 'Guardrails', desc: 'Run freely, but ask/deny per your guardrail rules.' },
  { value: 'yolo', label: 'YOLO', desc: 'Run everything without confirming (deny rules still block).' },
];

export function SettingsView() {
  const { applyTheme } = useStore();
  const tr = useT();
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => { window.nekko.getSettings().then(setSettings); }, []);

  const update = async (patch: Partial<AppSettings>) => {
    const next = await window.nekko.updateSettings(patch);
    setSettings(next);
    useStore.setState({ settings: next });
    applyTheme();
  };

  const updateGuardrail = async (rule: GuardrailRule) => {
    if (!settings) return;
    const guardrails = settings.guardrails.map((g) => (g.id === rule.id ? rule : g));
    update({ guardrails });
  };

  if (!settings) return null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-8">
        <h1 className="text-2xl font-semibold">{tr('settings.title')}</h1>

        {/* Appearance */}
        <section className="card mt-6 p-5">
          <div className="flex items-center gap-2"><SunIcon className="h-4 w-4" /><h2 className="font-semibold">{tr('settings.appearance')}</h2></div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[13px]">{tr('settings.theme')}</span>
            <div className="flex rounded-xl p-1" style={{ background: 'var(--surface-2)' }}>
              {(['light', 'dark', 'system'] as ThemeMode[]).map((tm) => (
                <button key={tm} onClick={() => update({ theme: tm })} className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${settings.theme === tm ? 'bg-surface' : 'text-ink-faint'}`}>{tr('theme.' + tm)}</button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex min-h-[40px] items-center justify-between">
            <span className="text-[13px]">{tr('settings.accent')}</span>
            <input type="color" value={settings.accent} onChange={(e) => update({ accent: e.target.value })} className="h-7 w-12 rounded-lg" />
          </div>
          <div className="flex min-h-[40px] items-center justify-between">
            <span className="text-[13px]">{tr('settings.mascot')}</span>
            <Toggle on={settings.mascotEnabled} onChange={(v) => update({ mascotEnabled: v })} />
          </div>
          <div className="mt-2 flex min-h-[40px] items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[13px]">{tr('settings.language')}</span>
              <p className="text-[11px] text-ink-faint">{tr('settings.languageHint')}</p>
            </div>
            <select
              className="input max-w-[180px] py-1.5"
              value={settings.language ?? ''}
              onChange={(e) => update({ language: e.target.value || undefined })}
            >
              <option value="">{tr('settings.systemDefault')}</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Updates */}
        <UpdatesSection settings={settings} onToggle={(v) => update({ autoUpdate: v })} />

        {/* Sandbox */}
        <section className="card mt-5 p-5">
          <div className="flex items-center gap-2"><ShieldIcon className="h-4 w-4" /><h2 className="font-semibold">{tr('settings.sandbox')}</h2></div>
          <p className="mt-1 text-[12px] text-ink-faint">How Nekko is allowed to touch your machine.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {SANDBOX_OPTS.map((o) => (
              <button key={o.value} onClick={() => update({ sandboxMode: o.value })} className={`card p-3 text-left ${settings.sandboxMode === o.value ? 'border-accent' : ''}`}>
                <div className="text-[13px] font-medium">{o.label}</div>
                <div className="mt-0.5 text-[11px] text-ink-faint">{o.desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Chat modes */}
        <section className="card mt-5 p-5">
          <div className="flex items-center gap-2"><ShieldIcon className="h-4 w-4" /><h2 className="font-semibold">{tr('settings.chatModes')}</h2></div>
          <p className="mt-1 text-[12px] text-ink-faint">
            How chats run tools. Pick the default for new chats — each chat can override it from the composer.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            {CHAT_MODES.map((m) => {
              const active = (settings.defaultChatMode ?? 'guardrails') === m.value;
              return (
                <button key={m.value} onClick={() => update({ defaultChatMode: m.value })} className={`card p-3 text-left ${active ? 'border-accent' : ''}`}>
                  <div className="text-[13px] font-medium">{m.label}</div>
                  <div className="mt-0.5 text-[11px] text-ink-faint">{m.desc}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Spec-driven development */}
        <section className="card mt-5 p-5">
          <div className="flex items-center gap-2"><h2 className="font-semibold">Spec-driven development</h2></div>
          <p className="mt-1 text-[12px] text-ink-faint">
            Default workflow for building a spec, plan, and tasks from a conversation. Each chat can override it in the Context panel.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            {SPEC_METHODOLOGIES.map((m) => {
              const active = (settings.specMethodology ?? 'openpaw') === m.id;
              return (
                <button key={m.id} onClick={() => update({ specMethodology: m.id })} className={`card p-3 text-left ${active ? 'border-accent' : ''}`}>
                  <div className="text-[13px] font-medium">{m.label}</div>
                  <div className="mt-0.5 text-[11px] text-ink-faint">{m.description}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Slash commands / prompt library */}
        <PromptsSection settings={settings} update={update} />

        {/* MCP servers */}
        <McpSection settings={settings} update={update} />

        {/* Remote access (relay) */}
        <RemoteAccess />

        {/* Guardrails */}
        <GuardrailsSection settings={settings} update={update} updateGuardrail={updateGuardrail} />

        {/* Backup & restore */}
        <BackupSection settings={settings} onSettings={(s) => { setSettings(s); useStore.setState({ settings: s }); applyTheme(); }} />

        {/* Data & privacy */}
        <DataSection onSettings={(s) => { setSettings(s); useStore.setState({ settings: s }); applyTheme(); }} />

        <p className="mt-6 text-center text-[11px] text-ink-faint">Open Paw · open source · MIT</p>
      </div>
    </div>
  );
}

function BackupSection({ settings, onSettings }: { settings: AppSettings; onSettings: (s: AppSettings) => void }) {
  const { pushToast, refreshProviders } = useStore();

  const exportSettings = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'open-paw-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Not a settings object');
        if (!window.confirm('Import these settings? This overwrites your current configuration.')) return;
        const next = await window.nekko.updateSettings(parsed);
        onSettings(next);
        await refreshProviders();
        pushToast('success', 'Settings imported.');
      } catch (e) {
        pushToast('error', `Import failed: ${(e as Error).message}`);
      }
    };
    input.click();
  };

  return (
    <section className="card mt-5 p-5">
      <div className="flex items-center gap-2"><SunIcon className="h-4 w-4" /><h2 className="font-semibold">Backup &amp; restore</h2></div>
      <p className="mt-1 text-[12px] text-ink-faint">Export your configuration (providers, guardrails, prompts, MCP servers…) to a JSON file, or restore it on another machine.</p>
      <div className="mt-3 flex gap-2">
        <button className="btn btn-outline py-1.5 text-[12px]" onClick={exportSettings}>Export settings</button>
        <button className="btn btn-outline py-1.5 text-[12px]" onClick={importSettings}>Import settings…</button>
      </div>
    </section>
  );
}

function DataSection({ onSettings }: { onSettings: (s: AppSettings) => void }) {
  const { refreshSessions, refreshProviders, pushToast } = useStore();
  const [busy, setBusy] = useState(false);

  const clear = async (scope: 'today' | 'month' | 'all', label: string) => {
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;
    setBusy(true);
    const n = await window.nekko.clearSessions(scope);
    await refreshSessions();
    useStore.setState({ activeSessionId: null });
    setBusy(false);
    pushToast('success', `Deleted ${n} chat${n === 1 ? '' : 's'}.`);
  };

  const reset = async () => {
    if (!window.confirm('Reset all settings to defaults? Your providers and preferences will be cleared (chats are kept).')) return;
    setBusy(true);
    const s = await window.nekko.resetSettings();
    onSettings(s);
    await refreshProviders();
    setBusy(false);
    pushToast('success', 'Settings reset to defaults.');
  };

  const wipe = async () => {
    if (!window.confirm('Delete EVERYTHING — all chats, settings, memory, and usage? This cannot be undone.')) return;
    if (!window.confirm('Are you absolutely sure? This wipes all Open Paw data.')) return;
    setBusy(true);
    const s = await window.nekko.wipeAllData();
    onSettings(s);
    await refreshSessions();
    await refreshProviders();
    useStore.setState({ activeSessionId: null });
    setBusy(false);
    pushToast('success', 'All data deleted.');
  };

  return (
    <section className="card mt-5 p-5" style={{ borderColor: 'color-mix(in srgb, #e0574a 35%, var(--line))' }}>
      <div className="flex items-center gap-2"><ShieldIcon className="h-4 w-4" /><h2 className="font-semibold">Data &amp; privacy</h2></div>
      <p className="mt-1 text-[12px] text-ink-faint">Everything stays on your machine. Clean it up here whenever you want.</p>

      <div className="mt-3 flex min-h-[36px] flex-wrap items-center justify-between gap-2">
        <span className="text-[13px]">Delete chats</span>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-outline py-1.5 text-[12px]" disabled={busy} onClick={() => clear('today', "today's chats")}>Today</button>
          <button className="btn btn-outline py-1.5 text-[12px]" disabled={busy} onClick={() => clear('month', "this month's chats")}>This month</button>
          <button className="btn btn-outline py-1.5 text-[12px]" disabled={busy} onClick={() => clear('all', 'all chats')}>All chats</button>
        </div>
      </div>

      <div className="mt-2 flex min-h-[36px] items-center justify-between gap-2">
        <span className="text-[13px]">Reset settings to defaults</span>
        <button className="btn btn-outline py-1.5 text-[12px]" disabled={busy} onClick={reset}>Reset configs</button>
      </div>

      <div className="mt-2 flex min-h-[36px] items-center justify-between gap-2">
        <div>
          <span className="text-[13px]">Delete everything</span>
          <p className="text-[11px] text-ink-faint">Chats, settings, memory, and usage analytics.</p>
        </div>
        <button
          className="btn py-1.5 text-[12px] !text-white"
          style={{ background: '#e0574a' }}
          disabled={busy}
          onClick={wipe}
        >
          Delete everything
        </button>
      </div>
    </section>
  );
}

function McpSection({ settings, update }: { settings: AppSettings; update: (patch: Partial<AppSettings>) => void }) {
  const { pushToast } = useStore();
  const servers = settings.mcpServers ?? [];
  const [status, setStatus] = useState<McpServerStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const setServers = (next: typeof servers) => update({ mcpServers: next });
  const add = () =>
    setServers([
      ...servers,
      { id: `m_${Date.now().toString(36)}`, name: 'filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'], enabled: false },
    ]);
  const edit = (id: string, patch: Partial<(typeof servers)[number]>) =>
    setServers(servers.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id: string) => setServers(servers.filter((s) => s.id !== id));
  const connect = async () => {
    setBusy(true);
    try {
      const st = await window.nekko.getMcpStatus();
      setStatus(st);
      const tools = st.reduce((n, s) => n + s.tools.length, 0);
      pushToast('success', `Connected ${st.filter((s) => s.connected).length}/${st.length} server(s), ${tools} tool(s).`);
    } catch (e) {
      pushToast('error', (e as Error).message);
    }
    setBusy(false);
  };
  const stOf = (id: string) => status.find((s) => s.id === id);

  return (
    <section className="card mt-5 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><ShieldIcon className="h-4 w-4" /><h2 className="font-semibold">MCP servers</h2></div>
        <div className="flex gap-2">
          <button className="btn btn-outline py-1 text-[12px]" onClick={connect} disabled={busy || servers.length === 0}>
            {busy ? 'Connecting…' : 'Connect & refresh'}
          </button>
          <button className="btn btn-outline py-1 text-[12px]" onClick={add}>+ Add</button>
        </div>
      </div>
      <p className="mt-1 text-[12px] text-ink-faint">
        Model Context Protocol servers extend the agent with extra tools. Enabled servers' tools are offered in every chat.
      </p>
      <div className="mt-3 space-y-2">
        {servers.length === 0 && <p className="text-[12px] text-ink-faint">No MCP servers. Add one (e.g. <code>npx -y @modelcontextprotocol/server-filesystem .</code>).</p>}
        {servers.map((s) => {
          const st = stOf(s.id);
          return (
            <div key={s.id} className={`card p-3 ${s.enabled ? '' : 'opacity-60'}`}>
              <div className="flex items-center gap-2">
                <input className="input py-1 text-[12.5px]" style={{ maxWidth: 160 }} value={s.name} onChange={(e) => edit(s.id, { name: e.target.value })} />
                {st && (
                  <span className="chip !text-white" style={{ background: st.connected ? '#4ec98a' : '#e0574a' }} title={st.error}>
                    {st.connected ? `${st.tools.length} tools` : 'offline'}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <Toggle on={s.enabled} onChange={(v) => edit(s.id, { enabled: v })} />
                  <button className="btn btn-ghost px-2 py-1" title="Remove" onClick={() => remove(s.id)}><TrashIcon className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <input className="input py-1 font-mono text-[12px]" style={{ maxWidth: 110 }} value={s.command} onChange={(e) => edit(s.id, { command: e.target.value })} placeholder="npx" />
                <input className="input py-1 font-mono text-[12px]" value={s.args.join(' ')} onChange={(e) => edit(s.id, { args: e.target.value.split(/\s+/).filter(Boolean) })} placeholder="-y @modelcontextprotocol/server-filesystem ." />
              </div>
              {st?.error && <p className="mt-1 text-[11px]" style={{ color: '#e0574a' }}>{st.error}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PromptsSection({ settings, update }: { settings: AppSettings; update: (patch: Partial<AppSettings>) => void }) {
  const prompts = settings.prompts ?? [];
  const setPrompts = (next: typeof prompts) => update({ prompts: next });
  const add = () =>
    setPrompts([...prompts, { id: `p_${Date.now().toString(36)}`, name: 'new', body: '' }]);
  const edit = (id: string, patch: Partial<{ name: string; body: string }>) =>
    setPrompts(prompts.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id: string) => setPrompts(prompts.filter((p) => p.id !== id));

  return (
    <section className="card mt-5 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><SunIcon className="h-4 w-4" /><h2 className="font-semibold">Slash commands</h2></div>
        <button className="btn btn-outline py-1 text-[12px]" onClick={add}>+ Add</button>
      </div>
      <p className="mt-1 text-[12px] text-ink-faint">Reusable prompts. Type <code>/name</code> in the composer to insert one.</p>
      <div className="mt-3 space-y-2">
        {prompts.length === 0 && <p className="text-[12px] text-ink-faint">No prompts yet.</p>}
        {prompts.map((p) => (
          <div key={p.id} className="card p-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-ink-faint">/</span>
              <input
                className="input py-1 text-[12.5px]"
                style={{ maxWidth: 180 }}
                value={p.name}
                onChange={(e) => edit(p.id, { name: e.target.value.replace(/\s+/g, '-') })}
              />
              <button className="btn btn-ghost px-2 py-1" title="Delete" onClick={() => remove(p.id)}>
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
            <textarea
              className="input mt-2 min-h-[56px] resize-none text-[12.5px]"
              value={p.body}
              placeholder="Prompt text inserted when you pick this command…"
              onChange={(e) => edit(p.id, { body: e.target.value })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function GuardrailsSection({
  settings,
  update,
  updateGuardrail,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  updateGuardrail: (rule: GuardrailRule) => void;
}) {
  const [jsonMode, setJsonMode] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const openJson = () => {
    setDraft(JSON.stringify(settings.guardrails, null, 2));
    setError('');
    setJsonMode(true);
  };

  const apply = () => {
    try {
      const parsed = JSON.parse(draft) as GuardrailRule[];
      if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of rules.');
      for (const r of parsed) {
        if (!r.id || !r.pattern || !r.action) throw new Error('Each rule needs id, pattern, and action.');
      }
      update({ guardrails: parsed });
      setJsonMode(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="card mt-5 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><ShieldIcon className="h-4 w-4" /><h2 className="font-semibold">Guardrails</h2></div>
        <button className="btn btn-outline py-1 text-[12px]" onClick={() => (jsonMode ? setJsonMode(false) : openJson())}>
          {jsonMode ? 'Visual editor' : 'Edit as JSON'}
        </button>
      </div>
      <p className="mt-1 text-[12px] text-ink-faint">
        Protections for risky commands. Set each to allow, ask, or deny — or edit the rule set directly as JSON.
      </p>

      {jsonMode ? (
        <div className="mt-3">
          <textarea
            className="input min-h-[260px] font-mono text-[12px] leading-relaxed"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
          />
          {error && <p className="mt-1.5 text-[12px]" style={{ color: '#e0574a' }}>{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setJsonMode(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={apply}>Apply</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {settings.guardrails.map((g) => (
            <div key={g.id} className={`card p-3 ${g.enabled ? '' : 'opacity-50'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">{g.label}</span>
                    <span className="h-2 w-2 rounded-full" style={{ background: g.severity === 'high' ? '#e0574a' : g.severity === 'medium' ? '#e0a44a' : '#8a8f98' }} />
                  </div>
                  <p className="truncate text-[11px] text-ink-faint">{g.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex rounded-lg p-0.5" style={{ background: 'var(--surface-2)' }}>
                    {(['allow', 'ask', 'deny'] as GuardrailAction[]).map((a) => (
                      <button
                        key={a}
                        onClick={() => updateGuardrail({ ...g, action: a })}
                        className="rounded-md px-2 py-1 text-[11px] font-medium"
                        style={g.action === a ? { background: ACTION_COLORS[a], color: '#fff' } : { color: 'var(--ink-faint)' }}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                  <Toggle on={g.enabled} onChange={(v) => updateGuardrail({ ...g, enabled: v })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function UpdatesSection({ settings, onToggle }: { settings: AppSettings; onToggle: (v: boolean) => void }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [status, setStatus] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => { window.nekko.getAppInfo().then(setInfo); }, []);

  const check = async () => {
    setChecking(true);
    setStatus(await window.nekko.checkForUpdates());
    setChecking(false);
  };

  const statusText = !status
    ? ''
    : status.state === 'available'
      ? `Update available: v${status.version ?? ''}`
      : status.state === 'none'
        ? "You're up to date."
        : status.state === 'error'
          ? status.message ?? 'Update check failed.'
          : status.state === 'downloaded'
            ? 'Update downloaded — restart to apply.'
            : '';

  return (
    <section className="card mt-5 p-5">
      <div className="flex items-center gap-2"><SunIcon className="h-4 w-4" /><h2 className="font-semibold">Updates</h2></div>
      <p className="mt-1 text-[12px] text-ink-faint">
        {info ? `Open Paw ${info.version} · ${info.edition} edition` : ' '}
      </p>
      <div className="mt-3 flex min-h-[40px] items-center justify-between">
        <div>
          <span className="text-[13px]">Check for updates automatically</span>
          <p className="text-[11px] text-ink-faint">Connects to the internet to look for new versions.</p>
        </div>
        <Toggle on={!!settings.autoUpdate} onChange={onToggle} />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button className="btn btn-outline py-1.5 text-[12px]" onClick={check} disabled={checking}>
          {checking ? 'Checking…' : 'Check now'}
        </button>
        {statusText && <span className="text-[12px] text-ink-faint">{statusText}</span>}
      </div>
    </section>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
      style={{ background: on ? 'var(--accent)' : 'var(--line)' }}
    >
      <span
        className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: on ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  );
}
