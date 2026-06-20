import { IpcEvents, deriveKey, seal, open } from '@nekko/shared';
import { createDispatcher } from './dispatch.js';
import type { Host } from './host.js';

export interface RelayAgentHandle {
  stop(): void;
}

/**
 * Expose an existing Host over a relay as an "agent": dial OUT to the relay,
 * answer encrypted requests for one room, and stream host events back. Lets a
 * remote client (phone / Nekko Cloud) drive this machine's model + tools with no
 * inbound ports. Traffic is end-to-end encrypted, so the relay sees only
 * ciphertext. Reconnects on drop until stop() is called.
 */
export function connectRelayAgent(
  host: Host,
  opts: { relayUrl: string; room: string; key: string },
): RelayAgentHandle {
  const dispatch = createDispatcher(host);
  const keyP = deriveKey(opts.key, opts.room);
  const url =
    `${opts.relayUrl.replace(/\/$/, '')}/relay?role=agent` +
    `&room=${encodeURIComponent(opts.room)}&key=${encodeURIComponent(opts.key)}`;

  let ws: WebSocket | null = null;
  let stopped = false;

  const sendSealed = async (obj: unknown) => {
    try {
      ws?.send(JSON.stringify({ enc: await seal(await keyP, obj) }));
    } catch {
      /* closing */
    }
  };

  const onAgent = (e: unknown) => sendSealed({ type: 'event', channel: IpcEvents.agentEvent, payload: e });
  const onIndex = (s: unknown) => sendSealed({ type: 'event', channel: IpcEvents.indexProgress, payload: s });
  host.events.on('agentEvent', onAgent);
  host.events.on('indexProgress', onIndex);

  const connect = () => {
    if (stopped) return;
    ws = new WebSocket(url);
    ws.onmessage = async (ev) => {
      let envelope: any;
      try {
        envelope = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      } catch {
        return;
      }
      if (!envelope.enc) return;
      let frame: any;
      try {
        frame = await open(await keyP, envelope.enc);
      } catch {
        return;
      }
      if (frame.type !== 'req') return;
      try {
        const result = await dispatch(frame.channel, frame.args ?? []);
        await sendSealed({ type: 'res', id: frame.id, result: result ?? null });
      } catch (e) {
        await sendSealed({ type: 'res', id: frame.id, error: (e as Error).message });
      }
    };
    ws.onclose = () => {
      if (!stopped) setTimeout(connect, 2000);
    };
    ws.onerror = () => ws?.close();
  };
  connect();

  return {
    stop() {
      stopped = true;
      host.events.off('agentEvent', onAgent);
      host.events.off('indexProgress', onIndex);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    },
  };
}
