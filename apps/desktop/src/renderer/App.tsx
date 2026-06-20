import React, { useEffect } from 'react';
import { useStore, type View } from './store.js';
import { Mascot } from './components/Mascot.js';
import { Toasts } from './components/Toasts.js';
import { CommandPalette } from './components/CommandPalette.js';
import { UpdateBanner } from './components/UpdateBanner.js';
import { ChatView } from './views/ChatView.js';
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

const NAV: Array<{ view: View; label: string; Icon: (p: { className?: string }) => JSX.Element }> = [
  { view: 'command', label: 'Command Center', Icon: GridIcon },
  { view: 'chat', label: 'Chat', Icon: ChatIcon },
  { view: 'projects', label: 'Projects', Icon: FolderIcon },
  { view: 'models', label: 'Models', Icon: ServerIcon },
  { view: 'connectors', label: 'Connectors', Icon: PlugIcon },
  { view: 'memory', label: 'Memory', Icon: BrainIcon },
  { view: 'settings', label: 'Settings', Icon: GearIcon },
];

export function App() {
  const { view, setView, mascotMood, settings, providers, refreshSettings, refreshProviders, refreshSessions } = useStore();

  useEffect(() => {
    refreshSettings();
    refreshProviders();
    refreshSessions();
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

  return (
    <div className="flex h-full w-full" style={{ background: 'var(--paper)' }}>
      {/* Left rail */}
      <nav className="flex w-16 flex-col items-center gap-1 border-r border-line py-4">
        <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl" style={{ background: 'var(--accent)' }}>
          <span className="text-lg">🐾</span>
        </div>
        {NAV.map(({ view: v, label, Icon }) => (
          <button
            key={v}
            className={`nav-item ${view === v ? 'active' : ''}`}
            title={label}
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
        {view === 'chat' && <ChatView />}
        {view === 'models' && <ModelsView />}
        {view === 'projects' && <ProjectsView />}
        {view === 'connectors' && <ConnectorsView />}
        {view === 'memory' && <MemoryView />}
        {view === 'settings' && <SettingsView />}
      </main>

      <UpdateBanner />
      <Mascot mood={mascotMood} enabled={settings?.mascotEnabled ?? true} />
      <CommandPalette />
      <Toasts />
    </div>
  );
}
