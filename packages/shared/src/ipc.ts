/** IPC channel contracts between renderer and main. */

import type { AppSettings, UsageSummary } from './settings.js';
import type { ProviderConfig, ModelInfo } from './models.js';
import type { Session, SendOptions, AgentEvent } from './chat.js';
import type { ContextBundle } from './context.js';
import type { MemoryEntry, MemoryScope } from './memory.js';
import type { WorkspaceFolder, IndexStatus, SearchHit, IndexedFile } from './workspace.js';
import type { ConnectorConfig, ConnectorKind, ConnectorResource } from './connectors.js';
import type { GuardrailRule } from './guardrails.js';

/** Invoke (request/response) channels. */
export const IpcChannels = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  providersList: 'providers:list',
  providersSave: 'providers:save',
  providersRemove: 'providers:remove',
  providersDiscover: 'providers:discover',
  providersTest: 'providers:test',

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

  dialogOpenFolder: 'dialog:openFolder',
} as const;

/** Push (main → renderer) channels. */
export const IpcEvents = {
  agentEvent: 'agent:event',
  indexProgress: 'index:progress',
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

  listModels(providerId: string): Promise<ModelInfo[]>;
  pullModel(providerId: string, model: string): Promise<{ ok: boolean; message: string }>;
  loadModel(providerId: string, model: string): Promise<{ ok: boolean }>;
  unloadModel(providerId: string, model: string): Promise<{ ok: boolean }>;

  listSessions(): Promise<Session[]>;
  createSession(workspaceId?: string): Promise<Session>;
  getSession(id: string): Promise<Session | null>;
  deleteSession(id: string): Promise<void>;
  setSessionWorkspace(sessionId: string, workspaceId?: string): Promise<Session | null>;
  sendChat(opts: SendOptions): Promise<void>;
  abortChat(sessionId: string): Promise<void>;
  approveTool(sessionId: string, toolCallId: string, approved: boolean): Promise<void>;

  previewContext(sessionId: string, attachedPaths: string[]): Promise<ContextBundle>;
  toggleContextItem(sessionId: string, itemId: string, included: boolean, pinned: boolean): Promise<ContextBundle>;
  setContextPrefs(sessionId: string, prefs: import('./chat.js').ContextPrefs): Promise<void>;

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

  onAgentEvent(cb: (e: AgentEvent) => void): () => void;
  onIndexProgress(cb: (s: IndexStatus) => void): () => void;
}
