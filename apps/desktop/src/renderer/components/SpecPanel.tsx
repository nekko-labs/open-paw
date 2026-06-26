import React, { useEffect, useState } from 'react';
import type { SpecDocStatus, Session } from '@open-paw/shared';
import { SPEC_METHODOLOGIES, getMethodology, parseTasks } from '@open-paw/shared';
import { ExternalIcon } from '../icons.js';
import { useStore } from '../store.js';

/**
 * Spec-driven development panel (Kiro-inspired). Pick a methodology, then build
 * or update each artifact in order — the spec, the plan, then a task checklist.
 * Later artifacts are chained from the earlier ones server-side. The tasks doc
 * renders as an interactive checklist whose toggles write back to the file.
 */
export function SpecPanel({ sessionId, session }: { sessionId: string; session: Session | null }) {
  const refreshSessions = useStore((s) => s.refreshSessions);
  const pushToast = useStore((s) => s.pushToast);

  const [docs, setDocs] = useState<SpecDocStatus[] | null>(null);
  const [methodologyId, setMethodologyId] = useState<string>('openpaw');
  const [busy, setBusy] = useState<string | null>(null); // doc id (or 'all') currently building
  const [showTasks, setShowTasks] = useState(true);

  const hasWorkspace = !!session?.workspaceId;

  const refresh = () => {
    window.nekko.readSpecDocs(sessionId).then((r) => {
      setDocs(r.docs);
      setMethodologyId(r.methodologyId);
    });
  };

  useEffect(() => {
    if (!sessionId) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, session?.workspaceId, session?.specMethodology]);

  const open = (target: string) => window.nekko.openPath(target);

  const changeMethodology = async (id: string) => {
    setMethodologyId(id);
    await window.nekko.setSpecMethodology(sessionId, id);
    await refreshSessions();
    refresh();
  };

  const build = async (docId: string) => {
    setBusy(docId);
    const res = await window.nekko.buildSpecDoc(sessionId, docId);
    setBusy(null);
    if (res.ok) {
      const label = methodology.docs.find((d) => d.id === docId)?.label ?? 'Document';
      pushToast('success', `${label} updated from this chat.`);
      refresh();
    } else {
      pushToast('error', res.message ?? 'Could not build the document.');
    }
  };

  const buildAll = async () => {
    setBusy('all');
    let failed: string | null = null;
    for (const d of methodology.docs) {
      const res = await window.nekko.buildSpecDoc(sessionId, d.id);
      if (!res.ok) {
        failed = res.message ?? `Could not build ${d.label}.`;
        break;
      }
    }
    setBusy(null);
    refresh();
    if (failed) pushToast('error', failed);
    else pushToast('success', `Built ${methodology.docs.length} artifacts from this chat.`);
  };

  const toggleLive = async () => {
    await window.nekko.setSpecLinked(sessionId, !session?.specLinked);
    await refreshSessions();
  };

  const toggleTask = async (line: number) => {
    const res = await window.nekko.toggleSpecTask(sessionId, line);
    if (res.ok) refresh();
    else pushToast('error', res.message ?? 'Could not update the task.');
  };

  const methodology = getMethodology(methodologyId);
  const tasksDoc = docs?.find((d) => d.role === 'tasks');
  const tasks = tasksDoc?.exists ? parseTasks(tasksDoc.content) : [];
  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Spec-driven dev</span>
        {docs && docs.some((d) => d.exists) && (
          <button
            className={`text-[10px] uppercase tracking-wide ${session?.specLinked ? 'text-accent' : 'text-ink-faint hover:text-ink'}`}
            title="Rebuild the spec after every turn"
            onClick={toggleLive}
          >
            {session?.specLinked ? '● Live' : '○ Live'}
          </button>
        )}
      </div>

      {!hasWorkspace && (
        <p className="px-1 text-[11px] leading-snug text-ink-faint">
          Add a project folder to this chat, then build a spec, plan, and tasks straight from the conversation.
        </p>
      )}

      {hasWorkspace && (
        <>
          {/* Methodology picker */}
          <select
            className="input mb-2 w-full text-[12px]"
            value={methodologyId}
            onChange={(e) => changeMethodology(e.target.value)}
            title={methodology.description}
          >
            {SPEC_METHODOLOGIES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          {/* Artifact rows */}
          <div className="space-y-1.5">
            {(docs ?? methodology.docs.map((d) => ({ ...d, path: '', exists: false, content: '' }))).map((d) => (
              <div
                key={d.id}
                className={`rounded-lg border px-2.5 py-2 ${d.exists ? 'border-accent/40 bg-accent/5' : 'border-line'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="group flex min-w-0 items-center gap-1.5 text-left"
                    onClick={() => d.exists && open(d.path)}
                    disabled={!d.exists}
                    title={d.exists ? d.path : undefined}
                  >
                    <span className="truncate text-[12.5px] font-medium">{d.label}</span>
                    <span className="chip shrink-0 text-[9px] lowercase">{d.filename}</span>
                    {d.exists && <ExternalIcon className="h-3 w-3 shrink-0 text-ink-faint opacity-0 group-hover:opacity-100" />}
                  </button>
                  <button
                    className="btn btn-outline shrink-0 text-[11px]"
                    onClick={() => build(d.id)}
                    disabled={!!busy}
                  >
                    {busy === d.id ? 'Building…' : d.exists ? 'Update' : 'Build'}
                  </button>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{d.description}</p>
              </div>
            ))}
          </div>

          {methodology.docs.length > 1 && (
            <button className="btn btn-primary mt-2 w-full text-[12px]" onClick={buildAll} disabled={!!busy}>
              {busy === 'all' ? 'Building all…' : 'Build all from chat'}
            </button>
          )}

          {/* Tasks checklist */}
          {tasks.length > 0 && (
            <div className="mt-3">
              <button
                className="mb-1.5 flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-faint"
                onClick={() => setShowTasks((v) => !v)}
              >
                <span>Tasks · {doneCount}/{tasks.length}</span>
                <span>{showTasks ? '▾' : '▸'}</span>
              </button>
              <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${tasks.length ? (doneCount / tasks.length) * 100 : 0}%`, background: 'var(--accent)' }}
                />
              </div>
              {showTasks && (
                <div className="space-y-0.5">
                  {tasks.map((t) => (
                    <label
                      key={t.line}
                      className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0 accent-[var(--accent)]"
                        checked={t.done}
                        onChange={() => toggleTask(t.line)}
                      />
                      <span className={`text-[12px] leading-snug ${t.done ? 'text-ink-faint line-through' : ''}`}>
                        {t.text}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
