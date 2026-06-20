import React, { useEffect, useState } from 'react';
import type { ConnectorConfig, ConnectorKind, ConnectorResource } from '@open-paw/shared';
import { CONNECTOR_CATALOG } from '@open-paw/shared';

const ICON: Record<ConnectorKind, string> = { linear: '◣', slack: '#', discord: '🎮', gmail: '✉', gdrive: '▲' };

export function ConnectorsView() {
  const [configs, setConfigs] = useState<ConnectorConfig[]>([]);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Record<string, ConnectorResource[] | string>>({});

  const load = async () => setConfigs(await window.nekko.listConnectors());
  useEffect(() => { load(); }, []);

  const isConnected = (k: ConnectorKind) => configs.find((c) => c.kind === k)?.connected;

  const connect = async (k: ConnectorKind) => {
    if (!tokens[k]) return;
    setConfigs(await window.nekko.connectConnector(k, tokens[k]));
  };
  const disconnect = async (k: ConnectorKind) => setConfigs(await window.nekko.disconnectConnector(k));
  const fetchData = async (k: ConnectorKind) => {
    try {
      const res = await window.nekko.fetchConnector(k);
      setPreview((p) => ({ ...p, [k]: res }));
    } catch (e) {
      setPreview((p) => ({ ...p, [k]: (e as Error).message }));
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-8">
        <h1 className="text-2xl font-semibold">Connectors</h1>
        <p className="mt-1 text-[13px] text-ink-faint">Pull issues, messages, and docs into context. Tokens are stored locally.</p>

        <div className="mt-6 space-y-4">
          {CONNECTOR_CATALOG.map((meta) => {
            const connected = isConnected(meta.kind);
            const data = preview[meta.kind];
            return (
              <div key={meta.kind} className="card p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl text-lg" style={{ background: 'var(--surface-2)' }}>{ICON[meta.kind]}</div>
                    <div>
                      <h3 className="font-semibold">{meta.label}</h3>
                      <p className="text-[12px] text-ink-faint">{meta.description}</p>
                    </div>
                  </div>
                  {connected && <span className="chip !text-white" style={{ background: '#4ec98a' }}>connected</span>}
                </div>

                {connected ? (
                  <div className="mt-3 flex gap-2">
                    <button className="btn btn-outline py-1.5 text-[12px]" onClick={() => fetchData(meta.kind)}>Fetch sample</button>
                    <button className="btn btn-ghost py-1.5 text-[12px]" onClick={() => disconnect(meta.kind)}>Disconnect</button>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <input
                      className="input py-1.5 text-[12px]"
                      type="password"
                      placeholder={meta.auth === 'oauth' ? 'OAuth access token (paste for now)' : 'API token'}
                      value={tokens[meta.kind] ?? ''}
                      onChange={(e) => setTokens((t) => ({ ...t, [meta.kind]: e.target.value }))}
                    />
                    <button className="btn btn-primary py-1.5 text-[12px]" onClick={() => connect(meta.kind)}>Connect</button>
                  </div>
                )}

                {data && (
                  <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-xl p-2" style={{ background: 'var(--surface-2)' }}>
                    {typeof data === 'string' ? (
                      <p className="text-[12px]" style={{ color: '#e0574a' }}>{data}</p>
                    ) : data.length === 0 ? (
                      <p className="text-[12px] text-ink-faint">No results.</p>
                    ) : (
                      data.map((r) => (
                        <div key={r.id} className="text-[12px]">
                          <span className="font-medium">{r.title}</span>
                          {r.subtitle && <span className="text-ink-faint"> · {r.subtitle}</span>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
