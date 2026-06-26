import React, { useEffect } from 'react';
import { useStore, type View } from './store.js';
import { useT } from './i18n.js';
import { Mascot } from './components/Mascot.js';
import { Toasts } from './components/Toasts.js';
import { CommandPalette } from './components/CommandPalette.js';
import { UpdateBanner } from './components/UpdateBanner.js';
import { RelayPairing } from './components/RelayPairing.js';
import { WorkbenchView } from './views/WorkbenchView.js';
import { CommandCenterView } from './views/CommandCenterView.js';
import { ModelsView } from './views/ModelsView.js';
import { ProjectsView } from './views/ProjectsView.js';
import { ConnectorsView } from './views/ConnectorsView.js';
import { MemoryView } from './views/MemoryView.js';
import { SettingsView } from './views/SettingsView.js';
import {
  ChatIcon,
  FolderIcon,
  ServerIcon,
  PlugIcon,
  BrainIcon,
  GearIcon,
  GridIcon,
} from './icons.js';

const NAV: Array<{ view: View; labelKey: string; Icon: (p: { className?: string }) => JSX.Element }> = [
  { view: 'command', labelKey: 'nav.command', Icon: GridIcon },
  { view: 'chat', labelKey: 'nav.chat', Icon: ChatIcon },
  { view: 'projects', labelKey: 'nav.projects', Icon: FolderIcon },
  { view: 'models', labelKey: 'nav.models', Icon: ServerIcon },
  { view: 'connectors', labelKey: 'nav.connectors', Icon: PlugIcon },
  { view: 'memory', labelKey: 'nav.memory', Icon: BrainIcon },
  { view: 'settings', labelKey: 'nav.settings', Icon: GearIcon },
];

export function App() {
  const { view, setView, mascotMood, settings, providers, refreshSettings, refreshProviders, refreshSessions, refreshTerminals } = useStore();
  const t = useT();

  useEffect(() => {
    refreshSettings();
    refreshProviders();
    refreshSessions();
    refreshTerminals();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => useStore.getState().applyTheme();
    mq.addEventListener('change', onChange);

    // Global keyboard shortcuts.
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useStore.getState().setPaletteOpen(!useStore.getState().paletteOpen);
      } else if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        useStore.getState().newChat();
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        useStore.getState().newTerminal();
      } else if (mod && e.key === '\\') {
        e.preventDefault();
        useStore.getState().toggleContextPanel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native (mobile) only: notify when an agent run finishes while the app is
  // backgrounded. Local notification — no push backend / APNs / FCM needed.
  useEffect(() => {
    const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    let off: (() => void) | undefined;
    let nid = 1;
    (async () => {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        await LocalNotifications.requestPermissions();
        off = window.nekko.onAgentEvent((e) => {
          if (e.type === 'done' && document.hidden) {
            LocalNotifications.schedule({
              notifications: [{ id: nid++, title: 'Nekko finished', body: 'Your task is ready in Open Paw.' }],
            }).catch(() => {});
          }
        });
      } catch {
        /* plugin unavailable */
      }
    })();
    return () => off?.();
  }, []);

  // Native (mobile) only: register for remote push and hand the token to the
  // relay, so a finished run can notify the phone even when it's offline.
  useEffect(() => {
    const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    let cancelled = false;
    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const platform = cap.getPlatform?.() === 'android' ? 'android' : 'ios';
        const perm = await PushNotifications.requestPermissions();
        if (perm.receive !== 'granted') return;
        await PushNotifications.addListener('registration', (t) => {
          if (!cancelled) window.nekko.registerPushToken(t.value, platform).catch(() => {});
        });
        await PushNotifications.register();
      } catch {
        /* push not configured in this build */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex h-full w-full" style={{ background: 'var(--paper)' }}>
      {/* Left rail */}
      <nav className="flex w-16 flex-col items-center gap-1 border-r border-line py-4">
        <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl" style={{ background: 'var(--accent)' }}>
          <span className="text-lg">🐾</span>
        </div>
        {NAV.map(({ view: v, labelKey, Icon }) => (
          <button
            key={v}
            className={`nav-item ${view === v ? 'active' : ''}`}
            title={t(labelKey)}
            onClick={() => setView(v)}
          >
            <Icon />
          </button>
        ))}
      </nav>

      {/* Main */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {providers.length === 0 && view !== 'models' && view !== 'settings' && (
          <button
            className="flex items-center justify-center gap-2 border-b border-line py-2.5 text-[13px]"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            onClick={() => setView('models')}
          >
            <span className="font-medium">Get started:</span> connect your first model in Models →
          </button>
        )}
        {view === 'command' && <CommandCenterView />}
        {view === 'chat' && <WorkbenchView />}
        {view === 'models' && <ModelsView />}
        {view === 'projects' && <ProjectsView />}
        {view === 'connectors' && <ConnectorsView />}
        {view === 'memory' && <MemoryView />}
        {view === 'settings' && <SettingsView />}
      </main>

      <UpdateBanner />
      <RelayPairing />
      <Mascot mood={mascotMood} enabled={settings?.mascotEnabled ?? true} />
      <CommandPalette />
      <Toasts />
    </div>
  );
}
