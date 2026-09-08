import React from 'react';
import { useStore } from '../../store.js';

/**
 * Placeholder for the providers step (lands in a follow-up PR: subscription
 * sign-in first, then API keys and one-click local servers). For now the card
 * is honest about that and shows where the real surface already lives. If a
 * provider somehow got connected before this step, it says so instead.
 */
export function ProvidersStep() {
  const { providers } = useStore();
  const connected = providers.length;

  return (
    <div className="w-full">
      <h1 className="text-center text-2xl font-semibold tracking-tight">Connect a model</h1>
      <p className="mx-auto mt-2 max-w-md text-center text-[14px] leading-relaxed text-ink-soft">
        Agent Nekko chats through providers you connect: a Claude or ChatGPT subscription, an API key,
        or a local server like Ollama or LM Studio.
      </p>
      <div className="card mt-6 p-5">
        {connected > 0 ? (
          <>
            <h2 className="font-semibold">
              {connected} provider{connected === 1 ? '' : 's'} connected
            </h2>
            <p className="mt-1 text-[13px] text-ink-faint">
              You're ready to chat. Add or tune providers any time in the Models tab.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-semibold">One-click setup is on its way</h2>
            <p className="mt-1 text-[13px] text-ink-faint">
              Guided provider setup lands here in the next update. Until then, the Models tab has the
              full connect flow, including local-server discovery.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
