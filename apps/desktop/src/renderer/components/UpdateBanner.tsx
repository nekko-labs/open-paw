import React, { useEffect, useState } from 'react';
import type { AppInfo, UpdateInfo } from '@open-paw/shared';
import { useStore } from '../store.js';

const LS_LAST_VERSION = 'op_last_version';

/**
 * Top-right update surface. Three jobs:
 *  1. First run (desktop): ask whether to auto-check for updates.
 *  2. When a newer version is available: offer an Update button.
 *  3. Right after updating: confirm the new version + link to the release notes.
 */
export function UpdateBanner() {
  const settings = useStore((s) => s.settings);
  const refreshSettings = useStore((s) => s.refreshSettings);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [justUpdated, setJustUpdated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissedFirstRun, setDismissedFirstRun] = useState(false);

  useEffect(() => {
    let off: (() => void) | undefined;
    window.nekko.getAppInfo().then((ai) => {
      setInfo(ai);
      // "Updated to version X" — current version differs from the last one we saw.
      const last = localStorage.getItem(LS_LAST_VERSION);
      if (last && last !== ai.version) setJustUpdated(ai.version);
      localStorage.setItem(LS_LAST_VERSION, ai.version);
    });
    off = window.nekko.onUpdateEvent((u) => setUpdate(u));
    return () => off?.();
  }, []);

  // Once the user has opted into auto-update, do a check on load.
  useEffect(() => {
    if (settings?.autoUpdate) window.nekko.checkForUpdates().then(setUpdate);
  }, [settings?.autoUpdate]);

  if (!info) return null;

  const isDesktop = info.edition === 'desktop';
  const notesUrl = update?.notesUrl ?? 'https://github.com/nekko-labs/open-paw/releases/latest';
  const openNotes = () => window.nekko.openPath(notesUrl);

  // First-run prompt (desktop only — the web edition just refreshes).
  const showFirstRun =
    isDesktop && settings != null && !settings.autoUpdatePrompted && !dismissedFirstRun;

  const enableAuto = async () => {
    await window.nekko.updateSettings({ autoUpdate: true, autoUpdatePrompted: true });
    await refreshSettings();
    setBusy(true);
    setUpdate(await window.nekko.checkForUpdates());
    setBusy(false);
  };
  const declineAuto = async () => {
    await window.nekko.updateSettings({ autoUpdatePrompted: true });
    await refreshSettings();
    setDismissedFirstRun(true);
  };

  const doUpdate = async () => {
    setBusy(true);
    if (!isDesktop) {
      await window.nekko.quitAndInstall(); // reloads the page
      return;
    }
    if (update?.state === 'downloaded') {
      await window.nekko.quitAndInstall();
      return;
    }
    setUpdate(await window.nekko.downloadUpdate());
    setBusy(false);
  };

  const available = update && (update.state === 'available' || update.state === 'downloading' || update.state === 'downloaded');

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-30 flex w-80 flex-col gap-3">
      {justUpdated && (
        <div className="card pointer-events-auto fade-in p-3 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[13px] font-semibold">Updated to version {justUpdated} 🎉</div>
              <button className="mt-1 text-[12px] text-accent hover:underline" onClick={openNotes}>
                Check out what's new →
              </button>
            </div>
            <button className="text-ink-faint hover:text-ink" onClick={() => setJustUpdated(null)}>✕</button>
          </div>
        </div>
      )}

      {showFirstRun && (
        <div className="card pointer-events-auto fade-in p-3 shadow-lg">
          <div className="text-[13px] font-semibold">Auto-check for updates?</div>
          <p className="mt-1 text-[11px] text-ink-faint">
            Periodically checks GitHub for new versions. <span className="italic">Note: connects to the internet.</span>
          </p>
          <div className="mt-2.5 flex justify-end gap-2">
            <button className="btn btn-ghost px-2.5 py-1 text-[12px]" onClick={declineAuto}>No thanks</button>
            <button className="btn btn-primary px-2.5 py-1 text-[12px]" onClick={enableAuto} disabled={busy}>
              Yes, check
            </button>
          </div>
        </div>
      )}

      {available && (
        <div className="card pointer-events-auto fade-in p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold">
              {isDesktop ? `Update available — v${update!.version ?? ''}` : 'A new version is available'}
            </div>
            <button className="text-ink-faint hover:text-ink" onClick={() => setUpdate({ ...update!, state: 'idle' })}>✕</button>
          </div>
          {update!.state === 'downloading' ? (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
                <div className="h-full rounded-full" style={{ width: `${update!.percent ?? 0}%`, background: 'var(--accent)' }} />
              </div>
              <p className="mt-1 text-[11px] text-ink-faint">Downloading… {update!.percent ?? 0}%</p>
            </div>
          ) : (
            <div className="mt-2.5 flex items-center justify-between">
              <button className="text-[12px] text-accent hover:underline" onClick={openNotes}>What's new</button>
              <button className="btn btn-primary px-2.5 py-1 text-[12px]" onClick={doUpdate} disabled={busy}>
                {isDesktop ? (update!.state === 'downloaded' ? 'Restart to update' : 'Update') : 'Refresh now'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
