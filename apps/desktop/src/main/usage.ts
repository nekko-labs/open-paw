import { appendFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { UsageRecord, UsageSummary } from '@nekko/shared';
import { dataDir } from './store.js';

const LOG = () => join(dataDir(), 'usage.jsonl');

export function recordUsage(rec: UsageRecord): void {
  try {
    appendFileSync(LOG(), JSON.stringify(rec) + '\n', 'utf8');
  } catch {
    /* non-fatal */
  }
}

export function usageSummary(): UsageSummary {
  const summary: UsageSummary = { totalInput: 0, totalOutput: 0, byModel: {}, byProvider: {}, daily: [] };
  if (!existsSync(LOG())) return summary;

  const dailyMap = new Map<string, { input: number; output: number }>();
  for (const line of readFileSync(LOG(), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let r: UsageRecord;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    summary.totalInput += r.inputTokens;
    summary.totalOutput += r.outputTokens;

    const bm = (summary.byModel[r.modelId] ??= { input: 0, output: 0 });
    bm.input += r.inputTokens;
    bm.output += r.outputTokens;

    const bp = (summary.byProvider[r.providerId] ??= { input: 0, output: 0 });
    bp.input += r.inputTokens;
    bp.output += r.outputTokens;

    const day = new Date(r.ts).toISOString().slice(0, 10);
    const d = dailyMap.get(day) ?? { input: 0, output: 0 };
    d.input += r.inputTokens;
    d.output += r.outputTokens;
    dailyMap.set(day, d);
  }

  summary.daily = [...dailyMap.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return summary;
}
