/** Persisted app settings + usage analytics record types. */

import type { ProviderConfig } from './models.js';
import type { GuardrailRule, SandboxMode } from './guardrails.js';
import type { WorkspaceFolder } from './workspace.js';
import type { ConnectorConfig } from './connectors.js';

export type ThemeMode = 'light' | 'dark' | 'system';

/** Sampling effort — maps to temperature in the chat request. */
export type EffortLevel = 'low' | 'normal' | 'high';

export const EFFORT_TEMPERATURE: Record<EffortLevel, number> = {
  low: 0.2,
  normal: 0.7,
  high: 1.0,
};

export interface AppSettings {
  theme: ThemeMode;
  accent: string;
  sandboxMode: SandboxMode;
  providers: ProviderConfig[];
  guardrails: GuardrailRule[];
  workspaces: WorkspaceFolder[];
  connectors: ConnectorConfig[];
  defaultProviderId?: string;
  defaultModelId?: string;
  /** Show the mascot. */
  mascotEnabled: boolean;
  /** Sampling effort (temperature). */
  effort?: EffortLevel;
}

/** One usage event appended to a JSONL log for analytics. */
export interface UsageRecord {
  ts: number;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  sessionId: string;
}

export interface UsageSummary {
  totalInput: number;
  totalOutput: number;
  byModel: Record<string, { input: number; output: number }>;
  byProvider: Record<string, { input: number; output: number }>;
  /** Daily buckets (YYYY-MM-DD → tokens) for the chart. */
  daily: Array<{ date: string; input: number; output: number }>;
}
