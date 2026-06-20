import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { RemoteStatus } from '@nekko/shared';

/**
 * Settings card to expose this machine over a relay so a phone can drive its
 * model. Enabling dials out to the relay and shows a pairing link + QR. Traffic
 * is end-to-end encrypted; the relay only sees ciphertext.
 */
export function RemoteAccess() {
  const [status, setStatus] = useState<RemoteStatus>({ enabled: false });
  const [relayUrl, setRelayUrl] = useState('ws://localhost:4400');
  const [qr, setQr] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.nekko.getRemoteStatus().then((s) => {
      setStatus(s);
      if (s.relayUrl) setRelayUrl(s.relayUrl);
    });
  }, []);

  // The client opens the app UI with these params. On the web edition that's
  // this same origin; in the desktop app there's no web origin, so we show the
  // raw params (point a browser/Nekko Cloud at them).
  const link =
    status.enabled && location.protocol.startsWith('http')
      ? `${location.origin}/?relay=${encodeURIComponent(status.relayUrl!)}&room=${status.room}&key=${status.key}`
      : '';

  useEffect(() => {
    if (link) QRCode.toDataURL(link, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(''));
    else setQr('');
  }, [link]);

  const enable = async () => {
    if (!relayUrl.trim()) return;
    setBusy(true);
    setStatus(await window.nekko.enableRemote(relayUrl.trim()));
    setBusy(false);
  };
  const disable = async () => {
    setBusy(true);
    setStatus(await window.nekko.disableRemote());
    setBusy(false);
  };

  return (
    <section className="card mt-5 p-5">
      <div className="flex items-center gap-2">
        <span className="text-base">📱</span>
        <h2 className="font-semibold">Remote access</h2>
        {status.enabled && <span className="chip !text-white" style={{ background: '#4ec98a' }}>on</span>}
      </div>
      <p className="mt-1 text-[12px] text-ink-faint">
        Drive this machine's model from your phone via a relay. End-to-end encrypted — the relay only
        sees ciphertext.
      </p>

      {!status.enabled ? (
        <div className="mt-3 flex gap-2">
          <input
            className="input py-1.5 text-[13px]"
            placeholder="Relay URL, e.g. ws://localhost:4400"
            value={relayUrl}
            onChange={(e) => setRelayUrl(e.target.value)}
          />
          <button className="btn btn-primary py-1.5" onClick={enable} disabled={busy}>
            {busy ? 'Connecting…' : 'Enable'}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-1 text-[12.5px] sm:grid-cols-2">
            <Field label="Relay" value={status.relayUrl!} />
            <Field label="Room" value={status.room!} />
            <Field label="Key" value={status.key!} mono />
          </div>
          {link && (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              {qr && <img src={qr} alt="Pairing QR" width={132} height={132} className="rounded-lg border border-line" />}
              <div className="min-w-0">
                <div className="text-[12px] text-ink-faint">Open this on your phone to pair:</div>
                <code className="mt-1 block break-all rounded-lg px-2 py-1.5 font-mono text-[11px]" style={{ background: 'var(--surface-2)' }}>
                  {link}
                </code>
                <button
                  className="btn btn-outline mt-2 py-1.5 text-[12px]"
                  onClick={() => navigator.clipboard?.writeText(link)}
                >
                  Copy link
                </button>
              </div>
            </div>
          )}
          <button className="btn btn-ghost py-1.5 text-[12px]" onClick={disable} disabled={busy}>
            Disable remote access
          </button>
        </div>
      )}
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-faint">{label}:</span>
      <span className={`truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
