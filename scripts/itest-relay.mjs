// Proves the relay path: remote client → relay → local agent (host) → model.
// Starts the relay + a relay-agent (configured for LM Studio), connects a plain
// WebSocket client, and runs host calls through the relay.
// Usage: node scripts/itest-relay.mjs [baseUrl] [model]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const baseUrl = process.argv[2] || 'http://10.5.0.2:1338';
const model = process.argv[3] || 'google/gemma-4-31b-qat';
const ROOM = 'itest-room';
const PAIR_KEY = 'secret123';
const RELAY_PORT = 4455;

const dataDir = mkdtempSync(join(tmpdir(), 'nekko-relay-'));
// Pre-seed the agent's settings with the LM Studio provider.
writeFileSync(
  join(dataDir, 'settings.json'),
  JSON.stringify({
    providers: [{ id: 'lm', kind: 'lmstudio', label: 'LM Studio', baseUrl, enabled: true }],
  }),
);

const procs = [];
const stop = () => procs.forEach((p) => p.kill());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. relay
procs.push(
  spawn('node', ['apps/relay/dist/index.js'], {
    env: { ...process.env, NEKKO_RELAY_PORT: String(RELAY_PORT), NEKKO_RELAY_HOST: '127.0.0.1' },
    stdio: 'ignore',
  }),
);
await sleep(800);

// 2. relay-agent (the "local machine")
procs.push(
  spawn('node', ['apps/server/dist/index.js'], {
    env: {
      ...process.env,
      NEKKO_RELAY_URL: `ws://127.0.0.1:${RELAY_PORT}`,
      NEKKO_ROOM: ROOM,
      NEKKO_PAIR_KEY: PAIR_KEY,
      NEKKO_DATA_DIR: dataDir,
    },
    stdio: 'ignore',
  }),
);
await sleep(1200);

// 3a. a client with the WRONG key must be rejected
const wrongKeyRejected = await new Promise((resolve) => {
  const bad = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}/relay?role=client&room=${ROOM}&key=nope`);
  bad.onclose = () => resolve(true);
  bad.onopen = () => bad.send(JSON.stringify({ type: 'req', id: 0, channel: 'settings:get', args: [] }));
  setTimeout(() => resolve(false), 3000);
});
console.log('wrong-key client rejected:', wrongKeyRejected);

// 3b. remote client with the correct key
const ws = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}/relay?role=client&room=${ROOM}&key=${PAIR_KEY}`);
const pending = new Map();
let nextId = 1;
const call = (channel, ...args) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ type: 'req', id, channel, args }));
    setTimeout(() => pending.has(id) && reject(new Error(`timeout: ${channel}`)), 20000);
  });

ws.onmessage = (ev) => {
  const f = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
  if (f.type === 'res' && pending.has(f.id)) {
    const { resolve, reject } = pending.get(f.id);
    pending.delete(f.id);
    f.error ? reject(new Error(f.error)) : resolve(f.result);
  }
};

await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('client ws failed'));
});

try {
  const test = await call('providers:test', 'lm');
  console.log('providers:test →', test);
  const models = await call('models:list', 'lm');
  console.log('models:list →', models.slice(0, 3).map((m) => m.id).join(', '));
  const pass = test.ok && models.some((m) => m.id === model) && wrongKeyRejected;
  console.log(`\n${pass ? 'RELAY PATH PASS ✅' : 'FAIL ❌'} — paired client reached the local model; wrong key rejected`);
  stop();
  process.exit(pass ? 0 : 1);
} catch (e) {
  console.error('FAIL ❌', e.message);
  stop();
  process.exit(1);
}
