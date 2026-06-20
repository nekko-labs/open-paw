import React, { useEffect, useState } from 'react';
import type { ModelInfo, ProviderConfig, ProviderKind, UsageSummary } from '@open-paw/shared';
import { PROVIDER_DEFAULTS } from '@open-paw/shared';
import { useStore } from '../store.js';
import { PlusIcon, TrashIcon, CheckIcon } from '../icons.js';

const KINDS: ProviderKind[] = ['ollama', 'lmstudio', 'vllm', 'anthropic', 'openai', 'openrouter', 'openai-compat'];

export function ModelsView() {
  const { providers, refreshProviders } = useStore();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [adding, setAdding] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    refreshProviders();
    window.nekko.getUsageSummary().then(setUsage);
  }, [refreshProviders]);

  const discover = async () => {
    setDiscovering(true);
    await window.nekko.discoverProviders();
    await refreshProviders();
    setDiscovering(false);
  };

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

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {providers.length === 0 && !adding && (
            <div className="card col-span-full p-8 text-center text-[13px] text-ink-faint">
              No providers yet. Click “Auto-discover local” to find a running Ollama/LM Studio/vLLM, or add one manually.
            </div>
          )}
          {providers.map((p) => (
            <ProviderCard key={p.id} provider={p} onChanged={refreshProviders} />
          ))}
        </div>

        <UsagePanel usage={usage} />
      </div>
    </div>
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

  const save = async () => {
    const cfg: ProviderConfig = {
      id: `${kind}-${Date.now().toString(36)}`,
      kind,
      label: label || PROVIDER_DEFAULTS[kind].label,
      baseUrl,
      apiKey: apiKey || undefined,
      enabled: true,
    };
    await window.nekko.saveProvider(cfg);
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
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onDone}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save provider</button>
      </div>
    </div>
  );
}

function ProviderCard({ provider, onChanged }: { provider: ProviderConfig; onChanged: () => void }) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [status, setStatus] = useState<string>('');
  const [pullName, setPullName] = useState('');

  const load = async () => {
    setModels(await window.nekko.listModels(provider.id));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [provider.id]);

  const test = async () => {
    setStatus('testing…');
    const r = await window.nekko.testProvider(provider.id);
    setStatus(r.message);
  };

  const isOllama = provider.kind === 'ollama';

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{provider.label}</h3>
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
        {status && <span className="text-[12px] text-ink-faint">{status}</span>}
      </div>

      {isOllama && (
        <div className="mt-3 flex gap-2">
          <input className="input py-1.5 text-[12px]" placeholder="pull a model, e.g. llama3.2" value={pullName} onChange={(e) => setPullName(e.target.value)} />
          <button
            className="btn btn-outline py-1.5 text-[12px]"
            onClick={async () => { setStatus('pulling…'); const r = await window.nekko.pullModel(provider.id, pullName); setStatus(r.message); load(); }}
          >
            Pull
          </button>
        </div>
      )}

      <div className="mt-3 max-h-44 space-y-1 overflow-y-auto">
        {models.length === 0 && <p className="text-[12px] text-ink-faint">No models found.</p>}
        {models.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[12.5px]" style={{ background: 'var(--surface-2)' }}>
            <span className="truncate font-mono">{m.name}</span>
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

function UsagePanel({ usage }: { usage: UsageSummary | null }) {
  if (!usage) return null;
  const max = Math.max(1, ...usage.daily.map((d) => d.input + d.output));
  return (
    <div className="card mt-8 p-5">
      <h3 className="font-semibold">Token usage</h3>
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
    </div>
  );
}
