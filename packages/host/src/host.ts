import { EventEmitter } from 'events';
import { basename } from 'path';
import type {
  AppSettings,
  ProviderConfig,
  ModelInfo,
  Session,
  SendOptions,
  ContextBundle,
  MemoryEntry,
  MemoryScope,
  WorkspaceFolder,
  IndexStatus,
  SearchHit,
  IndexedFile,
  ConnectorConfig,
  ConnectorKind,
  ConnectorResource,
  GuardrailDecision,
  UsageSummary,
  RemoteStatus,
  AppInfo,
  McpServerStatus,
} from '@open-paw/shared';
import {
  createProvider,
  discoverLocalProviders,
  OllamaProvider,
  getConnector,
  classifyCommand,
  BUILTIN_TOOLS,
} from '@open-paw/core';
import { setDataDir, dataDir } from './paths.js';
import { getSettings, saveSettings, resetSettings } from './store.js';
import * as sessions from './sessions.js';
import * as memory from './memory.js';
import { usageSummary, clearUsage } from './usage.js';
import { indexWorkspace, getIndexStatus, searchWorkspace, listIndexedFiles } from './workspace.js';
import { sendChat, abortChat, resolveApproval, previewContext, setContextPrefs } from './chat.js';
import { buildSpec, specPathForSession } from './spec.js';
import { connectRelayAgent, type RelayAgentHandle } from './relay.js';
import { syncMcp, mcpStatus } from './mcp.js';
import { randomUUID } from 'crypto';

/**
 * The transport-agnostic host. `createHost()` returns an object implementing the
 * full NekkoApi surface (sans the renderer-side `on*` subscriptions, which are
 * served by `events`) plus a couple of methods the UI layer drives differently
 * per runtime (e.g. `addWorkspaceByPath`, since Electron uses a native dialog
 * while the web server takes a path string).
 *
 * Every edition — Electron, the web server, Nekko Cloud — wraps the same Host.
 */
export interface Host {
  /** Emits 'agentEvent' (AgentEvent) and 'indexProgress' (IndexStatus). */
  readonly events: EventEmitter;
  dataDir(): string;

  getSettings(): AppSettings;
  updateSettings(patch: Partial<AppSettings>): AppSettings;

  listProviders(): ProviderConfig[];
  saveProvider(p: ProviderConfig): ProviderConfig[];
  removeProvider(id: string): ProviderConfig[];
  discoverProviders(): Promise<ProviderConfig[]>;
  testProvider(id: string): Promise<{ ok: boolean; message: string }>;
  testProviderConfig(cfg: ProviderConfig): Promise<{ ok: boolean; message: string }>;

  listModels(providerId: string): Promise<ModelInfo[]>;
  pullModel(providerId: string, model: string): Promise<{ ok: boolean; message: string }>;
  loadModel(providerId: string, model: string): Promise<{ ok: boolean }>;
  unloadModel(providerId: string, model: string): Promise<{ ok: boolean }>;

  listSessions(): Session[];
  createSession(workspaceId?: string): Session;
  getSession(id: string): Session | null;
  deleteSession(id: string): void;
  setSessionWorkspace(id: string, workspaceId?: string): Session | null;
  setSessionAttachments(id: string, paths: string[]): Session | null;
  sendChat(opts: SendOptions): Promise<void>;
  abortChat(sessionId: string): void;
  approveTool(sessionId: string, toolCallId: string, approved: boolean): void;

  previewContext(sessionId: string, attachedPaths: string[]): Promise<ContextBundle>;
  setContextPrefs(sessionId: string, prefs: { excluded: string[]; pinned: string[] }): void;

  buildSpec(sessionId: string): Promise<{ ok: boolean; path?: string; message?: string }>;
  setSpecLinked(sessionId: string, linked: boolean): Session | null;
  specPath(sessionId: string): string | null;
  setSessionOptions(
    id: string,
    patch: Partial<Pick<Session, 'title' | 'pinned' | 'mode' | 'disabledTools' | 'offline' | 'incognito'>>,
  ): Session | null;
  truncateSession(id: string, messageId: string): Session | null;
  clearSessions(scope: 'today' | 'month' | 'all'): number;
  resetSettings(): AppSettings;
  wipeAllData(): AppSettings;
  listTools(): Array<{ name: string; description: string }>;

  listMemory(scope: MemoryScope, workspaceId?: string): MemoryEntry[];
  saveMemory(entry: MemoryEntry): MemoryEntry[];
  deleteMemory(id: string): void;

  listWorkspaces(): WorkspaceFolder[];
  addWorkspaceByPath(path: string): WorkspaceFolder[];
  removeWorkspace(id: string): WorkspaceFolder[];
  indexWorkspace(id: string): IndexStatus;
  getIndexStatus(id: string): IndexStatus | null;
  searchWorkspace(id: string, query: string): SearchHit[];
  listFiles(id: string): IndexedFile[];

  listConnectors(): ConnectorConfig[];
  connectConnector(kind: ConnectorKind, token: string, settings?: Record<string, string>): ConnectorConfig[];
  disconnectConnector(kind: ConnectorKind): ConnectorConfig[];
  fetchConnector(kind: ConnectorKind, query?: string): Promise<ConnectorResource[]>;

  classifyCommand(command: string): GuardrailDecision;
  usageSummary(): UsageSummary;

  /** Expose this machine over a relay so a remote client can reach it. */
  enableRemote(relayUrl: string): RemoteStatus;
  disableRemote(): RemoteStatus;
  remoteStatus(): RemoteStatus;
  appInfo(): AppInfo;
  /** Connect (or reconnect) configured MCP servers and return their status. */
  mcpStatus(): Promise<McpServerStatus[]>;
}

export function createHost(opts: { dataDir: string }): Host {
  setDataDir(opts.dataDir);
  const events = new EventEmitter();
  const onIndexProgress = (s: IndexStatus) => events.emit('indexProgress', s);

  const findProvider = (id: string) => getSettings().providers.find((p) => p.id === id);

  let remote: { handle: RelayAgentHandle; status: RemoteStatus } | null = null;

  const host: Host = {
    events,
    dataDir,

    getSettings,
    updateSettings: (patch) => saveSettings(patch),

    listProviders: () => getSettings().providers,
    saveProvider: (p) => {
      const providers = getSettings().providers.filter((x) => x.id !== p.id);
      providers.push(p);
      return saveSettings({ providers }).providers;
    },
    removeProvider: (id) => {
      const providers = getSettings().providers.filter((x) => x.id !== id);
      return saveSettings({ providers }).providers;
    },
    discoverProviders: async () => {
      const discovered = await discoverLocalProviders();
      const merged = [...getSettings().providers];
      for (const d of discovered) if (!merged.some((p) => p.baseUrl === d.baseUrl)) merged.push(d);
      return saveSettings({ providers: merged }).providers;
    },
    testProvider: async (id) => {
      const p = findProvider(id);
      return p ? createProvider(p).test() : { ok: false, message: 'Not found' };
    },
    testProviderConfig: async (cfg) => {
      try {
        return await createProvider(cfg).test();
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },

    listModels: async (providerId) => {
      const p = findProvider(providerId);
      if (!p) return [];
      try {
        return await createProvider(p).listModels();
      } catch {
        return [];
      }
    },
    pullModel: async (providerId, model) => {
      const p = findProvider(providerId);
      if (!p || p.kind !== 'ollama') return { ok: false, message: 'Pull supported on Ollama only.' };
      try {
        await new OllamaProvider(p).pull(model);
        return { ok: true, message: `Pulled ${model}` };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
    loadModel: async (providerId, model) => {
      const p = findProvider(providerId);
      if (p?.kind === 'ollama') await new OllamaProvider(p).setLoaded(model, true);
      return { ok: true };
    },
    unloadModel: async (providerId, model) => {
      const p = findProvider(providerId);
      if (p?.kind === 'ollama') await new OllamaProvider(p).setLoaded(model, false);
      return { ok: true };
    },

    listSessions: sessions.listSessions,
    createSession: sessions.createSession,
    getSession: sessions.getSession,
    deleteSession: sessions.deleteSession,
    setSessionWorkspace: sessions.setSessionWorkspace,
    setSessionAttachments: sessions.setSessionAttachments,
    buildSpec,
    setSpecLinked: sessions.setSpecLinked,
    specPath: specPathForSession,
    setSessionOptions: sessions.setSessionOptions,
    truncateSession: sessions.truncateSession,
    clearSessions: sessions.clearSessions,
    resetSettings,
    wipeAllData: () => {
      sessions.clearSessions('all');
      memory.clearMemory();
      clearUsage();
      return resetSettings();
    },
    listTools: () => BUILTIN_TOOLS.map((t) => ({ name: t.name, description: t.description })),
    sendChat: (o) => sendChat(o, (e) => events.emit('agentEvent', e)),
    abortChat,
    approveTool: (_sessionId, toolCallId, approved) => resolveApproval(toolCallId, approved),

    previewContext,
    setContextPrefs,

    listMemory: memory.listMemory,
    saveMemory: (entry) => {
      memory.saveMemory(entry);
      return memory.listMemory(entry.scope, entry.workspaceId);
    },
    deleteMemory: memory.deleteMemory,

    listWorkspaces: () => getSettings().workspaces,
    addWorkspaceByPath: (path) => {
      const folder: WorkspaceFolder = {
        id: `ws_${Date.now().toString(36)}`,
        name: basename(path),
        path,
        addedAt: Date.now(),
      };
      const workspaces = [...getSettings().workspaces, folder];
      saveSettings({ workspaces });
      setTimeout(() => indexWorkspace(folder, onIndexProgress), 50);
      return workspaces;
    },
    removeWorkspace: (id) => {
      const workspaces = getSettings().workspaces.filter((w) => w.id !== id);
      return saveSettings({ workspaces }).workspaces;
    },
    indexWorkspace: (id) => {
      const folder = getSettings().workspaces.find((w) => w.id === id);
      if (!folder) throw new Error('Workspace not found');
      return indexWorkspace(folder, onIndexProgress);
    },
    getIndexStatus,
    searchWorkspace: (id, query) => {
      const folder = getSettings().workspaces.find((w) => w.id === id);
      return folder ? searchWorkspace(folder, query) : [];
    },
    listFiles: listIndexedFiles,

    listConnectors: () => getSettings().connectors,
    connectConnector: (kind, token, settings) => {
      const connectors = getSettings().connectors.filter((c) => c.kind !== kind);
      connectors.push({ kind, connected: true, token, settings, connectedAt: Date.now() });
      return saveSettings({ connectors }).connectors;
    },
    disconnectConnector: (kind) => {
      const connectors = getSettings().connectors.filter((c) => c.kind !== kind);
      return saveSettings({ connectors }).connectors;
    },
    fetchConnector: async (kind, query) => {
      const cfg = getSettings().connectors.find((c) => c.kind === kind);
      if (!cfg?.connected || !cfg.token) throw new Error('Connector not connected');
      return getConnector(kind).fetch(cfg.token, query, cfg.settings);
    },

    classifyCommand: (command) => classifyCommand(command, getSettings().guardrails),
    usageSummary,

    enableRemote: (relayUrl) => {
      if (remote) remote.handle.stop();
      const room = randomUUID().slice(0, 6);
      const key = randomUUID().replace(/-/g, '').slice(0, 16);
      const handle = connectRelayAgent(host, { relayUrl, room, key });
      remote = { handle, status: { enabled: true, relayUrl, room, key } };
      return remote.status;
    },
    disableRemote: () => {
      if (remote) {
        remote.handle.stop();
        remote = null;
      }
      return { enabled: false };
    },
    remoteStatus: () => (remote ? remote.status : { enabled: false }),
    appInfo: () => ({ version: process.env.OPENPAW_VERSION ?? '0.0.0', platform: process.platform, edition: 'web' }),
    mcpStatus: async () => {
      const configs = getSettings().mcpServers ?? [];
      await syncMcp(configs);
      return mcpStatus(configs);
    },
  };
  return host;
}
