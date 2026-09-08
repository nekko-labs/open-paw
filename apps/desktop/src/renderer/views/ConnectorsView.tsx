import React from 'react';
import { ConnectorGrid } from '../components/ConnectorGrid.js';

/**
 * The Connectors tab: a header plus the shared connector grid (also reused by
 * the onboarding integrations step in compact form).
 */
export function ConnectorsView() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-8">
        <h1 className="text-2xl font-semibold">Connectors</h1>
        <p className="mt-1 text-[13px] text-ink-faint">
          Pull issues, messages, and docs into context. Credentials are stored locally and validated on
          connect.
        </p>
        <div className="mt-6">
          <ConnectorGrid />
        </div>
      </div>
    </div>
  );
}
