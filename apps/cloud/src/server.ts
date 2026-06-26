import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { createHost, createDispatcher, withDataDir, type Host } from '@open-paw/host';
import { IpcChannels, IpcEvents } from '@open-paw/shared';
import { CloudStore, publicAccount, type Account } from './accounts.js';
import { entitlements, requireWithin } from './entitlements.js';

export interface CloudServerOptions {
  /** Root for cloud metadata + per-account data dirs. */
  dataRoot: string;
  /** Built renderer dir to serve (same UI as desktop/web). Optional for tests. */
  rendererDir?: string;
}

/**
 * Nekko Cloud server. Fronts the SAME host engine + dispatcher as every other
 * edition, but per authenticated account: each account gets an isolated data
 * dir (its own settings/sessions/memory) via `withDataDir`, and feature limits
 * are enforced server-side from the account's plan. The OSS app never does any
 * of this — it just runs locally.
 */
export function createCloudServer(opts: CloudServerOptions): { app: FastifyInstance; store: CloudStore } {
  const store = new CloudStore(opts.dataRoot);
  const app = Fastify({ bodyLimit: 25 * 1024 * 1024 });

  // One Host per account, created lazily inside the account's data scope so its
  // event emitter (and any future per-account state) stays isolated.
  const hosts = new Map<string, Host>();
  const hostFor = (account: Account): Host => {
    let host = hosts.get(account.id);
    if (!host) {
      const dir = store.dataDirFor(account.id);
      host = withDataDir(dir, () => createHost({ dataDir: dir }));
      hosts.set(account.id, host);
    }
    return host;
  };

  const bearer = (req: FastifyRequest): string | undefined => {
    const header = req.headers['authorization'];
    if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);
    return (req.query as Record<string, string> | undefined)?.token;
  };

  // Channels gated by plan limits before they run (count-based).
  const gate = (host: Host, account: Account, channel: string): void => {
    if (channel === IpcChannels.workspaceAddByPath) {
      requireWithin(account.plan, 'maxWorkspaces', host.listWorkspaces().length);
    }
  };

  app.register(async (api) => {
    await api.register(websocket);

    // --- Auth (unauthenticated) ---
    api.get('/api/auth/config', async () => ({ cloud: true }));

    api.post<{ Body: { email?: string; password?: string } }>('/api/auth/signup', async (req, reply) => {
      try {
        const { email = '', password = '' } = req.body ?? {};
        store.signup(email, password);
        const { token, account } = store.login(email, password);
        reply.send({ token, account: publicAccount(account), entitlements: entitlements(account.plan) });
      } catch (e) {
        reply.code(400).send({ error: (e as Error).message });
      }
    });

    api.post<{ Body: { email?: string; password?: string } }>('/api/auth/login', async (req, reply) => {
      try {
        const { email = '', password = '' } = req.body ?? {};
        const { token, account } = store.login(email, password);
        reply.send({ token, account: publicAccount(account), entitlements: entitlements(account.plan) });
      } catch (e) {
        reply.code(401).send({ error: (e as Error).message });
      }
    });

    api.post('/api/auth/logout', async (req, reply) => {
      store.logout(bearer(req));
      reply.send({ ok: true });
    });

    api.get('/api/auth/me', async (req, reply) => {
      const account = store.verifyToken(bearer(req));
      if (!account) return reply.code(401).send({ error: 'unauthorized' });
      reply.send({ account: publicAccount(account), entitlements: entitlements(account.plan) });
    });

    // --- Authenticated NekkoApi (per-account host, isolated data dir) ---
    api.post<{ Params: { channel: string }; Body: { args?: unknown[] } }>(
      '/api/:channel',
      async (req, reply) => {
        const account = store.verifyToken(bearer(req));
        if (!account) return reply.code(401).send({ error: 'unauthorized' });
        const host = hostFor(account);
        const dir = store.dataDirFor(account.id);
        try {
          const result = await withDataDir(dir, () => {
            gate(host, account, req.params.channel);
            return createDispatcher(host)(req.params.channel, req.body?.args ?? []);
          });
          reply.send(result ?? null);
        } catch (e) {
          reply.code(400).send({ error: (e as Error).message });
        }
      },
    );

    // Per-account event stream.
    api.get('/api/events', { websocket: true }, (socket: any, req) => {
      const account = store.verifyToken(bearer(req));
      if (!account) {
        socket.close();
        return;
      }
      const host = hostFor(account);
      const onAgent = (e: unknown) => socket.send(JSON.stringify({ channel: IpcEvents.agentEvent, payload: e }));
      const onIndex = (s: unknown) => socket.send(JSON.stringify({ channel: IpcEvents.indexProgress, payload: s }));
      const onTerminal = (e: unknown) => socket.send(JSON.stringify({ channel: IpcEvents.terminalEvent, payload: e }));
      host.events.on('agentEvent', onAgent);
      host.events.on('indexProgress', onIndex);
      host.events.on('terminalEvent', onTerminal);
      socket.on('close', () => {
        host.events.off('agentEvent', onAgent);
        host.events.off('indexProgress', onIndex);
        host.events.off('terminalEvent', onTerminal);
      });
    });
  });

  // Serve the renderer (same UI as desktop/web) when a build is available.
  if (opts.rendererDir && existsSync(join(opts.rendererDir, 'index.html'))) {
    app.register(fastifyStatic, { root: opts.rendererDir, prefix: '/' });
  }

  return { app, store };
}
