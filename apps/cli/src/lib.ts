import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHost } from '@open-paw/host';
import { IpcEvents } from '@open-paw/shared';
import type { AppSettings, Session, SendOptions, AgentEvent, WorkspaceFolder, RemoteStatus } from '@open-paw/shared';

/** The data dir for the in-process (local) client. */
export function dataDir(): string {
  return process.env.OPENPAW_DATA_DIR || join(homedir(), '.open-paw');
}

/**
 * The subset of the host surface the CLI/MCP use, async so the same code drives
 * either an in-process host (local data dir) or a running server over HTTP+WS.
 */
export interface Client {
  ready(): Promise<void>;
  getSettings(): Promise<AppSettings>;
  listSessions(): Promise<Session[]>;
  createSession(workspaceId?: string): Promise<Session>;
  getSession(id: string): Promise<Session | null>;
  listWorkspaces(): Promise<WorkspaceFolder[]>;
  remoteStatus(): Promise<RemoteStatus>;
  sendChat(opts: SendOptions): Promise<void>;
  approveTool(sessionId: string, callId: string, approved: boolean): Promise<void>;
  onAgentEvent(cb: (e: AgentEvent) => void): () => void;
}

/** In-process client backed by createHost on the data dir. */
function localClient(): Client {
  const host = createHost({ dataDir: dataDir() });
  return {
    ready: async () => {},
    getSettings: async () => host.getSettings(),
    listSessions: async () => host.listSessions(),
    createSession: async (w) => host.createSession(w),
    getSession: async (id) => host.getSession(id),
    listWorkspaces: async () => host.listWorkspaces(),
    remoteStatus: async () => host.remoteStatus(),
    sendChat: (o) => host.sendChat(o),
    approveTool: async (s, c, a) => host.approveTool(s, c, a),
    onAgentEvent: (cb) => {
      host.events.on('agentEvent', cb);
      return () => host.events.off('agentEvent', cb);
    },
  };
}

/** Remote client over a running server's HTTP (`POST /api/:channel`) + WS events. */
function httpClient(url: string, token?: string): Client {
  const base = url.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const call = async (channel: string, ...args: unknown[]) => {
    const res = await fetch(`${base}/api/${channel}`, { method: 'POST', headers, body: JSON.stringify({ args }) });
    if (!res.ok) throw new Error(`${channel}: HTTP ${res.status}`);
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  };

  const cbs = new Set<(e: AgentEvent) => void>();
  let ws: WebSocket | null = null;
  let openP: Promise<void> | null = null;
  const connect = () => {
    if (openP) return openP;
    const wsUrl = `${base.replace(/^http/, 'ws')}/api/events${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    ws = new WebSocket(wsUrl);
    ws.onmessage = (ev) => {
      try {
        const { channel, payload } = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
        if (channel === IpcEvents.agentEvent) cbs.forEach((cb) => cb(payload));
      } catch {
        /* ignore */
      }
    };
    openP = new Promise<void>((resolve, reject) => {
      ws!.onopen = () => resolve();
      ws!.onerror = () => reject(new Error(`Cannot reach Open Paw server at ${base}`));
    });
    return openP;
  };

  return {
    ready: () => connect(),
    getSettings: () => call('settings:get'),
    listSessions: () => call('sessions:list'),
    createSession: (w) => call('session:create', w),
    getSession: (id) => call('session:get', id),
    listWorkspaces: () => call('workspace:list'),
    remoteStatus: () => call('remote:status'),
    sendChat: (o) => call('chat:send', o),
    approveTool: (s, c, a) => call('tool:approve', s, c, a),
    onAgentEvent: (cb) => {
      cbs.add(cb);
      void connect();
      return () => cbs.delete(cb);
    },
  };
}

/** Build a client from env/flags: `--url`/OPENPAW_URL → HTTP, else local. */
export function getClient(opts: { url?: string; token?: string } = {}): Client {
  const url = opts.url || process.env.OPENPAW_URL;
  return url ? httpClient(url, opts.token || process.env.OPENPAW_TOKEN) : localClient();
}

/** Resolve provider + model from flags, the session, then saved defaults. */
export function resolveModel(
  settings: AppSettings,
  opts: { provider?: string; model?: string; sessionProvider?: string; sessionModel?: string },
): { providerId: string; modelId: string } {
  const providerId = opts.provider || opts.sessionProvider || settings.defaultProviderId || settings.providers[0]?.id;
  const modelId = opts.model || opts.sessionModel || settings.defaultModelId;
  if (!providerId) throw new Error('No provider configured. Add one in the app, or pass --provider.');
  if (!modelId) throw new Error('No model selected. Pass --model, or set a default in the app.');
  return { providerId, modelId };
}

/**
 * Run one chat turn to completion, auto-approving tool calls. Streams text via
 * onText and resolves with the full assistant message.
 */
export async function runChat(
  client: Client,
  args: { sessionId: string; providerId: string; modelId: string; text: string; onText?: (s: string) => void },
): Promise<string> {
  await client.ready();
  return new Promise((resolve, reject) => {
    let out = '';
    const off = client.onAgentEvent((e) => {
      if (e.sessionId !== args.sessionId) return;
      switch (e.type) {
        case 'text':
          out += e.delta;
          args.onText?.(e.delta);
          break;
        case 'tool_approval_required':
          void client.approveTool(e.sessionId, e.call.id, true);
          break;
        case 'done':
          off();
          resolve(out);
          break;
        case 'error':
          off();
          reject(new Error(e.message));
          break;
      }
    });
    client
      .sendChat({ sessionId: args.sessionId, providerId: args.providerId, modelId: args.modelId, text: args.text })
      .catch((err) => {
        off();
        reject(err);
      });
  });
}
