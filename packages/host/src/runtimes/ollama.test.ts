import { describe, expect, it } from 'vitest';
import { createOllamaAdapter } from './ollama.js';
import type { RuntimeContext } from './types.js';

const PS = {
  models: [
    {
      name: 'llama3.1:8b',
      model: 'llama3.1:8b',
      size: 6_000_000_000,
      size_vram: 4_000_000_000,
      context_length: 8192,
      expires_at: '2026-09-09T12:00:00Z',
      details: { parameter_size: '8B', quantization_level: 'Q4_K_M' },
    },
  ],
};

const SHOW = {
  details: { parameter_size: '8B', quantization_level: 'Q4_K_M' },
  model_info: {
    'llama.block_count': 32,
    'llama.attention.head_count': 32,
    'llama.attention.head_count_kv': 8,
    'llama.embedding_length': 4096,
    'llama.context_length': 131072,
  },
};

const TAGS = { models: [{ name: 'llama3.1:8b', size: 5_500_000_000 }] };

function ctxWith(routes: Record<string, unknown>, run: RuntimeContext['run'] = async () => null): RuntimeContext {
  return {
    fetch: (async (url: string) => {
      const key = Object.keys(routes).find((k) => String(url).includes(k));
      if (!key) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
      return { ok: true, status: 200, json: async () => routes[key] } as unknown as Response;
    }) as unknown as typeof fetch,
    run,
  };
}

describe('ollama adapter', () => {
  it('reads geometry out of the architecture-prefixed model_info map', async () => {
    const a = createOllamaAdapter(ctxWith({ '/api/show': SHOW, '/api/ps': PS, '/api/tags': TAGS }));
    const [facts] = await a.listModels('http://localhost:11434');
    expect(facts.layers).toBe(32);
    expect(facts.kvHeads).toBe(8);
    expect(facts.headDim).toBe(128); // 4096 / 32
    expect(facts.maxContext).toBe(131072);
    expect(facts.quantization).toBe('Q4_K_M');
  });

  it('handles an architecture it has never seen', async () => {
    const exotic = {
      model_info: {
        'someNewArch.block_count': 48,
        'someNewArch.attention.head_count': 64,
        'someNewArch.attention.head_count_kv': 8,
        'someNewArch.embedding_length': 8192,
      },
    };
    const a = createOllamaAdapter(ctxWith({ '/api/show': exotic, '/api/ps': { models: [] }, '/api/tags': TAGS }));
    const [facts] = await a.listModels('http://localhost:11434');
    expect(facts.layers).toBe(48);
    expect(facts.headDim).toBe(128);
  });

  it('prefers the resident size over the on-disk size', async () => {
    const a = createOllamaAdapter(ctxWith({ '/api/show': SHOW, '/api/ps': PS, '/api/tags': TAGS }));
    const [facts] = await a.listModels('http://localhost:11434');
    expect(facts.weightsBytes).toBe(6_000_000_000);
    expect(facts.loaded).toBe(true);
  });

  it('falls back to the on-disk size when nothing is resident', async () => {
    const a = createOllamaAdapter(ctxWith({ '/api/show': SHOW, '/api/ps': { models: [] }, '/api/tags': TAGS }));
    const [facts] = await a.listModels('http://localhost:11434');
    expect(facts.weightsBytes).toBe(5_500_000_000);
    expect(facts.loaded).toBe(false);
  });

  it('surfaces the CPU spill as the gap between size and size_vram', async () => {
    const a = createOllamaAdapter(ctxWith({ '/api/ps': PS, '/api/version': { version: '0.5.0' } }));
    const status = await a.status('http://localhost:11434');
    expect(status.resident[0].sizeBytes).toBe(6_000_000_000);
    expect(status.resident[0].vramBytes).toBe(4_000_000_000);
  });

  it('reports not running when the health probe fails', async () => {
    const a = createOllamaAdapter(ctxWith({}));
    const d = await a.detect('http://localhost:11434');
    expect(d.running).toBe(false);
    expect(d.installed).toBe(false);
    expect(d.reason).toContain('ollama.com');
  });

  it('reports installed-but-stopped when the CLI is present', async () => {
    const a = createOllamaAdapter(ctxWith({}, async () => 'ollama version is 0.5.7'));
    const d = await a.detect('http://localhost:11434');
    expect(d.running).toBe(false);
    expect(d.installed).toBe(true);
    expect(d.version).toBe('0.5.7');
  });

  it('sends num_ctx, num_gpu and keep_alive when loading', async () => {
    const bodies: string[] = [];
    const a = createOllamaAdapter({
      fetch: (async (_u: string, init?: RequestInit) => {
        if (init?.body) bodies.push(String(init.body));
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }) as unknown as typeof fetch,
      run: async () => null,
    });
    await a.load!('http://localhost:11434', 'llama3.1:8b', {
      contextTokens: 16384,
      gpuLayers: 20,
      ttlSeconds: 600,
    });
    const body = JSON.parse(bodies[0]);
    expect(body.model).toBe('llama3.1:8b');
    expect(body.options.num_ctx).toBe(16384);
    expect(body.options.num_gpu).toBe(20);
    expect(body.keep_alive).toBe('600s');
  });

  it('unloads by setting keep_alive to zero', async () => {
    const bodies: string[] = [];
    const a = createOllamaAdapter({
      fetch: (async (_u: string, init?: RequestInit) => {
        if (init?.body) bodies.push(String(init.body));
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }) as unknown as typeof fetch,
      run: async () => null,
    });
    await a.unload!('http://localhost:11434', 'llama3.1:8b');
    expect(JSON.parse(bodies[0]).keep_alive).toBe(0);
  });

  it('reports unknown geometry rather than inventing it when show fails', async () => {
    const a = createOllamaAdapter(ctxWith({ '/api/ps': { models: [] }, '/api/tags': TAGS }));
    const [facts] = await a.listModels('http://localhost:11434');
    expect(facts.layers).toBeUndefined();
    expect(facts.kvHeads).toBeUndefined();
  });
});
