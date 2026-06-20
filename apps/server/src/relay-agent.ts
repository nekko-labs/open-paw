import { createHost, createDispatcher } from '@nekko/host';
import { IpcEvents } from '@nekko/shared';

/**
 * Relay-agent mode: instead of serving HTTP locally, dial OUT to a relay and
 * answer requests for one room. This is how a phone / Nekko Cloud reaches the
 * model + tools running on this machine — no inbound ports. Uses the global
 * WebSocket (Node 21+). Reconnects on drop.
 */
export function runRelayAgent(opts: { relayUrl: string; room: string; key: string; dataDir: string }): void {
  const host = createHost({ dataDir: opts.dataDir });
  const dispatch = createDispatcher(host);

  const url =
    `${opts.relayUrl.replace(/\/$/, '')}/relay?role=agent` +
    `&room=${encodeURIComponent(opts.room)}&key=${encodeURIComponent(opts.key)}`;
  let ws: WebSocket | null = null;

  const send = (obj: unknown) => {
    try {
      ws?.send(JSON.stringify(obj));
    } catch {
      /* closing */
    }
  };

  // Stream host events to whoever is connected through the relay.
  host.events.on('agentEvent', (e) => send({ type: 'event', channel: IpcEvents.agentEvent, payload: e }));
  host.events.on('indexProgress', (s) => send({ type: 'event', channel: IpcEvents.indexProgress, payload: s }));

  const connect = () => {
    ws = new WebSocket(url);
    ws.onopen = () => console.log(`[relay-agent] connected to room "${opts.room}"`);
    ws.onmessage = async (ev) => {
      let frame: any;
      try {
        frame = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      } catch {
        return;
      }
      if (frame.type !== 'req') return;
      try {
        const result = await dispatch(frame.channel, frame.args ?? []);
        send({ type: 'res', id: frame.id, result: result ?? null });
      } catch (e) {
        send({ type: 'res', id: frame.id, error: (e as Error).message });
      }
    };
    ws.onclose = () => {
      console.log('[relay-agent] disconnected; retrying in 2s');
      setTimeout(connect, 2000);
    };
    ws.onerror = () => ws?.close();
  };
  connect();

  console.log(`\n🐾 Nekko relay-agent → ${opts.relayUrl}`);
  console.log(`   pair a client with:  room=${opts.room}  key=${opts.key}`);
  console.log(`   serving this machine's model + tools to paired clients (data: ${opts.dataDir})\n`);
}
