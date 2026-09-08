import { describe, expect, it } from 'vitest';
import { createLmStudioAdapter } from './lmstudio.js';
import type { RuntimeContext } from './types.js';

const V0 = {
  data: [
    {
      id: 'qwen3-8b',
      state: 'loaded',
      type: 'llm',
      quantization: 'Q4_K_M',
      max_context_length: 32768,
      loaded_context_length: 8192,
    },
    { id: 'gemma-2-9b', state: 'not-loaded', type: 'llm', max_context_length: 8192 },
  ],
};

interface Call {
  cmd: string;
  args: string[];
}

function makeCtx(opts: { models?: unknown; runOut?: string | null } = {}) {
  const calls: Call[] = [];
  const ctx: RuntimeContext = {
    fetch: (async (url: string) => {
      if (String(url).includes('/api/v0/models') && opts.models) {
        return { ok: true, status: 200, json: async () => opts.models } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch,
    run: async (cmd, args) => {
      calls.push({ cmd, args });
      return opts.runOut === undefined ? 'ok' : opts.runOut;
    },
  };
  return { ctx, calls };
}

describe('lmstudio adapter', () => {
  it('maps the native model list into facts with load state', async () => {
    const { ctx } = makeCtx({ models: V0 });
    const facts = await createLmStudioAdapter(ctx).listModels('http://localhost:1234/v1');
    expect(facts).toHaveLength(2);
    expect(facts[0].loaded).toBe(true);
    expect(facts[0].loadedContext).toBe(8192);
    expect(facts[0].maxContext).toBe(32768);
    expect(facts[1].loaded).toBe(false);
  });

  it('reports only loaded models as resident', async () => {
    const { ctx } = makeCtx({ models: V0 });
    const status = await createLmStudioAdapter(ctx).status('http://localhost:1234/v1');
    expect(status.resident.map((r) => r.id)).toEqual(['qwen3-8b']);
  });

  it('starts and stops through the lms server lifecycle, not a port kill', async () => {
    const { ctx, calls } = makeCtx({ models: V0 });
    const a = createLmStudioAdapter(ctx);
    await a.start!({ baseUrl: 'http://localhost:1234/v1' });
    expect(calls.at(-1)?.args).toEqual(['server', 'start', '--port', '1234']);
    await a.stop!('http://localhost:1234/v1');
    expect(calls.at(-1)?.args).toEqual(['server', 'stop']);
  });

  it('passes context length and a GPU share when loading', async () => {
    const withLayers = { data: [{ id: 'qwen3-8b', state: 'not-loaded', max_context_length: 32768 }] };
    const { ctx, calls } = makeCtx({ models: withLayers });
    await createLmStudioAdapter(ctx).load!('http://localhost:1234/v1', 'qwen3-8b', {
      contextTokens: 16384,
      ttlSeconds: 900,
    });
    const args = calls.at(-1)!.args;
    expect(args).toContain('--context-length');
    expect(args[args.indexOf('--context-length') + 1]).toBe('16384');
    expect(args[args.indexOf('--ttl') + 1]).toBe('900');
    expect(args).toContain('-y');
  });

  it('turns a zero GPU layer count into --gpu off', async () => {
    const { ctx, calls } = makeCtx({ models: V0 });
    await createLmStudioAdapter(ctx).load!('http://localhost:1234/v1', 'qwen3-8b', { gpuLayers: 0 });
    const args = calls.at(-1)!.args;
    expect(args[args.indexOf('--gpu') + 1]).toBe('off');
  });

  it('treats an exit-0 "Model Not Found" as a failure, because lms does that', async () => {
    const { ctx } = makeCtx({ models: V0, runOut: 'Model Not Found\nCheck the identifier.' });
    const res = await createLmStudioAdapter(ctx).load!('http://localhost:1234/v1', 'nope', {});
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Model Not Found');
  });

  it('refuses to drive a remote instance and says why', async () => {
    const { ctx } = makeCtx({ models: V0 });
    const a = createLmStudioAdapter(ctx);
    const d = await a.detect('http://192.168.1.50:1234/v1');
    expect(d.installed).toBe(false);
    expect(d.reason).toContain('remote');
    const stop = await a.stop!('http://192.168.1.50:1234/v1');
    expect(stop.ok).toBe(false);
  });

  it('reports the CLI as missing rather than offering a dead button', async () => {
    const { ctx } = makeCtx({ models: V0, runOut: null });
    const d = await createLmStudioAdapter(ctx).detect('http://localhost:1234/v1');
    expect(d.installed).toBe(false);
    expect(d.reason).toContain('lms bootstrap');
    // The server is still answering, so it is running even though we cannot drive it.
    expect(d.running).toBe(true);
  });
});
