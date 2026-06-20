import type { ModelInfo, ProviderConfig, ToolCall } from '@open-paw/shared';
import type { Provider, ChatRequest, ProviderChunk } from './types.js';

/**
 * Native Ollama client. Ollama also exposes an OpenAI-compatible endpoint, but
 * its native API gives us model management (list/pull/ps/load) which powers the
 * Models page. Streaming uses newline-delimited JSON, not SSE.
 */
export class OllamaProvider implements Provider {
  constructor(public readonly config: ProviderConfig) {}

  private base() {
    // Strip a trailing /v1 if a user pasted the OpenAI-compat URL.
    return this.config.baseUrl.replace(/\/v1\/?$/, '');
  }

  async listModels(): Promise<ModelInfo[]> {
    const [tags, ps] = await Promise.all([
      fetch(`${this.base()}/api/tags`).then((r) => r.json() as Promise<any>).catch(() => ({ models: [] as any[] })),
      fetch(`${this.base()}/api/ps`).then((r) => r.json() as Promise<any>).catch(() => ({ models: [] as any[] })),
    ]);
    const loaded = new Set<string>((ps.models ?? []).map((m: any) => m.name));
    return (tags.models ?? []).map((m: any) => ({
      id: m.name,
      providerId: this.config.id,
      name: m.name,
      loaded: loaded.has(m.name),
      sizeBytes: m.size,
      details: m.details ? { family: m.details.family, quant: m.details.quantization_level } : undefined,
    }));
  }

  async test(): Promise<{ ok: boolean; message: string }> {
    try {
      const r = await fetch(`${this.base()}/api/tags`);
      return r.ok ? { ok: true, message: 'Connected' } : { ok: false, message: `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }

  /** Pull a model, streaming progress lines (consumed by the caller's log). */
  async pull(model: string, onProgress?: (status: string) => void): Promise<void> {
    const res = await fetch(`${this.base()}/api/pull`, {
      method: 'POST',
      body: JSON.stringify({ name: model, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`pull ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) {
          try {
            onProgress?.(JSON.parse(line).status ?? '');
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  /** Load (or unload, with keep_alive 0) a model into memory. */
  async setLoaded(model: string, loaded: boolean): Promise<void> {
    await fetch(`${this.base()}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({ model, keep_alive: loaded ? '30m' : 0, prompt: '' }),
    });
  }

  async *chat(req: ChatRequest): AsyncIterable<ProviderChunk> {
    const body = {
      model: req.model,
      stream: true,
      options: { temperature: req.temperature ?? 0.7 },
      messages: this.toOllamaMessages(req),
      tools: req.tools?.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
    };
    const res = await fetch(`${this.base()}/api/chat`, {
      method: 'POST',
      body: JSON.stringify(body),
      signal: req.signal,
    });
    if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.message?.content) yield { type: 'text', delta: msg.message.content };
        if (msg.message?.tool_calls) {
          for (const tc of msg.message.tool_calls) {
            const call: ToolCall = {
              id: `call_${Math.abs(hash(JSON.stringify(tc)))}`,
              name: tc.function?.name ?? '',
              input: tc.function?.arguments ?? {},
            };
            yield { type: 'tool_call', call };
          }
        }
        if (msg.done) {
          yield {
            type: 'usage',
            inputTokens: msg.prompt_eval_count ?? 0,
            outputTokens: msg.eval_count ?? 0,
          };
          yield { type: 'done' };
          return;
        }
      }
    }
    yield { type: 'done' };
  }

  private toOllamaMessages(req: ChatRequest) {
    const out: any[] = [];
    if (req.system) out.push({ role: 'system', content: req.system });
    for (const m of req.messages) {
      if (m.role === 'tool' && m.toolResult) {
        out.push({ role: 'tool', content: m.toolResult.output });
      } else if (m.role === 'assistant' && m.toolCalls?.length) {
        out.push({
          role: 'assistant',
          content: m.content,
          tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.input } })),
        });
      } else {
        out.push({ role: m.role, content: m.content });
      }
    }
    return out;
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
