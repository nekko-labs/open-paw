import { BrowserWindow, dialog, ipcMain } from 'electron';
import { basename } from 'path';
import type {
  AppSettings,
  ConnectorConfig,
  ConnectorKind,
  GuardrailRule,
  MemoryEntry,
  MemoryScope,
  ProviderConfig,
  SendOptions,
  WorkspaceFolder,
} from '@nekko/shared';
import { IpcChannels, IpcEvents } from '@nekko/shared';
import {
  classifyCommand,
  createProvider,
  discoverLocalProviders,
  getConnector,
  OllamaProvider,
} from '@nekko/core';
import { getSettings, saveSettings } from './store.js';
import { listSessions, getSession, createSession, deleteSession } from './sessions.js';
import { sendChat, abortChat, resolveApproval, previewContext } from './chat.js';
import { listMemory, saveMemory, deleteMemory } from './memory.js';
import { indexWorkspace, getIndexStatus, searchWorkspace, listIndexedFiles } from './workspace.js';
import { usageSummary } from './usage.js';

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
}

export function registerIpc(): void {
  const h = ipcMain.handle.bind(ipcMain);

  // Settings
  h(IpcChannels.settingsGet, () => getSettings());
  h(IpcChannels.settingsUpdate, (_e, patch: Partial<AppSettings>) => saveSettings(patch));

  // Providers
  h(IpcChannels.providersList, () => getSettings().providers);
  h(IpcChannels.providersSave, (_e, p: ProviderConfig) => {
    const providers = getSettings().providers.filter((x) => x.id !== p.id);
    providers.push(p);
    return saveSettings({ providers }).providers;
  });
  h(IpcChannels.providersRemove, (_e, id: string) => {
    const providers = getSettings().providers.filter((x) => x.id !== id);
    return saveSettings({ providers }).providers;
  });
  h(IpcChannels.providersDiscover, async () => {
    const discovered = await discoverLocalProviders();
    const existing = getSettings().providers;
    const merged = [...existing];
    for (const d of discovered) if (!merged.some((p) => p.baseUrl === d.baseUrl)) merged.push(d);
    return saveSettings({ providers: merged }).providers;
  });
  h(IpcChannels.providersTest, async (_e, id: string) => {
    const p = getSettings().providers.find((x) => x.id === id);
    if (!p) return { ok: false, message: 'Not found' };
    return createProvider(p).test();
  });

  // Models
  h(IpcChannels.modelsList, async (_e, providerId: string) => {
    const p = getSettings().providers.find((x) => x.id === providerId);
    if (!p) return [];
    try {
      return await createProvider(p).listModels();
    } catch {
      return [];
    }
  });
  h(IpcChannels.modelPull, async (_e, providerId: string, model: string) => {
    const p = getSettings().providers.find((x) => x.id === providerId);
    if (!p || p.kind !== 'ollama') return { ok: false, message: 'Pull supported on Ollama only.' };
    try {
      await new OllamaProvider(p).pull(model);
      return { ok: true, message: `Pulled ${model}` };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  });
  h(IpcChannels.modelLoad, async (_e, providerId: string, model: string) => {
    const p = getSettings().providers.find((x) => x.id === providerId);
    if (p?.kind === 'ollama') await new OllamaProvider(p).setLoaded(model, true);
    return { ok: true };
  });
  h(IpcChannels.modelUnload, async (_e, providerId: string, model: string) => {
    const p = getSettings().providers.find((x) => x.id === providerId);
    if (p?.kind === 'ollama') await new OllamaProvider(p).setLoaded(model, false);
    return { ok: true };
  });

  // Sessions + chat
  h(IpcChannels.sessionsList, () => listSessions());
  h(IpcChannels.sessionCreate, (_e, workspaceId?: string) => createSession(workspaceId));
  h(IpcChannels.sessionGet, (_e, id: string) => getSession(id));
  h(IpcChannels.sessionDelete, (_e, id: string) => deleteSession(id));
  h(IpcChannels.chatSend, async (_e, opts: SendOptions) => {
    await sendChat(opts, (event) => broadcast(IpcEvents.agentEvent, event));
  });
  h(IpcChannels.chatAbort, (_e, sessionId: string) => abortChat(sessionId));
  h(IpcChannels.toolApprove, (_e, _sessionId: string, toolCallId: string, approved: boolean) =>
    resolveApproval(toolCallId, approved),
  );

  // Context
  h(IpcChannels.contextPreview, (_e, sessionId: string, attachedPaths: string[]) =>
    previewContext(sessionId, attachedPaths),
  );
  h(IpcChannels.contextToggle, (_e, sessionId: string, _itemId: string, _included: boolean, _pinned: boolean) =>
    // Toggles are tracked client-side for the preview; re-preview to reflect.
    previewContext(sessionId, []),
  );

  // Memory
  h(IpcChannels.memoryList, (_e, scope: MemoryScope, workspaceId?: string) => listMemory(scope, workspaceId));
  h(IpcChannels.memorySave, (_e, entry: MemoryEntry) => {
    saveMemory(entry);
    return listMemory(entry.scope, entry.workspaceId);
  });
  h(IpcChannels.memoryDelete, (_e, id: string) => deleteMemory(id));

  // Workspace
  h(IpcChannels.workspaceList, () => getSettings().workspaces);
  h(IpcChannels.workspaceAdd, async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return getSettings().workspaces;
    const path = res.filePaths[0];
    const folder: WorkspaceFolder = {
      id: `ws_${Date.now().toString(36)}`,
      name: basename(path),
      path,
      addedAt: Date.now(),
    };
    const workspaces = [...getSettings().workspaces, folder];
    saveSettings({ workspaces });
    // Kick off indexing in the background.
    setTimeout(() => indexWorkspace(folder, (s) => broadcast(IpcEvents.indexProgress, s)), 50);
    return workspaces;
  });
  h(IpcChannels.workspaceRemove, (_e, id: string) => {
    const workspaces = getSettings().workspaces.filter((w) => w.id !== id);
    return saveSettings({ workspaces }).workspaces;
  });
  h(IpcChannels.workspaceIndex, (_e, id: string) => {
    const folder = getSettings().workspaces.find((w) => w.id === id);
    if (!folder) throw new Error('Workspace not found');
    return indexWorkspace(folder, (s) => broadcast(IpcEvents.indexProgress, s));
  });
  h(IpcChannels.workspaceIndexStatus, (_e, id: string) => getIndexStatus(id));
  h(IpcChannels.workspaceSearch, (_e, id: string, query: string) => {
    const folder = getSettings().workspaces.find((w) => w.id === id);
    return folder ? searchWorkspace(folder, query) : [];
  });
  h(IpcChannels.workspaceFiles, (_e, id: string) => listIndexedFiles(id));

  // Connectors
  h(IpcChannels.connectorsList, () => getSettings().connectors);
  h(IpcChannels.connectorConnect, (_e, kind: ConnectorKind, token: string, settings?: Record<string, string>) => {
    const connectors = getSettings().connectors.filter((c) => c.kind !== kind);
    const cfg: ConnectorConfig = { kind, connected: true, token, settings, connectedAt: Date.now() };
    connectors.push(cfg);
    return saveSettings({ connectors }).connectors;
  });
  h(IpcChannels.connectorDisconnect, (_e, kind: ConnectorKind) => {
    const connectors = getSettings().connectors.filter((c) => c.kind !== kind);
    return saveSettings({ connectors }).connectors;
  });
  h(IpcChannels.connectorFetch, async (_e, kind: ConnectorKind, query?: string) => {
    const cfg = getSettings().connectors.find((c) => c.kind === kind);
    if (!cfg?.connected || !cfg.token) throw new Error('Connector not connected');
    return getConnector(kind).fetch(cfg.token, query, cfg.settings);
  });

  // Guardrails
  h(IpcChannels.guardrailsClassify, (_e, command: string) => classifyCommand(command, getSettings().guardrails));

  // Usage
  h(IpcChannels.usageSummary, () => usageSummary());
}
