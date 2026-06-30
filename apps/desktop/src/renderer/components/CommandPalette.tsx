import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type View } from '../store.js';

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** Ctrl/Cmd+K command palette for fast navigation and actions. */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setView, newChat, toggleContextPanel } = useStore();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (v: View, label: string): Command => ({ id: `go-${v}`, label, hint: 'Navigate', run: () => setView(v) });
    return [
      { id: 'new-chat', label: 'New chat', hint: 'Ctrl+N', run: () => newChat() },
      go('chat', 'Go to Chat'),
      go('skills', 'Go to Skills'),
      go('projects', 'Go to Projects'),
      go('models', 'Go to Models'),
      go('connectors', 'Go to Connectors'),
      go('memory', 'Go to Memory'),
      go('settings', 'Go to Settings'),
      { id: 'toggle-context', label: 'Toggle context panel', run: () => toggleContextPanel() },
    ];
  }, [setView, newChat, toggleContextPanel]);

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (paletteOpen) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [paletteOpen]);

  if (!paletteOpen) return null;

  const choose = (c?: Command) => {
    if (!c) return;
    c.run();
    setPaletteOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={() => setPaletteOpen(false)}
    >
      <div className="card fade-in w-[520px] overflow-hidden p-0 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="w-full border-b border-line bg-transparent px-4 py-3 text-[14px] outline-none"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, filtered.length - 1));
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
            else if (e.key === 'Enter') choose(filtered[active]);
            else if (e.key === 'Escape') setPaletteOpen(false);
          }}
        />
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && <div className="px-4 py-3 text-[13px] text-ink-faint">No matching commands.</div>}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] ${i === active ? 'bg-surface-2' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(c)}
            >
              <span>{c.label}</span>
              {c.hint && <span className="text-[11px] text-ink-faint">{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
