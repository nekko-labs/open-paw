/** Chat / agent conversation types. */

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  /** Text or JSON-serializable output shown back to the model. */
  output: string;
  isError?: boolean;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  /** Tool calls requested by the assistant in this message. */
  toolCalls?: ToolCall[];
  /** Tool results (for role === 'tool'). */
  toolResult?: ToolResult;
  createdAt: number;
}

/** Per-session Context Inspector preferences (which provenance items the user
 *  excluded or pinned), keyed by context item id. Persisted with the session. */
export interface ContextPrefs {
  excluded: string[];
  pinned: string[];
}

/**
 * How a chat handles tool execution:
 *  - `ask`        — confirm every file write / command before it runs.
 *  - `guardrails` — run freely except where the guardrail rules say ask/deny.
 *  - `yolo`       — run everything without confirming (deny rules still block).
 */
export type ChatMode = 'ask' | 'guardrails' | 'yolo';

export interface Session {
  id: string;
  title: string;
  workspaceId?: string;
  /**
   * When set, this session was spawned as a sub-agent by another session. The
   * workbench nests it as a sub-tab under its parent; the agent loop reports its
   * final answer back to the parent's `spawn_agent` tool call.
   */
  parentSessionId?: string;
  providerId?: string;
  modelId?: string;
  messages: ChatMessage[];
  contextPrefs?: ContextPrefs;
  /** Files explicitly attached to this chat's context (absolute paths). */
  attachedPaths?: string[];
  /** When set, the chat keeps a spec.md in the workspace updated each turn. */
  specLinked?: boolean;
  /** Tool-execution policy for this chat. */
  mode?: ChatMode;
  /** Tool names the user disabled for this chat (subset of the builtins). */
  disabledTools?: string[];
  /** Offline: no tool calls, no connectors/internet (local models only). */
  offline?: boolean;
  /** Incognito: don't persist the transcript or touch memory. */
  incognito?: boolean;
  /** Pinned to the top of the chat list. */
  pinned?: boolean;
  /** Free-form tags for organizing/filtering chats. */
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

/** Time window for bulk chat deletion. */
export type ChatClearScope = 'today' | 'month' | 'all';

/** Streaming events emitted by the agent loop. */
export type AgentEvent =
  | { type: 'text'; sessionId: string; delta: string }
  | { type: 'reasoning'; sessionId: string; delta: string }
  | { type: 'tool_call'; sessionId: string; call: ToolCall }
  | { type: 'tool_approval_required'; sessionId: string; call: ToolCall; reason: string; severity: 'low' | 'medium' | 'high' }
  | { type: 'tool_result'; sessionId: string; result: ToolResult }
  | { type: 'usage'; sessionId: string; inputTokens: number; outputTokens: number }
  | { type: 'done'; sessionId: string; messageId: string }
  | { type: 'error'; sessionId: string; message: string };

export interface SendOptions {
  sessionId: string;
  providerId: string;
  modelId: string;
  text: string;
  /** File paths the user explicitly attached as context. */
  attachedPaths?: string[];
  /** Re-answer the last user turn: drop trailing assistant/tool messages and
   *  don't append a new user message. */
  regenerate?: boolean;
}
