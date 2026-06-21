/** Persisted app settings + usage analytics record types. */

import type { ProviderConfig } from './models.js';
import type { GuardrailRule, SandboxMode } from './guardrails.js';
import type { WorkspaceFolder } from './workspace.js';
import type { ConnectorConfig } from './connectors.js';

export type ThemeMode = 'light' | 'dark' | 'system';

/** A reusable prompt, invokable from the composer as `/name`. */
export interface PromptTemplate {
  id: string;
  name: string;
  body: string;
}

/** Built-in slash commands seeded for new installs. */
export const DEFAULT_PROMPTS: PromptTemplate[] = [
  { id: 'explain', name: 'explain', body: 'Explain how this code works, step by step.' },
  { id: 'review', name: 'review', body: 'Review this code for bugs, edge cases, and possible improvements.' },
  { id: 'test', name: 'test', body: 'Write tests for this code, covering the important edge cases.' },
  { id: 'fix', name: 'fix', body: 'Find and fix the bug. Explain the root cause and the fix.' },
  { id: 'refactor', name: 'refactor', body: 'Refactor this for clarity and simplicity without changing behavior.' },
];

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
  /** Check for app updates automatically (desktop). */
  autoUpdate?: boolean;
  /** Whether we've shown the first-run "enable auto-update?" prompt. */
  autoUpdatePrompted?: boolean;
  /** UI language (BCP-47-ish code, e.g. "en", "es"). Undefined = follow system. */
  language?: string;
  /** Default tool-execution policy for new chats. */
  defaultChatMode?: import('./chat.js').ChatMode;
  /** Reusable prompts invokable as `/name` in the composer. */
  prompts?: PromptTemplate[];
  /** Favorited models as `${providerId}::${modelId}`; sorted to the top. */
  favoriteModels?: string[];
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
