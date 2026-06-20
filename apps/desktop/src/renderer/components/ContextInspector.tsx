import React, { useEffect, useState } from 'react';
import type { ContextBundle, ContextItem } from '@open-paw/shared';
import { PinIcon } from '../icons.js';

const SOURCE_LABEL: Record<ContextItem['source'], string> = {
  'attached-file': 'File',
  guideline: 'Guideline',
  memory: 'Memory',
  connector: 'Connector',
  'index-snippet': 'Index',
  system: 'System',
};

const SOURCE_COLOR: Record<ContextItem['source'], string> = {
  'attached-file': '#5b9dd9',
  guideline: '#c08adb',
  memory: '#e0a44a',
  connector: '#4ec98a',
  'index-snippet': '#8a8f98',
  system: '#8a8f98',
};

/**
 * The Context Inspector — Open Paw's signature panel. Shows exactly what is
 * being added to the prompt this turn, grouped by provenance, each item
 * toggleable and pinnable, with live token counts and a context-window bar.
 */
export function ContextInspector({ sessionId }: { sessionId: string | null }) {
  const [bundle, setBundle] = useState<ContextBundle | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [pinned, setPinned] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!sessionId) return;
    window.nekko.previewContext(sessionId, []).then((b) => {
      setBundle(b);
      // Hydrate toggle/pin state from what the bundle reports (persisted prefs).
      setExcluded(new Set(b.items.filter((i) => !i.included).map((i) => i.id)));
      setPinned(new Set(b.items.filter((i) => i.pinned).map((i) => i.id)));
    });
  }, [sessionId]);

  if (!sessionId) return <Empty />;
  if (!bundle) return <Empty />;
  if (bundle.items.length === 0) return <Empty />;

  const persist = (nextExcluded: Set<string>, nextPinned: Set<string>) => {
    if (sessionId) {
      window.nekko.setContextPrefs(sessionId, { excluded: [...nextExcluded], pinned: [...nextPinned] });
    }
  };

  const toggle = (id: string) => {
    const nextExcluded = new Set(excluded);
    const nextPinned = new Set(pinned);
    if (nextExcluded.has(id)) {
      nextExcluded.delete(id);
    } else {
      nextExcluded.add(id);
      nextPinned.delete(id); // excluding an item also unpins it
    }
    setExcluded(nextExcluded);
    setPinned(nextPinned);
    persist(nextExcluded, nextPinned);
  };

  const togglePin = (id: string) => {
    const nextExcluded = new Set(excluded);
    const nextPinned = new Set(pinned);
    if (nextPinned.has(id)) {
      nextPinned.delete(id);
    } else {
      nextPinned.add(id);
      nextExcluded.delete(id); // pinning forces inclusion
    }
    setExcluded(nextExcluded);
    setPinned(nextPinned);
    persist(nextExcluded, nextPinned);
  };

  const visible = bundle.items.map((i) => ({ ...i, included: !excluded.has(i.id), pinned: pinned.has(i.id) }));
  const total = visible.filter((i) => i.included).reduce((s, i) => s + i.tokens, 0);
  const windowTokens = bundle.contextWindow ?? 128000;
  const pct = Math.min(100, (total / windowTokens) * 100);

  const groups = groupBy(visible, (i) => i.source);

  return (
    <div className="flex h-full w-80 flex-col border-l border-line">
      <div className="border-b border-line p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Context</h3>
          <span className="chip">{total.toLocaleString()} tok</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
        </div>
        <p className="mt-1.5 text-[11px] text-ink-faint">
          What enters the prompt this turn. Toggle to include/exclude, pin to keep.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {Object.entries(groups).map(([source, items]) => (
          <div key={source}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_COLOR[source as ContextItem['source']] }} />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {SOURCE_LABEL[source as ContextItem['source']]}
              </span>
            </div>
            <div className="space-y-1.5">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`card cursor-pointer p-2.5 transition-opacity ${item.included ? '' : 'opacity-40'}`}
                  onClick={() => toggle(item.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12.5px] font-medium">{item.label}</span>
                    <span className="shrink-0 text-[10px] text-ink-faint">{item.tokens} tok</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-ink-faint">{item.preview}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-ink-faint">{item.included ? 'included' : 'excluded'}</span>
                    <button
                      title={item.pinned ? 'Unpin' : 'Pin (always include)'}
                      className={item.pinned ? 'text-accent' : 'text-ink-faint hover:text-ink'}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(item.id);
                      }}
                    >
                      <PinIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full w-80 flex-col items-center justify-center border-l border-line p-6 text-center">
      <h3 className="text-sm font-semibold">Context</h3>
      <p className="mt-2 text-[12px] text-ink-faint">
        Attach files or add workspace guidelines (AGENTS.md / CLAUDE.md) and they'll show up here with token counts.
      </p>
    </div>
  );
}

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {});
}
