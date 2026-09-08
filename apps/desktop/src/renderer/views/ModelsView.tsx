import React, { useEffect, useState } from 'react';
import type { ModelInfo, OAuthStatus, ProviderConfig, ProviderKind } from '@kotrain/shared';
import { PROVIDER_DEFAULTS, isLocalProvider } from '@kotrain/shared';
import { useStore } from '../store.js';
import { Badge } from '../components/primitives/index.js';
import { SubscriptionSignIn } from '../components/SubscriptionSignIn.js';
import { PlusIcon, TrashIcon, CheckIcon, StarIcon } from '../icons.js';

const KINDS: ProviderKind[] = ['ollama', 'lmstudio', 'vllm', 'anthropic', 'openai', 'openrouter', 'openai-compat'];
const isLocal = (k: ProviderKind) => isLocalProvider(k);

export function ModelsView() {
  const { providers, refreshProviders, pushToast } = useStore();
  const [adding, setAdding] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    refreshProviders();
  }, [refreshProviders]);

  const discover = async () => {
    setDiscovering(true);
    const before = providers.length;
    const after = await window.kotrain.discoverProviders();
    await refreshProviders();
    setDiscovering(false);
    const added = after.length - before;
    pushToast(added > 0 ? 'success' : 'info', added > 0
      ? `Found ${added} local server${added === 1 ? '' : 's'}.`
      : 'No new local servers found on localhost. Running on another host/port? Add it manually.');
  };

  const local = providers.filter((p) => isLocal(p.kind));
  const cloud = providers.filter((p) => !isLocal(p.kind));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Models</h1>
            <p className="mt-1 text-[13px] text-ink-faint">
              Connect local servers or cloud providers. Local models are first-class here.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-outline" onClick={discover} disabled={discovering}>
              {discovering ? 'Scanning…' : 'Auto-discover local'}
            </button>
            <button className="btn btn-primary" onClick={() => setAdding((v) => !v)}>
              <PlusIcon /> Add provider
            </button>
          </div>
        </div>

        {adding && <AddProvider onDone={() => { setAdding(false); refreshProviders(); }} />}

        {providers.length === 0 && !adding && (
          <div className="card mt-6 p-8 text-center text-[13px] text-ink-faint">
            No providers yet. Click “Auto-discover local” to find a running Ollama/LM Studio/vLLM, or add one manually.
          </div>
        )}

        <ProviderSection
          title="Local"
          accent="var(--success)"
          subtitle="On-device model servers, private, free, fast."
          providers={local}
          onChanged={refreshProviders}
        />
        <ProviderSection
          title="Cloud"
          accent="var(--info)"
          subtitle="Hosted APIs, Anthropic, OpenAI, OpenRouter, or any compatible endpoint."
          providers={cloud}
          onChanged={refreshProviders}
        />

        <p className="mt-8 text-center text-[12px] text-ink-faint">
          Token usage and live worker status now live in the Command Center.
        </p>
      </div>
    </div>
  );
}

function ProviderSection({
  title,
  subtitle,
  accent,
  providers,
  onChanged,
}: {
  title: string;
  subtitle: string;
  accent: string;
  providers: ProviderConfig[];
  onChanged: () => void;
}) {
  if (providers.length === 0) return null;
  return (
    <section className="mt-7">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
        <h2 className="text-[15px] font-semibold">{title} models</h2>
        <span className="chip">{providers.length}</span>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-faint">{subtitle}</p>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}

function AddProvider({ onDone }: { onDone: () => void }) {
  const pushToast = useStore((s) => s.pushToast);
  const [kind, setKind] = useState<ProviderKind>('ollama');
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState(PROVIDER_DEFAULTS.ollama.baseUrl);
  const [apiKey, setApiKey] = useState('');
  // For Anthropic the subscription sign-in is the primary path; the API key
  // field hides behind a quiet disclosure until the user asks for it.
  const [useApiKey, setUseApiKey] = useState(false);

  const pick = (k: ProviderKind) => {
    setKind(k);
    setBaseUrl(PROVIDER_DEFAULTS[k].baseUrl);
    setLabel(PROVIDER_DEFAULTS[k].label);
    setUseApiKey(false);
    setApiKey('');
  };

  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // A completed sign-in only hands back a sanitized status (tokenKey, not the
  // token). The provider saves with auth: 'subscription'; the host injects the
  // fresh access token at request time.
  const connectSubscription = async (status: OAuthStatus) => {
    await window.kotrain.saveProvider({
      id: `anthropic-${Date.now().toString(36)}`,
      kind: 'anthropic',
      label: label || 'Claude (subscription)',
      baseUrl,
      auth: 'subscription',
      tokenKey: status.tokenKey,
      accountId: status.accountId,
      enabled: true,
    });
    pushToast('success', 'Signed in with your Claude subscription.');
    onDone();
  };

  const draft = (): ProviderConfig => ({
    id: `${kind}-${Date.now().toString(36)}`,
    kind,
    label: label || PROVIDER_DEFAULTS[kind].label,
    baseUrl,
    apiKey: apiKey || undefined,
    enabled: true,
  });

  const test = async () => {
    setTesting(true);
    setResult(null);
    const r = await window.kotrain.testProviderConfig(draft());
    setResult(r);
    setTesting(false);
  };

  const save = async () => {
    await window.kotrain.saveProvider(draft());
    onDone();
  };

  return (
    <div className="card mt-5 p-5">
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-[12px] font-medium text-ink-soft">
          Provider type
          <div className="mt-1 flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k}
                onClick={() => pick(k)}
                className={`chip ${kind === k ? 'text-white!' : ''}`}
                style={kind === k ? { background: 'var(--accent)' } : undefined}
              >
                {PROVIDER_DEFAULTS[k].label}
              </button>
            ))}
          </div>
        </label>
        <label className="text-[12px] font-medium text-ink-soft">
          Label
          <input className="input mt-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={PROVIDER_DEFAULTS[kind].label} />
        </label>
        <label className="text-[12px] font-medium text-ink-soft">
          Base URL
          <input className="input mt-1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </label>
        {kind === 'anthropic' && (
          <div className="col-span-2 rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
            <p className="text-[13px] font-medium">Use your Claude subscription</p>
            <p className="mt-0.5 text-[12px] text-ink-faint">
              Sign in with your Claude Pro or Max account to run on your existing plan, with no API usage fees.
            </p>
            <div className="mt-2.5">
              <SubscriptionSignIn oauthProvider="claude" onConnected={connectSubscription} />
            </div>
          </div>
        )}
        {PROVIDER_DEFAULTS[kind].needsKey && (kind !== 'anthropic' || useApiKey) && (
          <label className="col-span-2 text-[12px] font-medium text-ink-soft">
            API key
            <input className="input mt-1" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
          </label>
        )}
        {kind === 'anthropic' && (
          <button
            className="col-span-2 justify-self-start text-[12px] text-ink-faint hover:text-ink"
            onClick={() => setUseApiKey((v) => !v)}
          >
            {useApiKey ? 'Back to subscription sign-in' : 'Use an API key instead (billed per token)'}
          </button>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="min-w-0 text-[12px]">
          {result && (
            <span style={{ color: result.ok ? 'var(--success)' : 'var(--danger)' }} className="inline-flex items-center gap-1.5">
              {result.ok && <CheckIcon className="h-3.5 w-3.5" />}
              {result.ok ? 'Connected' : result.message}
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button className="btn btn-ghost" onClick={onDone}>Cancel</button>
          {/* For Anthropic the subscription sign-in completes the add itself;
              test/save only make sense once the API-key path is revealed. */}
          {(kind !== 'anthropic' || useApiKey) && (
            <>
              <button className="btn btn-outline" onClick={test} disabled={testing}>
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              <button className="btn btn-primary" onClick={save}>Save provider</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ provider, onChanged }: { provider: ProviderConfig; onChanged: () => void }) {
  const settings = useStore((s) => s.settings);
  const refreshSettings = useStore((s) => s.refreshSettings);
  const pushToast = useStore((s) => s.pushToast);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [conn, setConn] = useState<{ state: 'unknown' | 'testing' | 'ok' | 'fail'; message?: string }>({ state: 'unknown' });
  const [pullName, setPullName] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // model id being (un)loaded
  const [stopping, setStopping] = useState(false);
  // Per-model load/unload for LM Studio rides its `lms` CLI, so it's only
  // available for a local instance with the CLI installed. `null` = not yet
  // probed; the reason feeds the fallback badge's tooltip.
  const [lms, setLms] = useState<{ available: boolean; reason?: string } | null>(null);
  // Subscription providers keep their OAuth token host-side; the renderer only
  // ever sees this sanitized status (connected/account/expiry, never a token).
  const subscription = provider.auth === 'subscription';
  const [sub, setSub] = useState<OAuthStatus | null>(null);

  const isFavorite = (key: string) => (settings?.favoriteModels ?? []).includes(key);
  const toggleFavorite = async (key: string) => {
    const set = new Set(settings?.favoriteModels ?? []);
    set.has(key) ? set.delete(key) : set.add(key);
    await window.kotrain.updateSettings({ favoriteModels: [...set] });
    refreshSettings();
  };

  const load = async () => {
    setModels(await window.kotrain.listModels(provider.id).catch(() => []));
  };

  const test = async () => {
    setConn({ state: 'testing' });
    const r = await window.kotrain.testProvider(provider.id);
    setConn({ state: r.ok ? 'ok' : 'fail', message: r.message });
  };

  // Auto-check connectivity (and load models) when the card mounts.
  useEffect(() => {
    load();
    test();
    if (provider.kind === 'lmstudio') {
      window.kotrain.lmsAvailable(provider.id).then(setLms).catch(() => setLms({ available: false }));
    }
    if (provider.auth === 'subscription') {
      window.kotrain.oauthStatus(provider.id).then(setSub).catch(() => setSub(null));
    }
    /* eslint-disable-next-line */
  }, [provider.id, provider.tokenKey]);

  // Keep the badge honest when the host refreshes or signs out the token this
  // card points at (e.g. a mid-chat renewal lands while the page is open).
  useEffect(() => {
    if (!subscription) return;
    return window.kotrain.onOAuthStatus((s) => {
      if (s.tokenKey && s.tokenKey === provider.tokenKey) setSub(s);
    });
  }, [subscription, provider.tokenKey]);

  const signOutSubscription = async () => {
    await window.kotrain.oauthSignOut(provider.id);
    setSub(await window.kotrain.oauthStatus(provider.id).catch(() => null));
    pushToast('info', 'Signed out of the Claude subscription.');
  };

  // A re-auth (or a first connect on an existing card) returns a new tokenKey;
  // fold it onto the provider and re-check status against the saved config.
  const relinkSubscription = async (status: OAuthStatus) => {
    // A re-auth can land under a different tokenKey; sign the old one out
    // before repointing the provider so it doesn't linger in the host store.
    if (provider.tokenKey && provider.tokenKey !== status.tokenKey) {
      await window.kotrain.oauthSignOut(provider.id).catch(() => {});
    }
    await window.kotrain.saveProvider({
      ...provider,
      auth: 'subscription',
      tokenKey: status.tokenKey || provider.tokenKey,
      accountId: status.accountId ?? provider.accountId,
    });
    setSub(await window.kotrain.oauthStatus(provider.id).catch(() => null));
    pushToast('success', 'Signed in with your Claude subscription.');
    onChanged();
  };

  // While connected, refresh the loaded state periodically — local servers
  // JIT-load/evict models as they're used, so this keeps the badges honest.
  useEffect(() => {
    if (conn.state !== 'ok') return;
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.state, provider.id]);

  const isOllama = provider.kind === 'ollama';
  const local = isLocal(provider.kind);
  const anyLoaded = models.some((m) => m.loaded);
  // Ollama always supports per-model load/unload; LM Studio does too once its
  // `lms` CLI is reachable. Others fall back to the static badge + Stop server.
  const canManage = isOllama || (provider.kind === 'lmstudio' && lms?.available === true);

  const setLoaded = async (m: ModelInfo, loaded: boolean) => {
    setBusy(m.id);
    try {
      const r = loaded
        ? await window.kotrain.loadModel(provider.id, m.id)
        : await window.kotrain.unloadModel(provider.id, m.id);
      if (r && !r.ok) pushToast('error', r.message ?? `Couldn't ${loaded ? 'load' : 'unload'} ${m.id}.`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const stopServer = async () => {
    if (!window.confirm(`Stop the ${provider.label} server? This unloads its models and ends the process.`)) return;
    setStopping(true);
    const r = await window.kotrain.stopServer(provider.id);
    pushToast(r.ok ? 'success' : 'error', r.message);
    setStopping(false);
    setTimeout(test, 600); // reflect the now-offline state
    load();
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{provider.label}</h3>
            {conn.state === 'ok' && (
              <Badge tone="success" variant="solid" className="px-2 py-0.5">
                <CheckIcon className="h-3 w-3" /> Connected
              </Badge>
            )}
            {conn.state === 'fail' && (
              <Badge tone="danger" variant="solid" title={conn.message}>Offline</Badge>
            )}
            {conn.state === 'testing' && <span className="chip">checking…</span>}
            {subscription && (
              <Badge
                tone={sub?.connected ? 'success' : 'warning'}
                variant="soft"
                title="Runs on your Claude subscription instead of a metered API key"
              >
                Subscription
              </Badge>
            )}
            {provider.discovered && <span className="chip">discovered</span>}
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{provider.baseUrl}</p>
        </div>
        <button
          className="btn btn-ghost px-2"
          onClick={async () => {
            // Removing a subscription provider also drops its stored token so a
            // deleted card can't leave a live session behind.
            if (provider.tokenKey) await window.kotrain.oauthSignOut(provider.id).catch(() => {});
            await window.kotrain.removeProvider(provider.id);
            onChanged();
          }}
          title="Remove"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-outline py-1.5 text-[12px]" onClick={test}>Test connection</button>
        {/* Stopping a server only makes sense while one is answering: an offline
            (or not-yet-probed) provider has no process to stop, and a greyed-out
            button just invites a click that can't work. */}
        {local && conn.state === 'ok' && (
          <button
            className="btn btn-outline py-1.5 text-[12px]"
            style={{ color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 40%, transparent)' }}
            onClick={stopServer}
            disabled={stopping}
            title="Stop this local model server (kills its process and unloads its models)"
          >
            {stopping ? 'Stopping…' : 'Stop server'}
          </button>
        )}
        {conn.state === 'fail' && <span className="text-[12px]" style={{ color: 'var(--danger)' }}>{conn.message}</span>}
      </div>

      {subscription && (
        <div className="mt-3 rounded-xl border p-3 text-[12px]" style={{ borderColor: 'var(--line)' }}>
          {sub === null ? (
            <span className="text-ink-faint">Checking sign-in…</span>
          ) : sub.connected ? (
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-ink-soft">
                <CheckIcon className="h-3.5 w-3.5 shrink-0 text-success" />
                <span className="truncate">
                  Signed in with Claude{provider.accountId ? ` · ${provider.accountId}` : ''}
                </span>
              </span>
              <button className="shrink-0 text-ink-faint hover:text-ink" onClick={() => void signOutSubscription()}>
                Sign out
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p style={{ color: 'var(--warning)' }}>
                {sub.state === 'error' && sub.message
                  ? sub.message
                  : 'Subscription session expired or signed out — sign in again.'}
              </p>
              <SubscriptionSignIn oauthProvider="claude" label="Sign in with Claude" onConnected={relinkSubscription} />
            </div>
          )}
        </div>
      )}

      {isOllama && (
        <div className="mt-3 flex gap-2">
          <input className="input py-1.5 text-[12px]" placeholder="pull a model, e.g. llama3.2" value={pullName} onChange={(e) => setPullName(e.target.value)} />
          <button
            className="btn btn-outline py-1.5 text-[12px]"
            onClick={async () => { setConn({ state: 'testing', message: 'pulling…' }); const r = await window.kotrain.pullModel(provider.id, pullName); setConn({ state: r.ok ? 'ok' : 'fail', message: r.message }); load(); }}
          >
            Pull
          </button>
        </div>
      )}

      {local && (
        <div className="mt-3 flex items-center justify-between text-[11px] text-ink-faint">
          <span>{models.length} model{models.length === 1 ? '' : 's'}{anyLoaded ? ` · ${models.filter((m) => m.loaded).length} loaded` : ''}</span>
          <button className="hover:text-ink" onClick={load} title="Refresh loaded state">↻ Refresh</button>
        </div>
      )}

      <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
        {models.length === 0 && <p className="text-[12px] text-ink-faint">No models found.</p>}
        {models.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[12.5px]" style={{ background: 'var(--surface-2)' }}>
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                title={isFavorite(`${provider.id}::${m.id}`) ? 'Unfavorite' : 'Favorite (pin to top of the model picker)'}
                className={isFavorite(`${provider.id}::${m.id}`) ? 'text-accent' : 'text-ink-faint hover:text-ink'}
                onClick={() => toggleFavorite(`${provider.id}::${m.id}`)}
              >
                <StarIcon className="h-3.5 w-3.5" filled={isFavorite(`${provider.id}::${m.id}`)} />
              </button>
              <span className="truncate font-mono">{m.name}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {m.vramBytes ? (
                <span className="text-[10px] text-ink-faint" title="VRAM used while loaded">{(m.vramBytes / 1e9).toFixed(1)} GB VRAM</span>
              ) : m.sizeBytes ? (
                <span className="text-[10px] text-ink-faint" title="Size on disk">{(m.sizeBytes / 1e9).toFixed(1)} GB</span>
              ) : null}
              {canManage ? (
                m.loaded ? (
                  <button
                    className="chip chip-loaded text-white!"
                    style={{ background: 'var(--success)' }}
                    disabled={busy === m.id}
                    onClick={() => setLoaded(m, false)}
                    title="Loaded in memory, click to unload"
                  >
                    <CheckIcon className="h-3 w-3" />
                    {busy === m.id ? (
                      'unloading…'
                    ) : (
                      <>
                        {/* Reads as state at rest, as an action under the cursor. */}
                        <span className="chip-loaded-rest">loaded</span>
                        <span className="chip-loaded-hover">unload</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    className="chip chip-action"
                    disabled={busy === m.id}
                    onClick={() => setLoaded(m, true)}
                    title={`Load ${m.name} into memory`}
                  >
                    {busy === m.id ? 'loading…' : 'load'}
                  </button>
                )
              ) : local && m.loaded ? (
                <Badge tone="success" variant="solid" title={lms?.reason ?? 'Loaded in memory. Use “Stop server” to unload.'}>
                  <CheckIcon className="h-3 w-3" /> loaded
                </Badge>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
