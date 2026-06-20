/**
 * @nekko/host — the transport-agnostic host. Bundles every service (settings,
 * sessions, chat orchestration, sandboxed tools, workspace index, memory, usage,
 * connectors) behind `createHost()`. Electron, the web server, and Nekko Cloud
 * all wrap the same Host so they run identical behavior.
 */
export { createHost, type Host } from './host.js';
export { createDispatcher } from './dispatch.js';
export { connectRelayAgent, type RelayAgentHandle } from './relay.js';
export { dataDir, setDataDir } from './paths.js';
