import React, { useEffect, useState } from 'react';
import type { ModelInfo, ProviderConfig, ProviderKind } from '@open-paw/shared';
import { PROVIDER_DEFAULTS } from '@open-paw/shared';
import { useStore } from '../store.js';
import { PlusIcon, TrashIcon, CheckIcon, StarIcon } from '../icons.js';

const KINDS: ProviderKind[] = ['ollama', 'lmstudio', 'vllm', 'anthropic', 'openai', 'openrouter', 'openai-compat'];
const LOCAL_KINDS: ProviderKind[] = ['ollama', 'lmstudio', 'vllm', 'openai-compat'];
const isLocal = (k: ProviderKind) => LOCAL_KINDS.includes(k);

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
    const after = await window.nekko.discoverProviders();
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
          accent="#4ec98a"
          subtitle="On-device model servers — private, free, fast."
          providers={local}
          onChanged={refreshProviders}
        />
        <ProviderSection
          title="Cloud"
          accent="#5b9dd9"
          subtitle="Hosted APIs — Anthropic, OpenAI, OpenRouter, or any compatible endpoint."
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
  const [kind, setKind] = useState<ProviderKind>('ollama');
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState(PROVIDER_DEFAULTS.ollama.baseUrl);
  const [apiKey, setApiKey] = useState('');

  const pick = (k: ProviderKind) => {
    setKind(k);
    setBaseUrl(PROVIDER_DEFAULTS[k].baseUrl);
    setLabel(PROVIDER_DEFAULTS[k].label);
  };

  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

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
    const r = await window.nekko.testProviderConfig(draft());
    setResult(r);
    setTesting(false);
  };

  const save = async () => {
    await window.nekko.saveProvider(draft());
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
                className={`chip ${kind === k ? '!text-white' : ''}`}
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
        {PROVIDER_DEFAULTS[kind].needsKey && (
          <label className="col-span-2 text-[12px] font-medium text-ink-soft">
            API key
            <input className="input mt-1" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
          </label>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="min-w-0 text-[12px]">
          {result && (
            <span style={{ color: result.ok ? '#4ec98a' : '#e0574a' }} className="inline-flex items-center gap-1.5">
              {result.ok && <CheckIcon className="h-3.5 w-3.5" />}
              {result.ok ? 'Connected' : result.message}
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button className="btn btn-ghost" onClick={onDone}>Cancel</button>
          <button className="btn btn-outline" onClick={test} disabled={testing}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button className="btn btn-primary" onClick={save}>Save provider</button>
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ provider, onChanged }: { provider: ProviderConfig; onChanged: () => void }) {
  const settings = useStore((s) => s.settings);
  const refreshSettings = useStore((s) => s.refreshSettings);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [conn, setConn] = useState<{ state: 'unknown' | 'testing' | 'ok' | 'fail'; message?: string }>({ state: 'unknown' });
  const [pullName, setPullName] = useState('');

  const isFavorite = (key: string) => (settings?.favoriteModels ?? []).includes(key);
  const toggleFavorite = async (key: string) => {
    const set = new Set(settings?.favoriteModels ?? []);
    set.has(key) ? set.delete(key) : set.add(key);
    await window.nekko.updateSettings({ favoriteModels: [...set] });
    refreshSettings();
  };

  const load = async () => {
    setModels(await window.nekko.listModels(provider.id));
  };

  const test = async () => {
    setConn({ state: 'testing' });
    const r = await window.nekko.testProvider(provider.id);
    setConn({ state: r.ok ? 'ok' : 'fail', message: r.message });
  };

  // Auto-check connectivity (and load models) when the card mounts.
  useEffect(() => {
    load();
    test();
    /* eslint-disable-next-line */
  }, [provider.id]);

  const isOllama = provider.kind === 'ollama';

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{provider.label}</h3>
            {conn.state === 'ok' && (
              <span className="chip !text-white" style={{ background: '#4ec98a' }}>
                <CheckIcon className="h-3 w-3" /> Connected
              </span>
            )}
            {conn.state === 'fail' && (
              <span className="chip !text-white" style={{ background: '#e0574a' }} title={conn.message}>Offline</span>
            )}
            {conn.state === 'testing' && <span className="chip">checking…</span>}
            {provider.discovered && <span className="chip">discovered</span>}
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{provider.baseUrl}</p>
        </div>
        <button
          className="btn btn-ghost px-2"
          onClick={async () => { await window.nekko.removeProvider(provider.id); onChanged(); }}
          title="Remove"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button className="btn btn-outline py-1.5 text-[12px]" onClick={test}>Test connection</button>
        {conn.state === 'fail' && <span className="text-[12px]" style={{ color: '#e0574a' }}>{conn.message}</span>}
      </div>

      {isOllama && (
        <div className="mt-3 flex gap-2">
          <input className="input py-1.5 text-[12px]" placeholder="pull a model, e.g. llama3.2" value={pullName} onChange={(e) => setPullName(e.target.value)} />
          <button
            className="btn btn-outline py-1.5 text-[12px]"
            onClick={async () => { setConn({ state: 'testing', message: 'pulling…' }); const r = await window.nekko.pullModel(provider.id, pullName); setConn({ state: r.ok ? 'ok' : 'fail', message: r.message }); load(); }}
          >
            Pull
          </button>
        </div>
      )}

      <div className="mt-3 max-h-44 space-y-1 overflow-y-auto">
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
            <div className="flex items-center gap-2">
              {m.sizeBytes && <span className="text-[10px] text-ink-faint">{(m.sizeBytes / 1e9).toFixed(1)} GB</span>}
              {isOllama && (
                m.loaded ? (
                  <button className="chip !text-white" style={{ background: '#4ec98a' }} onClick={async () => { await window.nekko.unloadModel(provider.id, m.id); load(); }}>
                    <CheckIcon className="h-3 w-3" /> loaded
                  </button>
                ) : (
                  <button className="chip" onClick={async () => { await window.nekko.loadModel(provider.id, m.id); load(); }}>load</button>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
