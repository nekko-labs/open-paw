import type { ModelInfo, ProviderConfig, ToolCall } from '@open-paw/shared';
import type { Provider, ChatRequest, ProviderChunk } from './types.js';
import { parseSSE } from './sse.js';

/** Known Claude models surfaced when the /models endpoint isn't used. */
const CLAUDE_MODELS: Array<{ id: string; name: string; ctx: number }> = [
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', ctx: 200000 },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', ctx: 200000 },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', ctx: 200000 },
];

/** Client for the Anthropic Messages API (native, with SSE streaming). */
export class AnthropicProvider implements Provider {
  constructor(public readonly config: ProviderConfig) {}

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey ?? '',
      'anthropic-version': '2023-06-01',
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    return CLAUDE_MODELS.map((m) => ({
      id: m.id,
      providerId: this.config.id,
      name: m.name,
      contextLength: m.ctx,
    }));
  }

  async test(): Promise<{ ok: boolean; message: string }> {
    if (!this.config.apiKey) return { ok: false, message: 'Missing API key' };
    return { ok: true, message: 'API key set' };
  }

  async *chat(req: ChatRequest): AsyncIterable<ProviderChunk> {
    const body = {
      model: req.model,
      max_tokens: 4096,
      stream: true,
      temperature: req.temperature ?? 0.7,
      system: req.system,
      messages: this.toAnthropicMessages(req),
      tools: req.tools?.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    };

    const res = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: req.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`anthropic ${res.status}: ${text.slice(0, 200)}`);
    }

    let curTool: { id: string; name: string; json: string } | null = null;
    let inputTokens = 0;

    for await (const data of parseSSE(res)) {
      let ev: any;
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      switch (ev.type) {
        case 'message_start':
          inputTokens = ev.message?.usage?.input_tokens ?? 0;
          break;
        case 'content_block_start':
          if (ev.content_block?.type === 'tool_use') {
            curTool = { id: ev.content_block.id, name: ev.content_block.name, json: '' };
          }
          break;
        case 'content_block_delta':
          if (ev.delta?.type === 'text_delta') {
            yield { type: 'text', delta: ev.delta.text as string };
          } else if (ev.delta?.type === 'input_json_delta' && curTool) {
            curTool.json += ev.delta.partial_json;
          }
          break;
        case 'content_block_stop':
          if (curTool) {
            const call: ToolCall = { id: curTool.id, name: curTool.name, input: safeParse(curTool.json) };
            yield { type: 'tool_call', call };
            curTool = null;
          }
          break;
        case 'message_delta':
          if (ev.usage?.output_tokens != null) {
            yield { type: 'usage', inputTokens, outputTokens: ev.usage.output_tokens };
          }
          break;
        case 'message_stop':
          yield { type: 'done' };
          return;
      }
    }
    yield { type: 'done' };
  }

  private toAnthropicMessages(req: ChatRequest) {
    const out: any[] = [];
    for (const m of req.messages) {
      if (m.role === 'tool' && m.toolResult) {
        out.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.toolResult.toolCallId, content: m.toolResult.output }],
        });
      } else if (m.role === 'assistant' && m.toolCalls?.length) {
        const content: any[] = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        for (const c of m.toolCalls) {
          content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input });
        }
        out.push({ role: 'assistant', content });
      } else if (m.role === 'user' || m.role === 'assistant') {
        out.push({ role: m.role, content: m.content });
      }
    }
    return out;
  }
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}
