import { describe, it, expect, vi } from 'vitest';
import { runAgent } from './loop.js';
import type { Provider, ProviderChunk } from '../providers/types.js';
import type { ChatMessage, ToolCall, ToolResult } from '@open-paw/shared';

/** A scripted provider: each call to chat() yields the next pre-set chunk list. */
function scriptedProvider(rounds: ProviderChunk[][]): Provider {
  let i = 0;
  return {
    config: { id: 'p', kind: 'openai-compat', label: 'x', baseUrl: 'x', enabled: true },
    listModels: async () => [],
    test: async () => ({ ok: true, message: '' }),
    async *chat() {
      const chunks = rounds[i++] ?? [{ type: 'done' }];
      for (const c of chunks) yield c;
    },
  };
}

describe('runAgent', () => {
  it('streams text and completes when no tools are called', async () => {
    const provider = scriptedProvider([
      [{ type: 'text', delta: 'Hello' }, { type: 'text', delta: ' world' }, { type: 'done' }],
    ]);
    const history: ChatMessage[] = [{ id: 'u', role: 'user', content: 'hi', createdAt: 0 }];
    const events = [];
    for await (const e of runAgent({
      sessionId: 's', provider, model: 'm', system: 'sys', history,
      executeTool: async () => ({ toolCallId: 'x', output: '' }),
    })) {
      events.push(e);
    }
    expect(events.filter((e) => e.type === 'text').map((e: any) => e.delta).join('')).toBe('Hello world');
    expect(events.at(-1)?.type).toBe('done');
    // Assistant message appended to history.
    expect(history.at(-1)).toMatchObject({ role: 'assistant', content: 'Hello world' });
  });

  it('executes tool calls and feeds results back, then finishes', async () => {
    const call: ToolCall = { id: 'c1', name: 'read_file', input: { path: 'a.ts' } };
    const provider = scriptedProvider([
      [{ type: 'tool_call', call }, { type: 'done' }], // round 1: call a tool
      [{ type: 'text', delta: 'done reading' }, { type: 'done' }], // round 2: final answer
    ]);
    const executeTool = vi.fn(async (c: ToolCall): Promise<ToolResult> => ({
      toolCallId: c.id, output: 'file contents',
    }));
    const history: ChatMessage[] = [{ id: 'u', role: 'user', content: 'read it', createdAt: 0 }];
    const events = [];
    for await (const e of runAgent({
      sessionId: 's', provider, model: 'm', system: 'sys', history, executeTool,
    })) {
      events.push(e);
    }
    expect(executeTool).toHaveBeenCalledOnce();
    expect(events.some((e) => e.type === 'tool_call')).toBe(true);
    expect(events.some((e) => e.type === 'tool_result')).toBe(true);
    // History contains: user, assistant(toolCall), tool(result), assistant(final).
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(history.at(-1)?.content).toBe('done reading');
  });

  it('surfaces tool execution errors without throwing', async () => {
    const call: ToolCall = { id: 'c1', name: 'bash', input: { command: 'x' } };
    const provider = scriptedProvider([
      [{ type: 'tool_call', call }, { type: 'done' }],
      [{ type: 'text', delta: 'ok' }, { type: 'done' }],
    ]);
    const history: ChatMessage[] = [{ id: 'u', role: 'user', content: 'go', createdAt: 0 }];
    const results: ToolResult[] = [];
    for await (const e of runAgent({
      sessionId: 's', provider, model: 'm', system: 'sys', history,
      executeTool: async () => {
        throw new Error('boom');
      },
    })) {
      if (e.type === 'tool_result') results.push(e.result);
    }
    expect(results[0].isError).toBe(true);
    expect(results[0].output).toContain('boom');
  });

  it('forwards reasoning chunks as reasoning events', async () => {
    const provider = scriptedProvider([
      [{ type: 'reasoning', delta: 'thinking' }, { type: 'text', delta: 'ans' }, { type: 'done' }],
    ]);
    const history: ChatMessage[] = [{ id: 'u', role: 'user', content: 'q', createdAt: 0 }];
    const events = [];
    for await (const e of runAgent({
      sessionId: 's', provider, model: 'm', system: 'sys', history,
      executeTool: async () => ({ toolCallId: 'x', output: '' }),
    })) {
      events.push(e);
    }
    expect(events.some((e) => e.type === 'reasoning' && (e as any).delta === 'thinking')).toBe(true);
  });
});
