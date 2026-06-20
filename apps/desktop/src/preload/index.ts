import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSettings,
  ConnectorKind,
  GuardrailRule,
  MemoryEntry,
  MemoryScope,
  NekkoApi,
  ProviderConfig,
  SendOptions,
  AgentEvent,
  IndexStatus,
} from '@nekko/shared';
import { IpcChannels, IpcEvents } from '@nekko/shared';

const inv = ipcRenderer.invoke.bind(ipcRenderer);

const api: NekkoApi = {
  getSettings: () => inv(IpcChannels.settingsGet),
  updateSettings: (patch) => inv(IpcChannels.settingsUpdate, patch),

  listProviders: () => inv(IpcChannels.providersList),
  saveProvider: (p: ProviderConfig) => inv(IpcChannels.providersSave, p),
  removeProvider: (id) => inv(IpcChannels.providersRemove, id),
  discoverProviders: () => inv(IpcChannels.providersDiscover),
  testProvider: (id) => inv(IpcChannels.providersTest, id),

  listModels: (providerId) => inv(IpcChannels.modelsList, providerId),
  pullModel: (providerId, model) => inv(IpcChannels.modelPull, providerId, model),
  loadModel: (providerId, model) => inv(IpcChannels.modelLoad, providerId, model),
  unloadModel: (providerId, model) => inv(IpcChannels.modelUnload, providerId, model),

  listSessions: () => inv(IpcChannels.sessionsList),
  createSession: (workspaceId) => inv(IpcChannels.sessionCreate, workspaceId),
  getSession: (id) => inv(IpcChannels.sessionGet, id),
  deleteSession: (id) => inv(IpcChannels.sessionDelete, id),
  setSessionWorkspace: (sessionId, workspaceId) => inv(IpcChannels.sessionSetWorkspace, sessionId, workspaceId),
  sendChat: (opts: SendOptions) => inv(IpcChannels.chatSend, opts),
  abortChat: (sessionId) => inv(IpcChannels.chatAbort, sessionId),
  approveTool: (sessionId, toolCallId, approved) => inv(IpcChannels.toolApprove, sessionId, toolCallId, approved),

  previewContext: (sessionId, attachedPaths) => inv(IpcChannels.contextPreview, sessionId, attachedPaths),
  toggleContextItem: (sessionId, itemId, included, pinned) =>
    inv(IpcChannels.contextToggle, sessionId, itemId, included, pinned),
  setContextPrefs: (sessionId, prefs) => inv(IpcChannels.contextSetPrefs, sessionId, prefs),

  listMemory: (scope: MemoryScope, workspaceId) => inv(IpcChannels.memoryList, scope, workspaceId),
  saveMemory: (entry: MemoryEntry) => inv(IpcChannels.memorySave, entry),
  deleteMemory: (id) => inv(IpcChannels.memoryDelete, id),

  listWorkspaces: () => inv(IpcChannels.workspaceList),
  addWorkspace: () => inv(IpcChannels.workspaceAdd),
  addWorkspaceByPath: (path) => inv(IpcChannels.workspaceAddByPath, path),
  removeWorkspace: (id) => inv(IpcChannels.workspaceRemove, id),
  indexWorkspace: (id) => inv(IpcChannels.workspaceIndex, id),
  getIndexStatus: (id) => inv(IpcChannels.workspaceIndexStatus, id),
  searchWorkspace: (id, query) => inv(IpcChannels.workspaceSearch, id, query),
  listFiles: (id) => inv(IpcChannels.workspaceFiles, id),

  listConnectors: () => inv(IpcChannels.connectorsList),
  connectConnector: (kind: ConnectorKind, token, settings) => inv(IpcChannels.connectorConnect, kind, token, settings),
  disconnectConnector: (kind: ConnectorKind) => inv(IpcChannels.connectorDisconnect, kind),
  fetchConnector: (kind: ConnectorKind, query) => inv(IpcChannels.connectorFetch, kind, query),

  classifyCommand: (command) => inv(IpcChannels.guardrailsClassify, command),
  saveGuardrail: async (rule: GuardrailRule) => {
    const settings: AppSettings = await inv(IpcChannels.settingsGet);
    const guardrails = settings.guardrails.filter((g) => g.id !== rule.id);
    guardrails.push(rule);
    const updated: AppSettings = await inv(IpcChannels.settingsUpdate, { guardrails });
    return updated.guardrails;
  },

  getUsageSummary: () => inv(IpcChannels.usageSummary),

  enableRemote: (relayUrl) => inv(IpcChannels.remoteEnable, relayUrl),
  disableRemote: () => inv(IpcChannels.remoteDisable),
  getRemoteStatus: () => inv(IpcChannels.remoteStatus),

  onAgentEvent: (cb: (e: AgentEvent) => void) => {
    const listener = (_: unknown, e: AgentEvent) => cb(e);
    ipcRenderer.on(IpcEvents.agentEvent, listener);
    return () => ipcRenderer.removeListener(IpcEvents.agentEvent, listener);
  },
  onIndexProgress: (cb: (s: IndexStatus) => void) => {
    const listener = (_: unknown, s: IndexStatus) => cb(s);
    ipcRenderer.on(IpcEvents.indexProgress, listener);
    return () => ipcRenderer.removeListener(IpcEvents.indexProgress, listener);
  },
};

contextBridge.exposeInMainWorld('nekko', api);
