import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { createHost, createDispatcher } from '@open-paw/host';
import { IpcEvents } from '@open-paw/shared';
import { runRelayAgent } from './relay-agent.js';
import { runCli } from '@open-paw/cli';

/** Subcommands handled by the embedded CLI (so `npx open-paw mcp|chat|…` works). */
const CLI_SUBCOMMANDS = new Set(['mcp', 'chat', 'status', 'sessions', 'watch', 'help', 'version']);

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.OPENPAW_PORT ?? 4317);
const HOST = process.env.OPENPAW_HOST ?? '127.0.0.1';
const isLocal = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
const DATA_DIR = process.env.OPENPAW_DATA_DIR ?? join(homedir(), '.open-paw');
// Auth is required iff a token is configured. (Containers must bind 0.0.0.0 but
// are typically published only to the host's localhost, so we don't force a
// token just because of the bind address — set OPENPAW_TOKEN when truly exposed.)
const TOKEN = process.env.OPENPAW_TOKEN ?? '';
const requireAuth = TOKEN !== '';

// Find the built renderer: explicit override, then the bundled `web/` (published
// npx package), then the in-repo desktop build (dev).
function findRendererDir(): string {
  const candidates = [
    process.env.OPENPAW_RENDERER_DIR,
    resolve(__dirname, 'web'),
    resolve(__dirname, '../../desktop/out/renderer'),
  ].filter(Boolean) as string[];
  return candidates.find((d) => existsSync(join(d, 'index.html'))) ?? candidates[candidates.length - 1];
}
const RENDERER_DIR = findRendererDir();

async function main() {
  // Subcommand → embedded CLI (e.g. `npx open-paw mcp`, `open-paw status`).
  const sub = process.argv[2];
  if (sub && CLI_SUBCOMMANDS.has(sub)) {
    await runCli(process.argv.slice(2));
    return;
  }

  // Relay-agent mode: connect out to a relay instead of serving HTTP locally.
  if (process.env.OPENPAW_RELAY_URL && process.env.OPENPAW_ROOM) {
    await runRelayAgent({
      relayUrl: process.env.OPENPAW_RELAY_URL,
      room: process.env.OPENPAW_ROOM,
      key: process.env.OPENPAW_PAIR_KEY || randomUUID().slice(0, 8),
      dataDir: DATA_DIR,
    });
    return;
  }

  if (!existsSync(join(RENDERER_DIR, 'index.html'))) {
    console.error(
      `[open-paw] Renderer not found at ${RENDERER_DIR}.\n` +
        `Build it first (npm run build -w @open-paw/desktop) or set OPENPAW_RENDERER_DIR.`,
    );
    process.exit(1);
  }

  // Report this build's version (for the web edition's refresh-when-updated check).
  if (!process.env.OPENPAW_VERSION) {
    try {
      const { createRequire } = await import('node:module');
      process.env.OPENPAW_VERSION = createRequire(import.meta.url)('../package.json').version ?? '0.0.0';
    } catch {
      /* leave unset → host reports 0.0.0 */
    }
  }

  const host = createHost({ dataDir: DATA_DIR });
  const dispatch = createDispatcher(host);
  const app = Fastify({ bodyLimit: 25 * 1024 * 1024 });
  await app.register(websocket);

  // Auth: only enforced when a token is configured (OPENPAW_TOKEN).
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

  // Serve the built renderer (same UI as the desktop app).
  await app.register(fastifyStatic, { root: RENDERER_DIR, prefix: '/' });

  await app.listen({ port: PORT, host: HOST });
  const url = `http://${isLocal ? 'localhost' : HOST}:${PORT}`;
  console.log(`\n🐾 Open Paw web edition running at ${url}`);
  console.log(`   data dir: ${DATA_DIR}`);
  if (requireAuth) console.log(`   auth: token required (append ?token=… to the URL)`);
  else if (!isLocal)
    console.log(`   ⚠ bound to ${HOST} without a token — set OPENPAW_TOKEN to require auth before exposing publicly.`);
  console.log(`   (offline-first — only reaches the model servers + connectors you configure)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
