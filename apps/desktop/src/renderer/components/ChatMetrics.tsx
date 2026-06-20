import React from 'react';
import type { ContextBundle, ContextItem, EffortLevel } from '@open-paw/shared';
import { useStore } from '../store.js';

const SOURCE_LABEL: Record<string, string> = {
  'attached-file': 'Files',
  guideline: 'Guidelines',
  memory: 'Memory',
  connector: 'Connectors',
  'index-snippet': 'Code index',
  system: 'System',
};

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`);

const EFFORTS: EffortLevel[] = ['low', 'normal', 'high'];

/**
 * Thin status bar under the conversation: context usage (with a hover breakdown
 * of where the tokens go), throughput, whether the model is thinking, and an
 * effort control — mirroring the at-a-glance metrics in Claude Code.
 */
export function ChatMetrics({
  bundle,
  tps,
  thinking,
  streaming,
}: {
  bundle: ContextBundle | null;
  tps: number;
  thinking: boolean;
  streaming: boolean;
}) {
  const settings = useStore((s) => s.settings);
  const effort = settings?.effort ?? 'normal';

  const included = (bundle?.items ?? []).filter((i: ContextItem) => i.included);
  const used = included.reduce((s, i) => s + i.tokens, 0);
  const windowTokens = bundle?.contextWindow ?? 0;
  const pct = windowTokens ? Math.min(100, (used / windowTokens) * 100) : 0;

  const bySource = included.reduce<Record<string, number>>((acc, i) => {
    acc[i.source] = (acc[i.source] ?? 0) + i.tokens;
    return acc;
  }, {});

  const cycleEffort = () => {
    const next = EFFORTS[(EFFORTS.indexOf(effort) + 1) % EFFORTS.length];
    window.nekko.updateSettings({ effort: next });
    useStore.getState().refreshSettings();
  };

  return (
    <div className="border-t border-line px-4 py-1.5 md:px-5">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-4 text-[11px] text-ink-faint">
        {/* Context usage with hover breakdown */}
        <div className="group relative flex cursor-default items-center gap-1.5">
          <span className="font-medium text-ink-soft">Context</span>
          <span>
            {fmt(used)}{windowTokens ? ` / ${fmt(windowTokens)}` : ''}
          </span>
          <span className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
            <span
              className="block h-full rounded-full"
              style={{ width: `${pct}%`, background: pct > 85 ? '#e0574a' : 'var(--accent)' }}
            />
          </span>
          {/* tooltip */}
          <div className="pointer-events-none absolute bottom-6 left-0 z-40 hidden w-56 rounded-xl border border-line p-3 text-[11px] shadow-lg group-hover:block" style={{ background: 'var(--surface)' }}>
            <div className="mb-1.5 font-semibold text-ink">Where the tokens go</div>
            {included.length === 0 && <div className="text-ink-faint">Nothing in context yet.</div>}
            {Object.entries(bySource)
              .sort((a, b) => b[1] - a[1])
              .map(([src, n]) => (
                <div key={src} className="flex justify-between py-0.5">
                  <span className="text-ink-soft">{SOURCE_LABEL[src] ?? src}</span>
                  <span>{n.toLocaleString()} tok</span>
                </div>
              ))}
            <div className="mt-1.5 flex justify-between border-t border-line pt-1.5 font-medium text-ink">
              <span>Total</span>
              <span>{used.toLocaleString()} tok</span>
            </div>
          </div>
        </div>

        <span className="opacity-40">·</span>

        {/* Throughput */}
        <span title="Output tokens per second (last turn)">
          {tps > 0 ? `${tps} tok/s` : '— tok/s'}
        </span>

        <span className="opacity-40">·</span>

        {/* Thinking indicator */}
        <span className="flex items-center gap-1" title="Whether the model streamed reasoning this turn">
          <span
            className={`h-1.5 w-1.5 rounded-full ${thinking && streaming ? 'animate-pulse' : ''}`}
            style={{ background: thinking ? 'var(--accent)' : 'var(--ink-faint)' }}
          />
          thinking {thinking ? 'on' : 'off'}
        </span>

        {/* Effort control (pushed right) */}
        <button
          className="ml-auto rounded-md px-2 py-0.5 hover:text-ink"
          style={{ background: 'var(--surface-2)' }}
          onClick={cycleEffort}
          title="Sampling effort (temperature). Click to change."
        >
          effort: <span className="font-medium text-ink-soft">{effort}</span>
        </button>
      </div>
    </div>
  );
}
