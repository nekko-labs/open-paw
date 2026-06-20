import type { ModelInfo, ProviderConfig, ToolCall } from '@open-paw/shared';
import type { Provider, ChatRequest, ProviderChunk, ToolSpec } from './types.js';
import { parseSSE } from './sse.js';

/**
 * Client for any OpenAI-compatible /chat/completions endpoint. Covers OpenAI,
 * OpenRouter, LM Studio, vLLM, and generic openai-compat servers — they only
 * differ in base URL and auth header, which come from the ProviderConfig.
 */
export class OpenAICompatProvider implements Provider {
  constructor(public readonly config: ProviderConfig) {}

  /**
   * Normalized API base. LM Studio / vLLM / generic servers expose the OpenAI
   * routes under `/v1`, but users often paste just `http://host:port`. If the
   * configured URL has no path (or a bare `/`), append `/v1` so `/models` and
   * `/chat/completions` resolve. URLs that already include a path are left alone.
   */
  private base(): string {
    let url = this.config.baseUrl.trim().replace(/\/+$/, '');
    try {
      const u = new URL(url);
      if (u.pathname === '' || u.pathname === '/') url = `${url}/v1`;
    } catch {
      /* leave as-is if it isn't a parseable URL */
    }
    return url;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) h['Authorization'] = `Bearer ${this.config.apiKey}`;
    if (this.config.kind === 'openrouter') {
      h['HTTP-Referer'] = 'https://github.com/nekko-labs/open-paw';
      h['X-Title'] = 'Open Paw';
    }
    return h;
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.base()}/models`, { headers: this.headers() });
    if (!res.ok) throw new Error(`listModels ${res.status}`);
    const json = (await res.json()) as { data?: Array<{ id: string; context_length?: number }> };
    return (json.data ?? []).map((m) => ({
      id: m.id,
      providerId: this.config.id,
      name: m.id,
      contextLength: m.context_length,
    }));
  }

  async test(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(`${this.base()}/models`, { headers: this.headers() });
      return res.ok
        ? { ok: true, message: 'Connected' }
        : { ok: false, message: `HTTP ${res.status}${res.status === 401 ? ' — check your API key' : ''}` };
    } catch (e) {
      return { ok: false, message: friendlyError(e, this.base()) };
    }
  }

  async *chat(req: ChatRequest): AsyncIterable<ProviderChunk> {
    const body = {
      model: req.model,
      stream: true,
      stream_options: { include_usage: true },
      temperature: req.temperature ?? 0.7,
      messages: this.toOpenAIMessages(req),
      tools: req.tools?.map(toOpenAITool),
    };

    let res: Response;
    try {
      res = await fetch(`${this.base()}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (e) {
      throw new Error(friendlyError(e, this.base()));
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Model request failed (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
    }

    // Accumulate streamed tool-call fragments by index.
    const toolAcc = new Map<number, { id: string; name: string; args: string }>();

    for await (const data of parseSSE(res)) {
      let chunk: any;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      // Reasoning models (e.g. Gemma/DeepSeek on LM Studio) stream their chain
      // of thought as `reasoning_content` (or `reasoning`) before the answer.
      const reasoning = delta?.reasoning_content ?? delta?.reasoning;
      if (reasoning) {
        yield { type: 'reasoning', delta: reasoning as string };
      }
      if (delta?.content) {
        yield { type: 'text', delta: delta.content as string };
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const cur = toolAcc.get(idx) ?? { id: tc.id ?? `call_${idx}`, name: '', args: '' };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          toolAcc.set(idx, cur);
        }
      }
      if (chunk.usage) {
        yield {
          type: 'usage',
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
      if (choice?.finish_reason) {
        for (const acc of toolAcc.values()) {
          const call: ToolCall = {
            id: acc.id,
            name: acc.name,
            input: safeParse(acc.args),
          };
          yield { type: 'tool_call', call };
        }
        toolAcc.clear();
      }
    }
    yield { type: 'done' };
  }

  private toOpenAIMessages(req: ChatRequest) {
    const out: any[] = [];
    if (req.system) out.push({ role: 'system', content: req.system });
    for (const m of req.messages) {
      if (m.role === 'tool' && m.toolResult) {
        out.push({ role: 'tool', tool_call_id: m.toolResult.toolCallId, content: m.toolResult.output });
      } else if (m.role === 'assistant' && m.toolCalls?.length) {
        out.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.input) },
          })),
        });
      } else {
        out.push({ role: m.role, content: m.content });
      }
    }
    return out;
  }
}

function toOpenAITool(t: ToolSpec) {
  return { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } };
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

/** Turn low-level fetch failures into actionable guidance. */
export function friendlyError(e: unknown, url: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/abort/i.test(msg)) return 'Request cancelled.';
  if (/ECONNREFUSED|fetch failed|Failed to fetch|ENOTFOUND|ETIMEDOUT|network/i.test(msg)) {
    return `Can't reach the model server at ${url}. Is it running and reachable on the network?`;
  }
  return msg;
}
