import { createHost, connectRelayAgent } from '@nekko/host';

/**
 * Relay-agent mode for the server CLI: create a host and expose it over a relay
 * (the heavy lifting lives in @nekko/host's connectRelayAgent, shared with the
 * desktop's in-app "remote access" feature).
 */
export async function runRelayAgent(opts: { relayUrl: string; room: string; key: string; dataDir: string }): Promise<void> {
  const host = createHost({ dataDir: opts.dataDir });
  connectRelayAgent(host, { relayUrl: opts.relayUrl, room: opts.room, key: opts.key });
  console.log(`\n🐾 Nekko relay-agent → ${opts.relayUrl}`);
  console.log(`   pair a client with:  room=${opts.room}  key=${opts.key}`);
  console.log(`   serving this machine's model + tools to paired clients (data: ${opts.dataDir})\n`);
}
