import React, { useEffect, useState } from 'react';
import type { ContextBundle, ContextItem } from '@open-paw/shared';
import { PinIcon, FolderIcon, FileIcon, PlusIcon, TrashIcon, ExternalIcon } from '../icons.js';
import { useStore } from '../store.js';
import { SpecPanel } from './SpecPanel.js';

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

/** Last path segment, handling both POSIX and Windows separators. */
function baseName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

/**
 * The Context Inspector — Open Paw's signature panel. Two parts:
 *  1. Sources — the folders, attached files, and key context files (spec.md,
 *     guidelines) wired into this chat, each addable/openable.
 *  2. Breakdown — exactly what enters the prompt this turn, grouped by
 *     provenance, each item toggleable and pinnable, with live token counts.
 */
export function ContextInspector({ sessionId }: { sessionId: string | null }) {
  const settings = useStore((s) => s.settings);
  const sessions = useStore((s) => s.sessions);
  const refreshSettings = useStore((s) => s.refreshSettings);
  const refreshSessions = useStore((s) => s.refreshSessions);

  const [bundle, setBundle] = useState<ContextBundle | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [pinned, setPinned] = useState<Set<string>>(new Set());

  const session = sessions.find((s) => s.id === sessionId) ?? null;
  const workspaces = settings?.workspaces ?? [];
  const attached = session?.attachedPaths ?? [];

  const refreshBundle = () => {
    if (!sessionId) return;
    window.nekko.previewContext(sessionId, []).then((b) => {
      setBundle(b);
      setExcluded(new Set(b.items.filter((i) => !i.included).map((i) => i.id)));
      setPinned(new Set(b.items.filter((i) => i.pinned).map((i) => i.id)));
    });
  };

  useEffect(() => {
    if (!sessionId) {
      setBundle(null);
      return;
    }
    refreshBundle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, attached.length, session?.workspaceId]);

  if (!sessionId) return <Empty />;

  const persist = (nextExcluded: Set<string>, nextPinned: Set<string>) => {
    window.nekko.setContextPrefs(sessionId, { excluded: [...nextExcluded], pinned: [...nextPinned] });
  };

  const toggle = (id: string) => {
    const nextExcluded = new Set(excluded);
    const nextPinned = new Set(pinned);
    if (nextExcluded.has(id)) {
      nextExcluded.delete(id);
    } else {
      nextExcluded.add(id);
      nextPinned.delete(id);
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
      nextExcluded.delete(id);
    }
    setExcluded(nextExcluded);
    setPinned(nextPinned);
    persist(nextExcluded, nextPinned);
  };

  // --- Sources actions ---
  const addFolder = async () => {
    await window.nekko.addWorkspace();
    await refreshSettings();
  };
  const removeFolder = async (id: string) => {
    await window.nekko.removeWorkspace(id);
    if (session?.workspaceId === id) {
      await window.nekko.setSessionWorkspace(sessionId, undefined);
      await refreshSessions();
    }
    await refreshSettings();
  };
  const useFolder = async (id: string) => {
    await window.nekko.setSessionWorkspace(sessionId, session?.workspaceId === id ? undefined : id);
    await refreshSessions();
  };
  const addFiles = async () => {
    const picked = await window.nekko.openFilesDialog();
    if (!picked.length) return;
    const next = Array.from(new Set([...attached, ...picked]));
    await window.nekko.setSessionAttachments(sessionId, next);
    await refreshSessions();
  };
  const removeFile = async (path: string) => {
    await window.nekko.setSessionAttachments(sessionId, attached.filter((p) => p !== path));
    await refreshSessions();
  };
  const open = (target: string) => window.nekko.openPath(target);

  const visible = (bundle?.items ?? []).map((i) => ({
    ...i,
    included: !excluded.has(i.id),
    pinned: pinned.has(i.id),
  }));
  const total = visible.filter((i) => i.included).reduce((s, i) => s + i.tokens, 0);
  const windowTokens = bundle?.contextWindow ?? 128000;
  const pct = Math.min(100, (total / windowTokens) * 100);
  const groups = groupBy(visible, (i) => i.source);
  const guidelineItems = visible.filter((i) => i.source === 'guideline');
  const memoryCount = visible.filter((i) => i.source === 'memory').length;

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
          {Math.round(pct)}% of the model's window · what enters the prompt this turn.
        </p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Sources: folders */}
        <Section title="Folders" onAdd={addFolder} addLabel="Add folder">
          {workspaces.length === 0 && <Hint>No folder yet. Add one to ground the chat in your code.</Hint>}
          {workspaces.map((w) => {
            const active = session?.workspaceId === w.id;
            return (
              <Row
                key={w.id}
                active={active}
                icon={<FolderIcon className="h-3.5 w-3.5" />}
                title={baseName(w.path) || w.path}
                subtitle={w.path}
                onClick={() => useFolder(w.id)}
                badge={active ? 'active' : undefined}
                onRemove={() => removeFolder(w.id)}
              />
            );
          })}
        </Section>

        {/* Sources: attached files */}
        <Section title="Files" onAdd={addFiles} addLabel="Attach files">
          {attached.length === 0 && <Hint>Attach files to pin them into every turn of this chat.</Hint>}
          {attached.map((p) => (
            <Row
              key={p}
              icon={<FileIcon className="h-3.5 w-3.5" />}
              title={baseName(p)}
              subtitle={p}
              onClick={() => open(p)}
              onRemove={() => removeFile(p)}
            />
          ))}
        </Section>

        {/* Spec-driven development */}
        <SpecPanel sessionId={sessionId} session={session} />

        {/* Sources: guidelines & memory */}
        {(guidelineItems.length > 0 || memoryCount > 0) && (
          <Section title="Project context">
            {guidelineItems.map((g) => (
              <Row
                key={g.id}
                icon={<FileIcon className="h-3.5 w-3.5" />}
                title={g.label}
                subtitle={g.origin}
                onClick={() => open(g.origin)}
              />
            ))}
            {memoryCount > 0 && (
              <div className="px-1 py-1 text-[11px] text-ink-faint">
                {memoryCount} memory note{memoryCount === 1 ? '' : 's'} in context
              </div>
            )}
          </Section>
        )}

        {/* Breakdown */}
        {visible.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Breakdown</div>
            <div className="space-y-4">
              {Object.entries(groups).map(([source, items]) => (
                <div key={source}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: SOURCE_COLOR[source as ContextItem['source']] }}
                    />
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
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  onAdd,
  addLabel,
  children,
}: {
  title: string;
  onAdd?: () => void;
  addLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{title}</span>
        {onAdd && (
          <button className="text-ink-faint hover:text-ink" title={addLabel} onClick={onAdd}>
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  icon,
  title,
  subtitle,
  active,
  badge,
  onClick,
  onRemove,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  active?: boolean;
  badge?: string;
  onClick?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
        active ? 'border-accent/40 bg-accent/5' : 'border-line'
      } ${onClick ? 'cursor-pointer hover:bg-surface-2' : ''}`}
      onClick={onClick}
    >
      <span className={active ? 'text-accent' : 'text-ink-faint'}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium">{title}</span>
          {badge && <span className="chip shrink-0 text-[9px] uppercase">{badge}</span>}
          {onClick && <ExternalIcon className="h-3 w-3 shrink-0 text-ink-faint opacity-0 group-hover:opacity-100" />}
        </div>
        {subtitle && <p className="truncate text-[10.5px] text-ink-faint">{subtitle}</p>}
      </div>
      {onRemove && (
        <button
          className="shrink-0 text-ink-faint opacity-0 hover:text-red-400 group-hover:opacity-100"
          title="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-[11px] leading-snug text-ink-faint">{children}</p>;
}

function Empty() {
  return (
    <div className="flex h-full w-80 flex-col items-center justify-center border-l border-line p-6 text-center">
      <h3 className="text-sm font-semibold">Context</h3>
      <p className="mt-2 text-[12px] text-ink-faint">Start or open a chat to see and manage its context here.</p>
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
