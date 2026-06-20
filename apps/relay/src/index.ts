import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Nekko relay — the piece that lets a remote client (e.g. your phone, or Nekko
 * Cloud) reach a local agent (your desktop/server) without inbound ports. Both
 * ends dial in over an outbound WebSocket and are matched by a room code; the
 * relay just forwards frames between them. It never inspects payloads beyond the
 * routing envelope, so it can carry end-to-end-encrypted traffic unchanged.
 *
 * Frames (JSON):
 *   client → agent:  { type:'req', id, channel, args }
 *   agent  → client: { type:'res', id, result } | { type:'res', id, error }
 *   agent  → client: { type:'event', channel, payload }
 *   relay  → client: { type:'agent-offline' } | { type:'agent-online' }
 *
 * This is a prototype: rooms are in-memory and pairing is by shared code. Auth,
 * E2E key exchange, and persistence come in later slices.
 */

interface Room {
  agent: any | null;
  clients: Set<any>;
  /** sha256 of the pairing key, claimed by the agent; clients must match. */
  keyHash: string | null;
}

const rooms = new Map<string, Room>();
const room = (code: string): Room => {
  let r = rooms.get(code);
  if (!r) {
    r = { agent: null, clients: new Set(), keyHash: null };
    rooms.set(code, r);
  }
  return r;
};

const PORT = Number(process.env.NEKKO_RELAY_PORT ?? 4400);
const HOST = process.env.NEKKO_RELAY_HOST ?? '0.0.0.0';

async function main() {
  const app = Fastify();
  await app.register(websocket);

  app.get('/relay', { websocket: true }, (socket: any, req) => {
    const q = req.query as Record<string, string>;
    const code = q.room;
    const role = q.role; // 'agent' | 'client'
    const key = q.key;
    if (!code || !key || (role !== 'agent' && role !== 'client')) {
      socket.close(1008, 'room + role + key required');
      return;
    }
    const hash = sha256(key);
    const r = room(code);

    if (role === 'agent') {
      // First agent claims the room's key; a reconnecting agent must match it.
      if (r.keyHash && r.keyHash !== hash) {
        socket.close(1008, 'bad pairing key');
        cleanup(code);
        return;
      }
      r.keyHash = hash;
      if (r.agent) r.agent.close(1000, 'replaced by a newer agent');
      r.agent = socket;
      for (const c of r.clients) safeSend(c, { type: 'agent-online' });
      // Agent → clients: forward responses + events verbatim.
      socket.on('message', (data: Buffer) => {
        for (const c of r.clients) c.send(data.toString());
      });
      socket.on('close', () => {
        if (r.agent === socket) r.agent = null;
        for (const c of r.clients) safeSend(c, { type: 'agent-offline' });
        cleanup(code);
      });
    } else {
      // Clients can only join a room an agent has claimed, with the right key.
      if (!r.keyHash) {
        socket.close(1008, 'room not paired (agent offline)');
        cleanup(code);
        return;
      }
      if (r.keyHash !== hash) {
        socket.close(1008, 'bad pairing key');
        cleanup(code);
        return;
      }
      r.clients.add(socket);
      safeSend(socket, { type: r.agent ? 'agent-online' : 'agent-offline' });
      // Client → agent: forward requests.
      socket.on('message', (data: Buffer) => {
        if (r.agent) r.agent.send(data.toString());
        else safeSend(socket, { type: 'agent-offline' });
      });
      socket.on('close', () => {
        r.clients.delete(socket);
        cleanup(code);
      });
    }
  });

  app.get('/healthz', async () => ({ ok: true, rooms: rooms.size }));

  await app.listen({ port: PORT, host: HOST });
  console.log(`\n🐾 Nekko relay listening on ws://${HOST}:${PORT}/relay\n`);
}

function safeSend(socket: any, obj: unknown) {
  try {
    socket.send(JSON.stringify(obj));
  } catch {
    /* socket closing */
  }
}

function cleanup(code: string) {
  const r = rooms.get(code);
  if (r && !r.agent && r.clients.size === 0) rooms.delete(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
