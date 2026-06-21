/** IPC channel contracts between renderer and main. */

import type { AppSettings, UsageSummary } from './settings.js';
import type { ProviderConfig, ModelInfo } from './models.js';
import type { Session, SendOptions, AgentEvent } from './chat.js';
import type { ContextBundle } from './context.js';
import type { MemoryEntry, MemoryScope } from './memory.js';
import type { WorkspaceFolder, IndexStatus, SearchHit, IndexedFile } from './workspace.js';
import type { ConnectorConfig, ConnectorKind, ConnectorResource } from './connectors.js';
import type { GuardrailRule } from './guardrails.js';
import type { AppInfo, UpdateInfo } from './update.js';

/** Invoke (request/response) channels. */
export const IpcChannels = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  providersList: 'providers:list',
  providersSave: 'providers:save',
  providersRemove: 'providers:remove',
  providersDiscover: 'providers:discover',
  providersTest: 'providers:test',
  providersTestConfig: 'providers:testConfig',

  modelsList: 'models:list',
  modelPull: 'model:pull',
  modelLoad: 'model:load',
  modelUnload: 'model:unload',

  sessionsList: 'sessions:list',
  sessionCreate: 'session:create',
  sessionGet: 'session:get',
  sessionDelete: 'session:delete',
  sessionSetWorkspace: 'session:setWorkspace',
  chatSend: 'chat:send',
  chatAbort: 'chat:abort',
  toolApprove: 'tool:approve',

  contextPreview: 'context:preview',
  contextToggle: 'context:toggle',
  contextSetPrefs: 'context:setPrefs',
  sessionSetAttachments: 'session:setAttachments',
  specBuild: 'spec:build',
  specSetLinked: 'spec:setLinked',
  specPath: 'spec:path',
  sessionSetOptions: 'session:setOptions',
  sessionTruncate: 'session:truncate',
  sessionsClear: 'sessions:clear',
  settingsReset: 'settings:reset',
  dataWipe: 'data:wipe',
  toolsList: 'tools:list',

  // Transport-local (handled by Electron main / web-client, not the host dispatcher)
  dialogOpenFiles: 'dialog:openFiles',
  openPath: 'shell:openPath',

  memoryList: 'memory:list',
  memorySave: 'memory:save',
  memoryDelete: 'memory:delete',

  workspaceList: 'workspace:list',
  workspaceAdd: 'workspace:add',
  workspaceAddByPath: 'workspace:addByPath',
  workspaceRemove: 'workspace:remove',
  workspaceIndex: 'workspace:index',
  workspaceIndexStatus: 'workspace:indexStatus',
  workspaceSearch: 'workspace:search',
  workspaceFiles: 'workspace:files',

  connectorsList: 'connectors:list',
  connectorConnect: 'connector:connect',
  connectorDisconnect: 'connector:disconnect',
  connectorFetch: 'connector:fetch',

  guardrailsClassify: 'guardrails:classify',

  usageSummary: 'usage:summary',

  remoteEnable: 'remote:enable',
  remoteDisable: 'remote:disable',
  remoteStatus: 'remote:status',

  appInfo: 'app:info',
  mcpStatus: 'mcp:status',
  // Transport-local update controls (desktop = electron-updater, web = refresh).
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',

  dialogOpenFolder: 'dialog:openFolder',
} as const;

/** Push (main → renderer) channels. */
export const IpcEvents = {
  agentEvent: 'agent:event',
  indexProgress: 'index:progress',
  updateEvent: 'update:event',
} as const;

/** The typed API the preload bridge exposes as window.nekko. */
export interface NekkoApi {
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;

  listProviders(): Promise<ProviderConfig[]>;
  saveProvider(p: ProviderConfig): Promise<ProviderConfig[]>;
  removeProvider(id: string): Promise<ProviderConfig[]>;
  discoverProviders(): Promise<ProviderConfig[]>;
  testProvider(id: string): Promise<{ ok: boolean; message: string }>;
  /** Test an unsaved provider config (used by the add form before saving). */
  testProviderConfig(cfg: ProviderConfig): Promise<{ ok: boolean; message: string }>;

  listModels(providerId: string): Promise<ModelInfo[]>;
  pullModel(providerId: string, model: string): Promise<{ ok: boolean; message: string }>;
  loadModel(providerId: string, model: string): Promise<{ ok: boolean }>;
  unloadModel(providerId: string, model: string): Promise<{ ok: boolean }>;

  listSessions(): Promise<Session[]>;
  createSession(workspaceId?: string): Promise<Session>;
  getSession(id: string): Promise<Session | null>;
  deleteSession(id: string): Promise<void>;
  setSessionWorkspace(sessionId: string, workspaceId?: string): Promise<Session | null>;
  setSessionAttachments(sessionId: string, paths: string[]): Promise<Session | null>;
  sendChat(opts: SendOptions): Promise<void>;
  abortChat(sessionId: string): Promise<void>;
  approveTool(sessionId: string, toolCallId: string, approved: boolean): Promise<void>;

  previewContext(sessionId: string, attachedPaths: string[]): Promise<ContextBundle>;
  toggleContextItem(sessionId: string, itemId: string, included: boolean, pinned: boolean): Promise<ContextBundle>;
  setContextPrefs(sessionId: string, prefs: import('./chat.js').ContextPrefs): Promise<void>;

  /** Build/refresh a spec.md in the chat's workspace from the conversation. */
  buildSpec(sessionId: string): Promise<{ ok: boolean; path?: string; message?: string }>;
  setSpecLinked(sessionId: string, linked: boolean): Promise<Session | null>;
  specPath(sessionId: string): Promise<string | null>;
  setSessionOptions(
    id: string,
    patch: Partial<Pick<Session, 'title' | 'pinned' | 'mode' | 'disabledTools' | 'offline' | 'incognito'>>,
  ): Promise<Session | null>;
  truncateSession(id: string, messageId: string): Promise<Session | null>;
  /** Delete chats within a window; returns how many were removed. */
  clearSessions(scope: import('./chat.js').ChatClearScope): Promise<number>;
  /** Reset all settings to defaults (keeps chats). */
  resetSettings(): Promise<AppSettings>;
  /** Delete everything: chats, settings, memory, and usage. */
  wipeAllData(): Promise<AppSettings>;
  listTools(): Promise<Array<{ name: string; description: string }>>;

  /** Open a native file picker (desktop) → chosen paths; browser → prompt. */
  openFilesDialog(): Promise<string[]>;
  /** Reveal/open a path with the OS (desktop) or a URL (web). */
  openPath(path: string): Promise<void>;

  listMemory(scope: MemoryScope, workspaceId?: string): Promise<MemoryEntry[]>;
  saveMemory(entry: MemoryEntry): Promise<MemoryEntry[]>;
  deleteMemory(id: string): Promise<void>;

  listWorkspaces(): Promise<WorkspaceFolder[]>;
  addWorkspace(): Promise<WorkspaceFolder[]>;
  addWorkspaceByPath(path: string): Promise<WorkspaceFolder[]>;
  removeWorkspace(id: string): Promise<WorkspaceFolder[]>;
  indexWorkspace(id: string): Promise<IndexStatus>;
  getIndexStatus(id: string): Promise<IndexStatus | null>;
  searchWorkspace(id: string, query: string): Promise<SearchHit[]>;
  listFiles(id: string): Promise<IndexedFile[]>;

  listConnectors(): Promise<ConnectorConfig[]>;
  connectConnector(kind: ConnectorKind, token: string, settings?: Record<string, string>): Promise<ConnectorConfig[]>;
  disconnectConnector(kind: ConnectorKind): Promise<ConnectorConfig[]>;
  fetchConnector(kind: ConnectorKind, query?: string): Promise<ConnectorResource[]>;

  classifyCommand(command: string): Promise<import('./guardrails.js').GuardrailDecision>;
  saveGuardrail(rule: GuardrailRule): Promise<GuardrailRule[]>;

  getUsageSummary(): Promise<UsageSummary>;

  enableRemote(relayUrl: string): Promise<import('./remote.js').RemoteStatus>;
  disableRemote(): Promise<import('./remote.js').RemoteStatus>;
  getRemoteStatus(): Promise<import('./remote.js').RemoteStatus>;

  /** Running version + edition. */
  getAppInfo(): Promise<AppInfo>;
  /** Connect configured MCP servers and return their status + tools. */
  getMcpStatus(): Promise<import('./mcp.js').McpServerStatus[]>;
  /** Check for a newer version (desktop: GitHub feed; web: server version). */
  checkForUpdates(): Promise<UpdateInfo>;
  /** Download the available update (desktop only; web resolves immediately). */
  downloadUpdate(): Promise<UpdateInfo>;
  /** Install + relaunch (desktop) or reload the page (web). */
  quitAndInstall(): Promise<void>;

  onAgentEvent(cb: (e: AgentEvent) => void): () => void;
  onIndexProgress(cb: (s: IndexStatus) => void): () => void;
  onUpdateEvent(cb: (u: UpdateInfo) => void): () => void;
}
