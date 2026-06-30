import { create } from 'zustand';
import type { AppSettings, Session, ProviderConfig, ModelInfo, TerminalInfo } from '@open-paw/shared';
import type { MascotMood } from './components/Mascot.js';

export type View = 'command' | 'chat' | 'projects' | 'models' | 'connectors' | 'memory' | 'settings' | 'design' | 'skills';

/** A message routed into a chat's composer from another surface (editor comment, design note). */
export interface ComposerInbox {
  sessionId: string;
  text: string;
  /** true = send immediately ("Run now"); false = drop into the draft ("Add to prompt"). */
  run: boolean;
}

export interface Toast {
  id: string;
  kind: 'info' | 'error' | 'success';
  message: string;
}

/** A single workbench tab — a chat, terminal, file, browser, or diff view. */
export interface WbPane {
  id: string;
  kind: 'chat' | 'terminal' | 'file' | 'browser' | 'diff';
  /**
   * What the pane points at: sessionId (chat), terminalId (terminal), absolute
   * file path (file/diff), or URL (browser).
   */
  refId: string;
}

/** A column of tabbed panes; multiple groups sit side by side. */
export interface WbGroup {
  id: string;
  panes: WbPane[];
  activeId: string | null;
}

const MAX_GROUPS = 3;
let paneSeq = 0;
const newPaneId = () => `pane_${(++paneSeq).toString(36)}`;
const newGroupId = () => `grp_${(++paneSeq).toString(36)}`;

interface UiState {
  settings: AppSettings | null;
  view: View;
  sessions: Session[];
  activeSessionId: string | null;
  providers: ProviderConfig[];
  models: ModelInfo[];
  activeProviderId: string | null;
  activeModelId: string | null;
  contextPanelOpen: boolean;
  mascotMood: MascotMood;
  toasts: Toast[];
  paletteOpen: boolean;
  activeWorkspaceId: string | null;

  // Workbench: tabbed, splittable panes (chats + terminals) and live terminals.
  terminals: TerminalInfo[];
  groups: WbGroup[];
  activeGroupId: string | null;

  /** Pending message to hand a chat's composer (set by editor comments / design notes). */
  composerInbox: ComposerInbox | null;

  setActiveWorkspace: (id: string | null) => void;
  pushToast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: string) => void;
  setPaletteOpen: (open: boolean) => void;
  newChat: () => Promise<void>;
  setMascotMood: (m: MascotMood) => void;
  setView: (v: View) => void;
  refreshSettings: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  setActiveSession: (id: string | null) => void;
  refreshProviders: () => Promise<void>;
  selectProvider: (id: string) => Promise<void>;
  selectModel: (id: string) => void;
  toggleContextPanel: () => void;
  applyTheme: () => void;

  refreshTerminals: () => Promise<void>;
  newTerminal: (workspaceId?: string, shell?: string) => Promise<void>;
  openChatPane: (sessionId: string) => void;
  openTerminalPane: (terminalId: string) => void;
  openFilePane: (path: string) => void;
  openBrowserPane: (url?: string) => void;
  /** Route text to a chat's composer — Add to prompt (run=false) or Run now (run=true). */
  sendToChat: (text: string, run: boolean) => Promise<void>;
  /** Open the diff/approve review for a session's changed files. */
  openDiffPane: (sessionId: string) => void;
  closePane: (groupId: string, paneId: string) => void;
  setActivePane: (groupId: string, paneId: string) => void;
  focusGroup: (groupId: string) => void;
  splitRight: (groupId: string, paneId: string) => void;

  // Sidebar drag-and-drop: persist project order and per-project item order.
  reorderWorkspaces: (orderedIds: string[]) => Promise<void>;
  layoutChats: (targetWorkspaceId: string | undefined, orderedIds: string[], moveId: string | null) => Promise<void>;
  layoutTerminals: (targetWorkspaceId: string | undefined, orderedIds: string[], moveId: string | null) => Promise<void>;
}

/** Find an existing pane for a chat/terminal ref across all groups. */
function locatePane(groups: WbGroup[], kind: WbPane['kind'], refId: string): { groupId: string; paneId: string } | null {
  for (const g of groups) {
    const p = g.panes.find((x) => x.kind === kind && x.refId === refId);
    if (p) return { groupId: g.id, paneId: p.id };
  }
  return null;
}

/** Add a pane to the focused group (creating the first group if needed). */
function addPane(groups: WbGroup[], activeGroupId: string | null, pane: WbPane): { groups: WbGroup[]; activeGroupId: string } {
  if (groups.length === 0) {
    const g: WbGroup = { id: newGroupId(), panes: [pane], activeId: pane.id };
    return { groups: [g], activeGroupId: g.id };
  }
  const gid = activeGroupId && groups.some((g) => g.id === activeGroupId) ? activeGroupId : groups[0].id;
  return {
    groups: groups.map((g) => (g.id === gid ? { ...g, panes: [...g.panes, pane], activeId: pane.id } : g)),
    activeGroupId: gid,
  };
}

export const useStore = create<UiState>((set, get) => ({
  settings: null,
  view: 'chat',
  sessions: [],
  activeSessionId: null,
  providers: [],
  models: [],
  activeProviderId: null,
  activeModelId: null,
  // Default the context panel closed on small screens (phones).
  contextPanelOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  mascotMood: 'waving',
  toasts: [],
  paletteOpen: false,
  activeWorkspaceId: null,
  terminals: [],
  groups: [],
  activeGroupId: null,
  composerInbox: null,

  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
  pushToast: (kind, message) => {
    const id = `t_${Date.now().toString(36)}_${Math.floor(performance.now())}`;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => get().dismissToast(id), 5000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  newChat: async () => {
    const s = await window.nekko.createSession(get().activeWorkspaceId ?? undefined);
    await get().refreshSessions();
    set({ activeSessionId: s.id, view: 'chat' });
    get().openChatPane(s.id);
  },
  setMascotMood: (m) => set({ mascotMood: m }),
  setView: (v) => set({ view: v }),

  refreshSettings: async () => {
    const settings = await window.nekko.getSettings();
    set({ settings });
    get().applyTheme();
    if (!get().activeProviderId && settings.defaultProviderId) {
      set({ activeProviderId: settings.defaultProviderId, activeModelId: settings.defaultModelId ?? null });
    }
    if (!get().activeWorkspaceId && settings.workspaces[0]) {
      set({ activeWorkspaceId: settings.workspaces[0].id });
    }
  },

  refreshSessions: async () => {
    const sessions = await window.nekko.listSessions();
    set({ sessions });
    if (!get().activeSessionId && sessions[0]) set({ activeSessionId: sessions[0].id });
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  refreshProviders: async () => {
    const providers = await window.nekko.listProviders();
    set({ providers });
    const active = get().activeProviderId ?? providers[0]?.id ?? null;
    if (active) {
      set({ activeProviderId: active });
      // Always populate models for the active provider on startup — guards a
      // race where a saved default provider is already active and would
      // otherwise never have its model list fetched.
      if (get().models.length === 0) await get().selectProvider(active);
    }
  },

  selectProvider: async (id) => {
    set({ activeProviderId: id, models: [] });
    const models = await window.nekko.listModels(id);
    set({ models });
    if (models[0] && !models.some((m) => m.id === get().activeModelId)) set({ activeModelId: models[0].id });
    // Remember as the default for new chats and next launch.
    window.nekko.updateSettings({ defaultProviderId: id, defaultModelId: get().activeModelId ?? undefined });
  },

  selectModel: (id) => {
    set({ activeModelId: id });
    window.nekko.updateSettings({ defaultProviderId: get().activeProviderId ?? undefined, defaultModelId: id });
  },

  toggleContextPanel: () => set((s) => ({ contextPanelOpen: !s.contextPanelOpen })),

  applyTheme: () => {
    const theme = get().settings?.theme ?? 'system';
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    document.documentElement.setAttribute('data-theme', resolved);
    const accent = get().settings?.accent;
    if (accent) document.documentElement.style.setProperty('--accent', accent);
  },

  refreshTerminals: async () => {
    try {
      set({ terminals: await window.nekko.listTerminals() });
    } catch {
      /* terminals unsupported on this transport */
    }
  },

  newTerminal: async (workspaceId, shell) => {
    const wid = workspaceId ?? get().activeWorkspaceId ?? undefined;
    const t = await window.nekko.createTerminal({ workspaceId: wid, shell });
    await get().refreshTerminals();
    set({ view: 'chat' });
    get().openTerminalPane(t.id);
  },

  openChatPane: (sessionId) => {
    set((s) => {
      const hit = locatePane(s.groups, 'chat', sessionId);
      if (hit) {
        return {
          activeSessionId: sessionId,
          activeGroupId: hit.groupId,
          groups: s.groups.map((g) => (g.id === hit.groupId ? { ...g, activeId: hit.paneId } : g)),
        };
      }
      const next = addPane(s.groups, s.activeGroupId, { id: newPaneId(), kind: 'chat', refId: sessionId });
      return { ...next, activeSessionId: sessionId };
    });
  },

  openTerminalPane: (terminalId) => {
    set((s) => {
      const hit = locatePane(s.groups, 'terminal', terminalId);
      if (hit) {
        return {
          activeGroupId: hit.groupId,
          groups: s.groups.map((g) => (g.id === hit.groupId ? { ...g, activeId: hit.paneId } : g)),
        };
      }
      return addPane(s.groups, s.activeGroupId, { id: newPaneId(), kind: 'terminal', refId: terminalId });
    });
  },

  openFilePane: (path) => {
    set((s) => {
      const hit = locatePane(s.groups, 'file', path);
      if (hit) {
        return {
          activeGroupId: hit.groupId,
          groups: s.groups.map((g) => (g.id === hit.groupId ? { ...g, activeId: hit.paneId } : g)),
        };
      }
      return { ...addPane(s.groups, s.activeGroupId, { id: newPaneId(), kind: 'file', refId: path }), view: 'chat' as View };
    });
  },

  openBrowserPane: (url) => {
    set((s) => {
      const ref = url || 'about:blank';
      const hit = locatePane(s.groups, 'browser', ref);
      if (hit) {
        return {
          activeGroupId: hit.groupId,
          groups: s.groups.map((g) => (g.id === hit.groupId ? { ...g, activeId: hit.paneId } : g)),
        };
      }
      return { ...addPane(s.groups, s.activeGroupId, { id: newPaneId(), kind: 'browser', refId: ref }), view: 'chat' as View };
    });
  },

  sendToChat: async (text, run) => {
    // Target the active chat; create one if there isn't a usable session.
    let sid = get().activeSessionId;
    if (!sid || !get().sessions.some((s) => s.id === sid)) {
      const s = await window.nekko.createSession(get().activeWorkspaceId ?? undefined);
      await get().refreshSessions();
      sid = s.id;
      set({ activeSessionId: sid });
    }
    set({ view: 'chat' });
    get().openChatPane(sid);
    set({ composerInbox: { sessionId: sid, text, run } });
  },

  openDiffPane: (sessionId) => {
    set((s) => {
      const hit = locatePane(s.groups, 'diff', sessionId);
      if (hit) {
        return {
          activeGroupId: hit.groupId,
          groups: s.groups.map((g) => (g.id === hit.groupId ? { ...g, activeId: hit.paneId } : g)),
        };
      }
      return { ...addPane(s.groups, s.activeGroupId, { id: newPaneId(), kind: 'diff', refId: sessionId }), view: 'chat' as View };
    });
  },

  closePane: (groupId, paneId) => {
    set((s) => {
      let groups = s.groups
        .map((g) => {
          if (g.id !== groupId) return g;
          const panes = g.panes.filter((p) => p.id !== paneId);
          const activeId = g.activeId === paneId ? panes[panes.length - 1]?.id ?? null : g.activeId;
          return { ...g, panes, activeId };
        })
        .filter((g) => g.panes.length > 0);
      const activeGroupId = groups.some((g) => g.id === s.activeGroupId) ? s.activeGroupId : groups[0]?.id ?? null;
      return { groups, activeGroupId };
    });
  },

  setActivePane: (groupId, paneId) => {
    set((s) => {
      const pane = s.groups.find((g) => g.id === groupId)?.panes.find((p) => p.id === paneId);
      return {
        activeGroupId: groupId,
        activeSessionId: pane?.kind === 'chat' ? pane.refId : s.activeSessionId,
        groups: s.groups.map((g) => (g.id === groupId ? { ...g, activeId: paneId } : g)),
      };
    });
  },

  focusGroup: (groupId) => set({ activeGroupId: groupId }),

  splitRight: (groupId, paneId) => {
    set((s) => {
      if (s.groups.length >= MAX_GROUPS) return s;
      const src = s.groups.find((g) => g.id === groupId);
      const pane = src?.panes.find((p) => p.id === paneId);
      if (!src || !pane || src.panes.length <= 1) return s; // nothing to split off
      const remaining = src.panes.filter((p) => p.id !== paneId);
      const moved: WbGroup = { id: newGroupId(), panes: [pane], activeId: pane.id };
      const groups: WbGroup[] = [];
      for (const g of s.groups) {
        if (g.id === groupId) {
          groups.push({ ...g, panes: remaining, activeId: g.activeId === paneId ? remaining[remaining.length - 1]?.id ?? null : g.activeId });
          groups.push(moved);
        } else groups.push(g);
      }
      return { groups, activeGroupId: moved.id };
    });
  },

  reorderWorkspaces: async (orderedIds) => {
    const s = get().settings;
    if (!s) return;
    const byId = new Map(s.workspaces.map((w) => [w.id, w]));
    const workspaces = orderedIds.map((id) => byId.get(id)).filter((w): w is NonNullable<typeof w> => !!w);
    if (workspaces.length !== s.workspaces.length) return; // guard against a lost entry
    await window.nekko.updateSettings({ workspaces });
    await get().refreshSettings();
  },

  layoutChats: async (targetWorkspaceId, orderedIds, moveId) => {
    if (moveId) await window.nekko.setSessionWorkspace(moveId, targetWorkspaceId);
    await Promise.all(orderedIds.map((id, i) => window.nekko.setSessionOptions(id, { order: i })));
    await get().refreshSessions();
  },

  layoutTerminals: async (targetWorkspaceId, orderedIds, moveId) => {
    if (moveId) await window.nekko.updateTerminal(moveId, { workspaceId: targetWorkspaceId ?? null });
    await Promise.all(orderedIds.map((id, i) => window.nekko.updateTerminal(id, { order: i })));
    await get().refreshTerminals();
  },
}));
