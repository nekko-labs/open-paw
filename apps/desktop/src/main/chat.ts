import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { AgentEvent, ChatMessage, ContextBundle, SendOptions, ToolCall } from '@nekko/shared';
import {
  createProvider,
  runAgent,
  buildSystemPrompt,
  assembleContext,
  renderContextBlock,
  isGuidelineFile,
} from '@nekko/core';
import { getSettings } from './store.js';
import { getSession, saveSession } from './sessions.js';
import { executeTool } from './tools.js';
import { recordUsage } from './usage.js';
import { listMemory } from './memory.js';

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

/** Build the context bundle for the Context Inspector preview (no model call). */
export function previewContext(sessionId: string, attachedPaths: string[]): ContextBundle {
  const session = getSession(sessionId);
  return assembleContext({
    attached: collectAttached(attachedPaths),
    guidelines: collectGuidelines(),
    memory: [
      ...listMemory('global'),
      ...(session?.workspaceId ? listMemory('workspace', session.workspaceId) : []),
    ],
    connectorSnippets: [],
    indexSnippets: [],
  });
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

  // Build context with provenance.
  const bundle = assembleContext({
    attached: collectAttached(opts.attachedPaths ?? []),
    guidelines: collectGuidelines(),
    memory: [
      ...listMemory('global'),
      ...(session.workspaceId ? listMemory('workspace', session.workspaceId) : []),
    ],
    connectorSnippets: [],
    indexSnippets: [],
  });
  const contents = new Map<string, string>();
  for (const item of bundle.items) contents.set(item.id, item.preview);
  const contextBlock = renderContextBlock(bundle, contents);

  const system = buildSystemPrompt({
    workspaces: settings.workspaces,
    contextBlock,
    platform: process.platform,
  });

  // Append the user message.
  const userMsg: ChatMessage = {
    id: `msg_${Date.now().toString(36)}`,
    role: 'user',
    content: opts.text,
    createdAt: Date.now(),
  };
  session.messages.push(userMsg);
  if (session.title === 'New chat') session.title = opts.text.slice(0, 48) || 'New chat';
  session.providerId = opts.providerId;
  session.modelId = opts.modelId;
  saveSession(session);

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
      executeTool: (call) =>
        executeTool(call, {
          settings,
          defaultCwd: settings.workspaces[0]?.path,
          requestApproval,
        }),
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
        saveSession(session);
      }
    }
  } catch (e) {
    send({ type: 'error', sessionId: opts.sessionId, message: (e as Error).message });
  } finally {
    abortControllers.delete(opts.sessionId);
    saveSession(session);
  }
}
