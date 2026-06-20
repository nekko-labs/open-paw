import type { ChatMessage, ModelInfo, ProviderConfig, ToolCall } from '@open-paw/shared';

/** A tool the model may call, in a provider-neutral shape. */
export interface ToolSpec {
  name: string;
  description: string;
  /** JSON schema for the input. */
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  system?: string;
  tools?: ToolSpec[];
  temperature?: number;
  signal?: AbortSignal;
}

/** Streamed chunk from a provider, normalized. */
export type ProviderChunk =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'done' };

export interface Provider {
  readonly config: ProviderConfig;
  /** List available models. */
  listModels(): Promise<ModelInfo[]>;
  /** Stream a chat completion. */
  chat(req: ChatRequest): AsyncIterable<ProviderChunk>;
  /** Lightweight reachability test. */
  test(): Promise<{ ok: boolean; message: string }>;
}
