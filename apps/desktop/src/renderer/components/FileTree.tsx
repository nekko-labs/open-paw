import React, { useEffect, useState } from 'react';
import type { DirEntry } from '@open-paw/shared';
import { FileTypeIcon } from '../fileIcons.js';
import { FolderIcon } from '../icons.js';

/**
 * A lightweight VS Code–style file explorer: a collapsible "Files" disclosure
 * per project that lazy-loads each folder's children on expand. Clicking a file
 * opens it in a FilePane (view/edit in-app). Not a full IDE tree — no rename/DnD
 * yet — just enough to browse and open without leaving Open Paw.
 */
export function ProjectFiles({ root, onOpen }: { root: string; onOpen: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-0.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-faint hover:bg-surface-2"
      >
        <span className="w-2 text-[9px]">{open ? '▾' : '▸'}</span>
        <span>Files</span>
      </button>
      {open && <div className="mt-0.5"><DirChildren path={root} depth={0} onOpen={onOpen} /></div>}
    </div>
  );
}

function DirChildren({ path, depth, onOpen }: { path: string; depth: number; onOpen: (path: string) => void }) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    window.nekko.listDir(path).then((e) => { if (live) setEntries(e); }).catch(() => { if (live) setEntries([]); });
    return () => { live = false; };
  }, [path]);

  const pad = 8 + depth * 12;
  if (entries === null) return <p className="py-0.5 text-[11px] text-ink-faint" style={{ paddingLeft: pad }}>…</p>;
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map((e) =>
        e.dir
          ? <TreeFolder key={e.path} entry={e} depth={depth} onOpen={onOpen} />
          : <TreeFile key={e.path} entry={e} depth={depth} onOpen={onOpen} />,
      )}
    </>
  );
}

function TreeFolder({ entry, depth, onOpen }: { entry: DirEntry; depth: number; onOpen: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded py-0.5 pr-2 text-left text-[12px] text-ink-soft hover:bg-surface-2"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <span className="w-2 shrink-0 text-[9px] text-ink-faint">{open ? '▾' : '▸'}</span>
        <FolderIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
        <span className="truncate">{entry.name}</span>
      </button>
      {open && <DirChildren path={entry.path} depth={depth + 1} onOpen={onOpen} />}
    </>
  );
}

function TreeFile({ entry, depth, onOpen }: { entry: DirEntry; depth: number; onOpen: (path: string) => void }) {
  return (
    <button
      onClick={() => onOpen(entry.path)}
      title={entry.name}
      className="flex w-full items-center gap-1.5 rounded py-0.5 pr-2 text-left text-[12px] text-ink-soft hover:bg-surface-2"
      style={{ paddingLeft: 8 + depth * 12 + 10 }}
    >
      <FileTypeIcon name={entry.name} size={14} />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}
