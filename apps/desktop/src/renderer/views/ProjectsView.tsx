import React, { useEffect, useState } from 'react';
import type { IndexedFile, IndexStatus, SearchHit, WorkspaceFolder } from '@open-paw/shared';
import { PlusIcon, TrashIcon, FolderIcon } from '../icons.js';

export function ProjectsView() {
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [statuses, setStatuses] = useState<Record<string, IndexStatus>>({});
  const [active, setActive] = useState<string | null>(null);
  const [files, setFiles] = useState<IndexedFile[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);

  const load = async () => setFolders(await window.nekko.listWorkspaces());
  useEffect(() => {
    load();
    const off = window.nekko.onIndexProgress((s) => setStatuses((prev) => ({ ...prev, [s.workspaceId]: s })));
    return off;
  }, []);

  useEffect(() => {
    if (active) {
      window.nekko.getIndexStatus(active).then((s) => s && setStatuses((p) => ({ ...p, [active]: s })));
      window.nekko.listFiles(active).then(setFiles);
    }
  }, [active]);

  const add = async () => { setFolders(await window.nekko.addWorkspace()); };
  const reindex = async (id: string) => { const s = await window.nekko.indexWorkspace(id); setStatuses((p) => ({ ...p, [id]: s })); window.nekko.listFiles(id).then(setFiles); };

  const search = async () => { if (active && query) setHits(await window.nekko.searchWorkspace(active, query)); };

  return (
    <div className="flex h-full">
      <aside className="flex w-72 flex-col border-r border-line">
        <div className="flex items-center justify-between p-4">
          <h1 className="text-lg font-semibold">Projects</h1>
          <button className="btn btn-primary px-2.5 py-1.5" onClick={add} title="Add folder"><PlusIcon /></button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
          {folders.length === 0 && <p className="px-2 text-[12px] text-ink-faint">Add a folder to index it. Nekko supports multiple roots.</p>}
          {folders.map((f) => {
            const st = statuses[f.id];
            return (
              <div key={f.id} className={`card cursor-pointer p-3 ${active === f.id ? 'border-accent' : ''}`} onClick={() => setActive(f.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 truncate">
                    <FolderIcon className="h-4 w-4 text-ink-faint" />
                    <span className="truncate text-[13px] font-medium">{f.name}</span>
                  </div>
                  <button className="text-ink-faint" onClick={async (e) => { e.stopPropagation(); setFolders(await window.nekko.removeWorkspace(f.id)); }}>
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 truncate font-mono text-[10px] text-ink-faint">{f.path}</p>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-faint">
                  <span className={`h-2 w-2 rounded-full`} style={{ background: st?.state === 'ready' ? '#4ec98a' : st?.state === 'indexing' ? 'var(--accent)' : 'var(--line)' }} />
                  {st ? `${st.fileCount} files · ${st.symbolCount} symbols` : 'not indexed'}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!active ? (
          <div className="grid flex-1 place-items-center text-[13px] text-ink-faint">Select a project to browse its index.</div>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b border-line p-4">
              <input className="input" placeholder="Search this codebase…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
              <button className="btn btn-outline" onClick={search}>Search</button>
              <button className="btn btn-ghost" onClick={() => reindex(active)}>Re-index</button>
            </header>
            <div className="flex-1 overflow-y-auto p-4">
              {hits.length > 0 ? (
                <div className="space-y-1">
                  {hits.map((h, i) => (
                    <div key={i} className="rounded-lg px-3 py-1.5 font-mono text-[12px]" style={{ background: 'var(--surface-2)' }}>
                      <span className="text-accent">{h.relPath}:{h.line}</span> <span className="text-ink-soft">{h.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {files.slice(0, 300).map((f) => (
                    <div key={f.path} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-[12.5px] hover:bg-surface-2">
                      <span className="truncate font-mono">{f.relPath}</span>
                      <span className="text-[10px] text-ink-faint">{f.symbols.length ? `${f.symbols.length} sym` : f.language ?? ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
