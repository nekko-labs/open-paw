import { IpcChannels } from '@open-paw/shared';
import type { Host } from './host.js';

/**
 * Maps an IPC channel + positional args to the matching Host method. Shared by
 * every transport (Electron IPC, the web server's HTTP routes) so request
 * routing lives in exactly one place. Returns the method's result.
 *
 * Note: `workspaceAdd` (the native folder picker) has no headless equivalent, so
 * transports that can't show a dialog (web) should call `workspaceAddByPath`
 * instead; here it degrades to listing current workspaces.
 */
export function createDispatcher(host: Host): (channel: string, args: any[]) => unknown {
  const C = IpcChannels;
  const table: Record<string, (a: any[]) => unknown> = {
    [C.settingsGet]: () => host.getSettings(),
    [C.settingsUpdate]: ([patch]) => host.updateSettings(patch),

    [C.providersList]: () => host.listProviders(),
    [C.providersSave]: ([p]) => host.saveProvider(p),
    [C.providersRemove]: ([id]) => host.removeProvider(id),
    [C.providersDiscover]: () => host.discoverProviders(),
    [C.providersTest]: ([id]) => host.testProvider(id),
    [C.providersTestConfig]: ([cfg]) => host.testProviderConfig(cfg),

    [C.modelsList]: ([id]) => host.listModels(id),
    [C.modelPull]: ([id, m]) => host.pullModel(id, m),
    [C.modelLoad]: ([id, m]) => host.loadModel(id, m),
    [C.modelUnload]: ([id, m]) => host.unloadModel(id, m),

    [C.sessionsList]: () => host.listSessions(),
    [C.sessionCreate]: ([wid]) => host.createSession(wid),
    [C.sessionGet]: ([id]) => host.getSession(id),
    [C.sessionDelete]: ([id]) => host.deleteSession(id),
    [C.sessionSetWorkspace]: ([id, wid]) => host.setSessionWorkspace(id, wid),
    [C.chatSend]: ([opts]) => host.sendChat(opts),
    [C.chatAbort]: ([id]) => host.abortChat(id),
    [C.toolApprove]: ([sid, tid, ok]) => host.approveTool(sid, tid, ok),

    [C.terminalsList]: () => host.listTerminals(),
    [C.terminalCreate]: ([opts]) => host.createTerminal(opts),
    [C.terminalSnapshot]: ([id]) => host.terminalSnapshot(id),
    [C.terminalRun]: ([id, cmd]) => host.runInTerminal(id, cmd),
    [C.terminalSignal]: ([id, sig]) => host.signalTerminal(id, sig),
    [C.terminalClose]: ([id]) => host.closeTerminal(id),

    [C.contextPreview]: ([sid, paths]) => host.previewContext(sid, paths),
    [C.contextToggle]: ([sid]) => host.previewContext(sid, []),
    [C.contextSetPrefs]: ([sid, prefs]) => host.setContextPrefs(sid, prefs),
    [C.sessionSetAttachments]: ([sid, paths]) => host.setSessionAttachments(sid, paths),
    [C.specBuild]: ([sid]) => host.buildSpec(sid),
    [C.specSetLinked]: ([sid, linked]) => host.setSpecLinked(sid, linked),
    [C.specPath]: ([sid]) => host.specPath(sid),
    [C.sessionSetOptions]: ([sid, patch]) => host.setSessionOptions(sid, patch),
    [C.sessionTruncate]: ([sid, mid]) => host.truncateSession(sid, mid),
    [C.sessionsClear]: ([scope]) => host.clearSessions(scope),
    [C.settingsReset]: () => host.resetSettings(),
    [C.dataWipe]: () => host.wipeAllData(),
    [C.toolsList]: () => host.listTools(),

    [C.memoryList]: ([scope, wid]) => host.listMemory(scope, wid),
    [C.memorySave]: ([entry]) => host.saveMemory(entry),
    [C.memoryDelete]: ([id]) => host.deleteMemory(id),

    [C.workspaceList]: () => host.listWorkspaces(),
    [C.workspaceAdd]: () => host.listWorkspaces(), // no headless folder picker
    [C.workspaceAddByPath]: ([p]) => host.addWorkspaceByPath(p),
    [C.workspaceRemove]: ([id]) => host.removeWorkspace(id),
    [C.workspaceIndex]: ([id]) => host.indexWorkspace(id),
    [C.workspaceIndexStatus]: ([id]) => host.getIndexStatus(id),
    [C.workspaceSearch]: ([id, q]) => host.searchWorkspace(id, q),
    [C.workspaceFiles]: ([id]) => host.listFiles(id),

    [C.connectorsList]: () => host.listConnectors(),
    [C.connectorConnect]: ([kind, token, settings]) => host.connectConnector(kind, token, settings),
    [C.connectorDisconnect]: ([kind]) => host.disconnectConnector(kind),
    [C.connectorFetch]: ([kind, query]) => host.fetchConnector(kind, query),

    [C.guardrailsClassify]: ([cmd]) => host.classifyCommand(cmd),
    [C.usageSummary]: () => host.usageSummary(),

    [C.remoteEnable]: ([relayUrl]) => host.enableRemote(relayUrl),
    [C.remoteDisable]: () => host.disableRemote(),
    [C.remoteStatus]: () => host.remoteStatus(),

    [C.appInfo]: () => host.appInfo(),
    [C.mcpStatus]: () => host.mcpStatus(),
  };

  return (channel, args) => {
    const fn = table[channel];
    if (!fn) throw new Error(`Unknown channel: ${channel}`);
    return fn(args ?? []);
  };
}
