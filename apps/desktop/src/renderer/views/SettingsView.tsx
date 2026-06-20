import React, { useEffect, useState } from 'react';
import type { AppInfo, AppSettings, GuardrailRule, GuardrailAction, SandboxMode, ThemeMode, UpdateInfo } from '@open-paw/shared';
import { useStore } from '../store.js';
import { ShieldIcon, SunIcon } from '../icons.js';
import { RemoteAccess } from '../components/RemoteAccess.js';

const SANDBOX_OPTS: Array<{ value: SandboxMode; label: string; desc: string }> = [
  { value: 'workspace-jail', label: 'Workspace jail', desc: 'File access is confined to your added folders.' },
  { value: 'ask-everything', label: 'Ask everything', desc: 'Every write or command asks for approval.' },
  { value: 'docker', label: 'Docker', desc: 'Run shell commands inside a container if Docker is present.' },
  { value: 'off', label: 'Off', desc: 'No restrictions (power users).' },
];

const ACTION_COLORS: Record<GuardrailAction, string> = { allow: '#4ec98a', ask: '#e0a44a', deny: '#e0574a' };

export function SettingsView() {
  const { applyTheme } = useStore();
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
        <h1 className="text-2xl font-semibold">Settings</h1>

        {/* Appearance */}
        <section className="card mt-6 p-5">
          <div className="flex items-center gap-2"><SunIcon className="h-4 w-4" /><h2 className="font-semibold">Appearance</h2></div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[13px]">Theme</span>
            <div className="flex rounded-xl p-1" style={{ background: 'var(--surface-2)' }}>
              {(['light', 'dark', 'system'] as ThemeMode[]).map((t) => (
                <button key={t} onClick={() => update({ theme: t })} className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${settings.theme === t ? 'bg-surface' : 'text-ink-faint'}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex min-h-[40px] items-center justify-between">
            <span className="text-[13px]">Accent color</span>
            <input type="color" value={settings.accent} onChange={(e) => update({ accent: e.target.value })} className="h-7 w-12 rounded-lg" />
          </div>
          <div className="flex min-h-[40px] items-center justify-between">
            <span className="text-[13px]">Show Nekko mascot</span>
            <Toggle on={settings.mascotEnabled} onChange={(v) => update({ mascotEnabled: v })} />
          </div>
        </section>

        {/* Updates */}
        <UpdatesSection settings={settings} onToggle={(v) => update({ autoUpdate: v })} />

        {/* Sandbox */}
        <section className="card mt-5 p-5">
          <div className="flex items-center gap-2"><ShieldIcon className="h-4 w-4" /><h2 className="font-semibold">Sandbox</h2></div>
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

        {/* Remote access (relay) */}
        <RemoteAccess />

        {/* Guardrails */}
        <section className="card mt-5 p-5">
          <div className="flex items-center gap-2"><ShieldIcon className="h-4 w-4" /><h2 className="font-semibold">Guardrails</h2></div>
          <p className="mt-1 text-[12px] text-ink-faint">
            Default protections for risky commands. Set each to allow, ask, or deny — and toggle any off.
          </p>
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
        </section>

        <p className="mt-6 text-center text-[11px] text-ink-faint">Open Paw · open source · MIT</p>
      </div>
    </div>
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
