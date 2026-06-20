import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { createHost, createDispatcher } from '@nekko/host';
import { IpcEvents } from '@nekko/shared';
import { runRelayAgent } from './relay-agent.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.NEKKO_PORT ?? 4317);
const HOST = process.env.NEKKO_HOST ?? '127.0.0.1';
const isLocal = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
const DATA_DIR = process.env.NEKKO_DATA_DIR ?? join(homedir(), '.nekko-paw');
// Auth is required iff a token is configured. (Containers must bind 0.0.0.0 but
// are typically published only to the host's localhost, so we don't force a
// token just because of the bind address — set NEKKO_TOKEN when truly exposed.)
const TOKEN = process.env.NEKKO_TOKEN ?? '';
const requireAuth = TOKEN !== '';

const RENDERER_DIR =
  process.env.NEKKO_RENDERER_DIR ?? resolve(__dirname, '../../desktop/out/renderer');

async function main() {
  // Relay-agent mode: connect out to a relay instead of serving HTTP locally.
  if (process.env.NEKKO_RELAY_URL && process.env.NEKKO_ROOM) {
    runRelayAgent({
      relayUrl: process.env.NEKKO_RELAY_URL,
      room: process.env.NEKKO_ROOM,
      key: process.env.NEKKO_PAIR_KEY || randomUUID().slice(0, 8),
      dataDir: DATA_DIR,
    });
    return;
  }

  if (!existsSync(join(RENDERER_DIR, 'index.html'))) {
    console.error(
      `[nekko] Renderer not found at ${RENDERER_DIR}.\n` +
        `Build it first (npm run build -w @nekko/desktop) or set NEKKO_RENDERER_DIR.`,
    );
    process.exit(1);
  }

  const host = createHost({ dataDir: DATA_DIR });
  const dispatch = createDispatcher(host);
  const app = Fastify({ bodyLimit: 25 * 1024 * 1024 });
  await app.register(websocket);

  // Auth: only enforced when a token is configured (NEKKO_TOKEN).
  const authorized = (suppliedToken: string | undefined) => !requireAuth || suppliedToken === TOKEN;

  app.addHook('onRequest', async (req, reply) => {
    if (!requireAuth || !req.url.startsWith('/api/')) return;
    const header = req.headers['authorization'];
    const bearer = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    const q = (req.query as Record<string, string> | undefined)?.token;
    if (!authorized(bearer ?? q)) reply.code(401).send({ error: 'unauthorized' });
  });

  // One HTTP route fronts the whole NekkoApi via the shared dispatcher.
  app.post<{ Params: { channel: string }; Body: { args?: unknown[] } }>('/api/:channel', async (req, reply) => {
    try {
      const result = await dispatch(req.params.channel, req.body?.args ?? []);
      reply.send(result ?? null);
    } catch (e) {
      reply.code(400).send({ error: (e as Error).message });
    }
  });

  // Stream agent + index events over a WebSocket.
  app.get('/api/events', { websocket: true }, (socket: any, req) => {
    if (requireAuth) {
      const q = (req.query as Record<string, string> | undefined)?.token;
      if (!authorized(q)) {
        socket.close();
        return;
      }
    }
    const onAgent = (e: unknown) => socket.send(JSON.stringify({ channel: IpcEvents.agentEvent, payload: e }));
    const onIndex = (s: unknown) => socket.send(JSON.stringify({ channel: IpcEvents.indexProgress, payload: s }));
    host.events.on('agentEvent', onAgent);
    host.events.on('indexProgress', onIndex);
    socket.on('close', () => {
      host.events.off('agentEvent', onAgent);
      host.events.off('indexProgress', onIndex);
    });
  });

  // Serve the built renderer (same UI as the desktop app).
  await app.register(fastifyStatic, { root: RENDERER_DIR, prefix: '/' });

  await app.listen({ port: PORT, host: HOST });
  const url = `http://${isLocal ? 'localhost' : HOST}:${PORT}`;
  console.log(`\n🐾 Nekko Paw web edition running at ${url}`);
  console.log(`   data dir: ${DATA_DIR}`);
  if (requireAuth) console.log(`   auth: token required (append ?token=… to the URL)`);
  else if (!isLocal)
    console.log(`   ⚠ bound to ${HOST} without a token — set NEKKO_TOKEN to require auth before exposing publicly.`);
  console.log(`   (offline-first — only reaches the model servers + connectors you configure)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
