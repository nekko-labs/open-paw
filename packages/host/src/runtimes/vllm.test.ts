import { describe, expect, it } from 'vitest';
import { createVllmAdapter, parseVllmMetrics } from './vllm.js';
import type { RuntimeContext } from './types.js';

const METRICS = `
# HELP vllm:num_requests_running Number of requests currently running on GPU.
# TYPE vllm:num_requests_running gauge
vllm:num_requests_running{model_name="meta-llama/Llama-3.1-8B"} 2.0
vllm:num_requests_waiting{model_name="meta-llama/Llama-3.1-8B"} 5.0
vllm:kv_cache_usage_perc{model_name="meta-llama/Llama-3.1-8B"} 0.734
`;

function ctxWith(opts: { models?: unknown; metrics?: string }): RuntimeContext {
  return {
    fetch: (async (url: string) => {
      const u = String(url);
      if (u.includes('/metrics')) {
        return opts.metrics
          ? ({ ok: true, status: 200, text: async () => opts.metrics } as unknown as Response)
          : ({ ok: false, status: 404, text: async () => '' } as unknown as Response);
      }
      if (u.includes('/models') && opts.models) {
        return { ok: true, status: 200, json: async () => opts.models } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch,
    run: async () => null,
  };
}

describe('parseVllmMetrics', () => {
  it('pulls the three numbers that matter out of Prometheus text', () => {
    const m = parseVllmMetrics(METRICS);
    expect(m.requestsRunning).toBe(2);
    expect(m.requestsWaiting).toBe(5);
    expect(m.kvCacheUsagePct).toBeCloseTo(73.4, 1);
  });

  it('ignores HELP and TYPE lines and survives an empty body', () => {
    expect(parseVllmMetrics('')).toEqual({});
    expect(parseVllmMetrics('# HELP vllm:num_requests_running some help')).toEqual({});
  });

  it('reads an unlabelled metric line too', () => {
    expect(parseVllmMetrics('vllm:num_requests_waiting 3').requestsWaiting).toBe(3);
  });
});

describe('vllm adapter', () => {
  it('has no start method at all, which is the contract', () => {
    // The UI reads capabilities, but an absent method makes it impossible to
    // start vLLM even by mistake.
    expect(createVllmAdapter(ctxWith({})).start).toBeUndefined();
    expect(createVllmAdapter(ctxWith({})).load).toBeUndefined();
    expect(createVllmAdapter(ctxWith({})).unload).toBeUndefined();
  });

  it('treats every served model as resident, because vLLM serves what it launched with', async () => {
    const a = createVllmAdapter(ctxWith({ models: { data: [{ id: 'meta-llama/Llama-3.1-8B' }] }, metrics: METRICS }));
    const status = await a.status('http://localhost:8000/v1');
    expect(status.running).toBe(true);
    expect(status.resident).toEqual([{ id: 'meta-llama/Llama-3.1-8B' }]);
    expect(status.metrics?.kvCacheUsagePct).toBeCloseTo(73.4, 1);
  });

  it('tolerates metrics being switched off', async () => {
    const a = createVllmAdapter(ctxWith({ models: { data: [{ id: 'x' }] } }));
    const status = await a.status('http://localhost:8000/v1');
    expect(status.running).toBe(true);
    expect(status.metrics).toBeUndefined();
  });

  it('explains that vLLM is managed outside the app', async () => {
    const d = await createVllmAdapter(ctxWith({})).detect('http://localhost:8000/v1');
    expect(d.running).toBe(false);
    expect(d.installed).toBe(false);
    expect(d.reason).toContain('one model per process');
  });

  it('reports no geometry rather than guessing, so the planner says unknown', async () => {
    const a = createVllmAdapter(ctxWith({ models: { data: [{ id: 'x', max_model_len: 8192 }] } }));
    const [facts] = await a.listModels('http://localhost:8000/v1');
    expect(facts.maxContext).toBe(8192);
    expect(facts.layers).toBeUndefined();
    expect(facts.weightsBytes).toBeUndefined();
  });
});
