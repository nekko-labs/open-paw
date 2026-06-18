import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenAICompatProvider } from './openai-compat.js';
import type { ProviderConfig } from '@nekko/shared';

const cfg: ProviderConfig = {
  id: 'p1',
  kind: 'openai-compat',
  label: 'Test',
  baseUrl: 'http://localhost:9999/v1',
  enabled: true,
};

/** Build a Response whose body streams the given SSE lines. */
function sseResponse(lines: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const l of lines) controller.enqueue(enc.encode(l));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

afterEach(() => vi.restoreAllMocks());

describe('OpenAICompatProvider.chat', () => {
  it('streams text deltas and a usage event', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const out: string[] = [];
    let usage: { i: number; o: number } | null = null;
    for await (const c of new OpenAICompatProvider(cfg).chat({ model: 'm', messages: [] })) {
      if (c.type === 'text') out.push(c.delta);
      if (c.type === 'usage') usage = { i: c.inputTokens, o: c.outputTokens };
    }
    expect(out.join('')).toBe('Hello');
    expect(usage).toEqual({ i: 5, o: 2 });
  });

  it('accumulates streamed tool-call fragments into one call', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"read_","arguments":"{\\"pa"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"file","arguments":"th\\":\\"a.ts\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const calls = [];
    for await (const c of new OpenAICompatProvider(cfg).chat({ model: 'm', messages: [] })) {
      if (c.type === 'tool_call') calls.push(c.call);
    }
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('read_file');
    expect(calls[0].input).toEqual({ path: 'a.ts' });
  });

  it('lists models from the /models endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'llama3', context_length: 8192 }] }), { status: 200 }),
    );
    const models = await new OpenAICompatProvider(cfg).listModels();
    expect(models[0]).toMatchObject({ id: 'llama3', providerId: 'p1', contextLength: 8192 });
  });
});
