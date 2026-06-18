import { create } from 'zustand';
import type { AppSettings, Session, ProviderConfig, ModelInfo } from '@nekko/shared';
import type { MascotMood } from './components/Mascot.js';

export type View = 'chat' | 'projects' | 'models' | 'connectors' | 'memory' | 'settings';

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
  contextPanelOpen: true,
  mascotMood: 'waving',

  setMascotMood: (m) => set({ mascotMood: m }),
  setView: (v) => set({ view: v }),

  refreshSettings: async () => {
    const settings = await window.nekko.getSettings();
    set({ settings });
    get().applyTheme();
    if (!get().activeProviderId && settings.defaultProviderId) {
      set({ activeProviderId: settings.defaultProviderId, activeModelId: settings.defaultModelId ?? null });
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
    if (active && active !== get().activeProviderId) await get().selectProvider(active);
    else if (active) set({ activeProviderId: active });
  },

  selectProvider: async (id) => {
    set({ activeProviderId: id, models: [] });
    const models = await window.nekko.listModels(id);
    set({ models });
    if (models[0] && !models.some((m) => m.id === get().activeModelId)) set({ activeModelId: models[0].id });
  },

  selectModel: (id) => set({ activeModelId: id }),

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
}));
