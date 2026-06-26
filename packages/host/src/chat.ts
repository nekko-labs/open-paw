import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { AgentEvent, ChatMessage, ContextBundle, SendOptions, ToolCall } from '@open-paw/shared';
import { EFFORT_TEMPERATURE } from '@open-paw/shared';
import {
  createProvider,
  runAgent,
  buildSystemPrompt,
  assembleContext,
  renderContextBlock,
  isGuidelineFile,
  getConnector,
  BUILTIN_TOOLS,
} from '@open-paw/core';
import { getSettings } from './store.js';
import { getSession, saveSession, createSession } from './sessions.js';
import { executeTool } from './tools.js';
import { recordUsage } from './usage.js';
import { listMemory } from './memory.js';
import { searchWorkspace } from './workspace.js';
import { buildSpec } from './spec.js';
import { syncMcp, mcpToolSpecs, isMcpTool, callMcpTool } from './mcp.js';

/**
 * Retrieve code snippets from the session's workspace index relevant to the
 * query, so the model gets grounding without having to grep first. Keyword
 * tokens are searched, hits grouped per file, and the top few files included.
 */
function collectIndexSnippets(
  workspaceId: string | undefined,
  query: string,
): Array<{ relPath: string; path: string; body: string }> {
  if (!workspaceId || !query.trim()) return [];
  const folder = getSettings().workspaces.find((w) => w.id === workspaceId);
  if (!folder) return [];

  const tokens = Array.from(new Set(query.toLowerCase().match(/[a-z0-9_]{4,}/g) ?? [])).slice(0, 6);
  if (tokens.length === 0) return [];

  const byFile = new Map<string, { path: string; lines: string[] }>();
  for (const token of tokens) {
    for (const hit of searchWorkspace(folder, token)) {
      const entry = byFile.get(hit.relPath) ?? { path: hit.path, lines: [] };
      if (entry.lines.length < 8) entry.lines.push(`${hit.line}: ${hit.text}`);
      byFile.set(hit.relPath, entry);
    }
  }

  return [...byFile.entries()]
    .sort((a, b) => b[1].lines.length - a[1].lines.length)
    .slice(0, 4)
    .map(([relPath, v]) => ({ relPath, path: v.path, body: v.lines.join('\n') }));
}

type Sender = (event: AgentEvent) => void;

const abortControllers = new Map<string, AbortController>();
const pendingApprovals = new Map<string, (approved: boolean) => void>();

/** Resolve a pending tool approval (called from IPC when the user clicks). */
export function resolveApproval(toolCallId: string, approved: boolean): void {
  pendingApprovals.get(toolCallId)?.(approved);
  pendingApprovals.delete(toolCallId);
}

export function abortChat(sessionId: string): void {
  abortControllers.get(sessionId)?.abort();
  abortControllers.delete(sessionId);
}

/** Read guideline files (AGENTS.md/CLAUDE.md/...) from the workspace roots. */
function collectGuidelines(): Array<{ path: string; content: string }> {
  const settings = getSettings();
  const out: Array<{ path: string; content: string }> = [];
  const names = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.windsurfrules', 'GEMINI.md'];
  for (const w of settings.workspaces) {
    for (const n of names) {
      if (!isGuidelineFile(n)) continue;
      const p = join(w.path, n);
      if (existsSync(p)) {
        try {
          out.push({ path: p, content: readFileSync(p, 'utf8').slice(0, 20000) });
        } catch {
          /* skip */
        }
      }
    }
  }
  return out;
}

function collectAttached(paths: string[]): Array<{ path: string; content: string }> {
  return paths
    .map((p) => {
      try {
        return existsSync(p) ? { path: p, content: readFileSync(p, 'utf8').slice(0, 20000) } : null;
      } catch {
        return null;
      }
    })
    .filter((x): x is { path: string; content: string } => !!x);
}

/**
 * Best-effort fetch of a few resources from each connected connector, mapped to
 * context snippets. Bounded by an overall timeout so a slow/unreachable service
 * never stalls a turn; failures are silently skipped.
 */
async function collectConnectorSnippets(
  query?: string,
  timeoutMs = 2500,
): Promise<Array<{ label: string; origin: string; body: string }>> {
  const connectors = getSettings().connectors.filter((c) => c.connected && c.token);
  if (connectors.length === 0) return [];

  const fetches = connectors.map(async (c) => {
    try {
      const resources = await getConnector(c.kind).fetch(c.token!, query, c.settings);
      return resources.slice(0, 5).map((r) => ({
        label: r.title,
        origin: c.kind,
        body: [r.subtitle, r.body].filter(Boolean).join(' — ') || r.title,
      }));
    } catch {
      return [];
    }
  });

  const timeout = new Promise<never[]>((resolve) => setTimeout(() => resolve([]), timeoutMs));
  const settled = await Promise.race([Promise.all(fetches), timeout]);
  return Array.isArray(settled) ? settled.flat() : [];
}

/** Build the context bundle for the Context Inspector preview (no model call). */
export async function previewContext(sessionId: string, attachedPaths: string[]): Promise<ContextBundle> {
  const session = getSession(sessionId);
  return assembleContext({
    attached: collectAttached([...(session?.attachedPaths ?? []), ...attachedPaths]),
    guidelines: collectGuidelines(),
    memory: [
      ...listMemory('global'),
      ...(session?.workspaceId ? listMemory('workspace', session.workspaceId) : []),
    ],
    connectorSnippets: await collectConnectorSnippets(),
    indexSnippets: [],
    excluded: new Set(session?.contextPrefs?.excluded ?? []),
    pinned: new Set(session?.contextPrefs?.pinned ?? []),
  });
}

/** Persist the user's include/pin choices for a session. */
export function setContextPrefs(sessionId: string, prefs: { excluded: string[]; pinned: string[] }): void {
  const session = getSession(sessionId);
  if (!session) return;
  session.contextPrefs = prefs;
  saveSession(session);
}

/** How deep in the sub-agent tree a session sits (root = 0). */
function sessionDepth(sessionId: string): number {
  let depth = 0;
  let cur = getSession(sessionId);
  while (cur?.parentSessionId && depth < 16) {
    depth++;
    cur = getSession(cur.parentSessionId);
  }
  return depth;
}

/** Maximum sub-agent nesting (a root agent may spawn children, they may spawn one more). */
const MAX_AGENT_DEPTH = 2;

/**
 * Run a delegated sub-task as a fresh child session and return its final answer.
 * The child streams its own agent events (under its own sessionId) so the
 * workbench can show it as a nested tab; we read back its last assistant message
 * as the tool result for the parent.
 */
async function runSubAgent(
  parentId: string,
  providerId: string,
  modelId: string,
  title: string | undefined,
  task: string,
  send: Sender,
): Promise<string> {
  if (sessionDepth(parentId) >= MAX_AGENT_DEPTH) {
    return 'Sub-agent depth limit reached — handle this part of the task directly instead of delegating further.';
  }
  if (!task.trim()) return 'No task was provided to the sub-agent.';
  const parent = getSession(parentId);
  const child = createSession(parent?.workspaceId, parentId);
  child.title = (title?.trim() || task.trim().slice(0, 40)) || 'Sub-agent';
  child.providerId = providerId;
  child.modelId = modelId;
  child.mode = parent?.mode; // inherit the parent's tool-execution policy
  saveSession(child);
  await sendChat({ sessionId: child.id, providerId, modelId, text: task }, send);
  const done = getSession(child.id);
  const last = [...(done?.messages ?? [])].reverse().find((m) => m.role === 'assistant' && m.content.trim());
  return last?.content ?? 'Sub-agent finished without producing a written answer.';
}

/** Run a chat turn end to end. */
export async function sendChat(opts: SendOptions, send: Sender): Promise<void> {
  const settings = getSettings();
  const provider = settings.providers.find((p) => p.id === opts.providerId);
  if (!provider) {
    send({ type: 'error', sessionId: opts.sessionId, message: 'Provider not configured.' });
    return;
  }
  const session = getSession(opts.sessionId);
  if (!session) {
    send({ type: 'error', sessionId: opts.sessionId, message: 'Session not found.' });
    return;
  }

  // Per-chat policy.
  const mode = session.mode ?? settings.defaultChatMode ?? 'guardrails';
  const offline = !!session.offline;
  const incognito = !!session.incognito;
  // Offline disables tool calls entirely; otherwise combine builtins + connected
  // MCP tools, then drop any the user turned off for this chat.
  let tools: typeof BUILTIN_TOOLS = [];
  if (!offline) {
    if (settings.mcpServers?.some((s) => s.enabled)) await syncMcp(settings.mcpServers);
    const disabled = new Set(session.disabledTools ?? []);
    tools = [...BUILTIN_TOOLS, ...mcpToolSpecs()].filter((t) => !disabled.has(t.name));
  }
  // Persist only when not incognito.
  const persist = () => { if (!incognito) saveSession(session); };

  // Build context with provenance. Offline mode skips internet connectors.
  const bundle = assembleContext({
    attached: collectAttached([...(session.attachedPaths ?? []), ...(opts.attachedPaths ?? [])]),
    guidelines: collectGuidelines(),
    memory: [
      ...listMemory('global'),
      ...(session.workspaceId ? listMemory('workspace', session.workspaceId) : []),
    ],
    connectorSnippets: offline ? [] : await collectConnectorSnippets(opts.text),
    indexSnippets: collectIndexSnippets(session.workspaceId, opts.text),
    excluded: new Set(session.contextPrefs?.excluded ?? []),
    pinned: new Set(session.contextPrefs?.pinned ?? []),
  });
  const contents = new Map<string, string>();
  for (const item of bundle.items) contents.set(item.id, item.preview);
  const contextBlock = renderContextBlock(bundle, contents);

  const system = buildSystemPrompt({
    workspaces: settings.workspaces,
    contextBlock,
    platform: process.platform,
  });

  if (opts.regenerate) {
    // Re-answer the last user turn: drop trailing assistant/tool messages.
    while (session.messages.length && session.messages[session.messages.length - 1].role !== 'user') {
      session.messages.pop();
    }
  } else {
    // Append the user message.
    const userMsg: ChatMessage = {
      id: `msg_${Date.now().toString(36)}`,
      role: 'user',
      content: opts.text,
      createdAt: Date.now(),
    };
    session.messages.push(userMsg);
    if (session.title === 'New chat') session.title = opts.text.slice(0, 48) || 'New chat';
  }
  session.providerId = opts.providerId;
  session.modelId = opts.modelId;
  persist();

  const abort = new AbortController();
  abortControllers.set(opts.sessionId, abort);

  const requestApproval = (call: ToolCall, reason: string, severity: 'low' | 'medium' | 'high') =>
    new Promise<boolean>((resolveP) => {
      pendingApprovals.set(call.id, resolveP);
      send({ type: 'tool_approval_required', sessionId: opts.sessionId, call, reason, severity });
    });

  try {
    for await (const event of runAgent({
      sessionId: opts.sessionId,
      provider: createProvider(provider),
      model: opts.modelId,
      system,
      history: session.messages,
      tools,
      executeTool: (call) => {
        if (call.name === 'spawn_agent') {
          const inp = call.input as { title?: string; task?: string };
          return runSubAgent(opts.sessionId, opts.providerId, opts.modelId, inp.title, String(inp.task ?? ''), send)
            .then((output) => ({ toolCallId: call.id, output }))
            .catch((e) => ({ toolCallId: call.id, output: `Sub-agent failed: ${(e as Error).message}`, isError: true }));
        }
        return isMcpTool(call.name)
          ? callMcpTool(call)
          : executeTool(call, {
              settings,
              defaultCwd: session.workspaceId
                ? settings.workspaces.find((w) => w.id === session.workspaceId)?.path ?? settings.workspaces[0]?.path
                : settings.workspaces[0]?.path,
              requestApproval,
              mode,
            });
      },
      temperature: EFFORT_TEMPERATURE[settings.effort ?? 'normal'],
      signal: abort.signal,
    })) {
      if (event.type === 'usage') {
        recordUsage({
          ts: Date.now(),
          providerId: opts.providerId,
          modelId: opts.modelId,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          sessionId: opts.sessionId,
        });
      }
      send(event);
      if (event.type === 'done' || event.type === 'error') {
        persist();
      }
    }
  } catch (e) {
    send({ type: 'error', sessionId: opts.sessionId, message: (e as Error).message });
  } finally {
    abortControllers.delete(opts.sessionId);
    persist();
  }

  // Keep the linked spec.md in sync with the conversation (best-effort).
  if (session.specLinked && !incognito) {
    buildSpec(opts.sessionId).catch(() => {});
  }
}
