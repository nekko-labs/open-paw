import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import type { ToolSpec } from '@open-paw/core';
import type { McpServerConfig, McpServerStatus, ToolResult, ToolCall } from '@open-paw/shared';

/**
 * Minimal MCP stdio client — hand-rolled JSON-RPC 2.0 over newline-delimited
 * stdio (the MCP stdio transport), so we add no dependency. One McpServer wraps
 * one spawned server process: handshake, list tools, call tools.
 */
class McpServer {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  tools: Array<{ name: string; description?: string; inputSchema?: any }> = [];
  connected = false;
  error: string | undefined;

  async start(config: McpServerConfig): Promise<void> {
    this.proc = spawn(config.command, config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      // npx and friends are .cmd shims on Windows → need a shell to resolve them.
      shell: process.platform === 'win32',
    }) as ChildProcessWithoutNullStreams;
    this.proc.stdout.on('data', (d) => this.onData(d));
    this.proc.stderr.on('data', () => {/* server logs — ignore */});
    this.proc.on('error', (e) => { this.error = e.message; this.connected = false; });
    this.proc.on('exit', () => { this.connected = false; });

    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'open-paw', version: '1' },
    });
    this.notify('notifications/initialized');
    const res = await this.request('tools/list', {});
    this.tools = res?.tools ?? [];
    this.connected = true;
  }

  private onData(d: Buffer): void {
    this.buffer += d.toString();
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          msg.error ? reject(new Error(msg.error.message ?? 'MCP error')) : resolve(msg.result);
        }
      } catch {
        /* partial/non-JSON line */
      }
    }
  }

  private request(method: string, params: unknown): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: '2.0', id, method, params });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP ${method} timed out`));
        }
      }, 20000);
    });
  }

  private notify(method: string, params?: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  private send(obj: unknown): void {
    try {
      this.proc?.stdin.write(JSON.stringify(obj) + '\n');
    } catch (e) {
      this.error = (e as Error).message;
    }
  }

  callTool(name: string, args: Record<string, unknown>): Promise<any> {
    return this.request('tools/call', { name, arguments: args ?? {} });
  }

  stop(): void {
    try { this.proc?.kill(); } catch { /* already gone */ }
    this.connected = false;
  }
}

const servers = new Map<string, McpServer>();

/** Reconcile running servers with the configured+enabled set (idempotent). */
export async function syncMcp(configs: McpServerConfig[]): Promise<void> {
  const want = new Map(configs.filter((c) => c.enabled).map((c) => [c.id, c]));
  // Stop servers no longer wanted.
  for (const [id, srv] of servers) {
    if (!want.has(id)) { srv.stop(); servers.delete(id); }
  }
  // Start newly-enabled servers.
  await Promise.all(
    [...want.values()]
      .filter((c) => !servers.has(c.id))
      .map(async (c) => {
        const srv = new McpServer();
        servers.set(c.id, srv);
        try {
          await srv.start(c);
        } catch (e) {
          srv.error = (e as Error).message;
        }
      }),
  );
}

/** Agent tool specs for every connected MCP tool, namespaced `mcp__<id>__<tool>`. */
export function mcpToolSpecs(): ToolSpec[] {
  const out: ToolSpec[] = [];
  for (const [id, srv] of servers) {
    for (const t of srv.tools) {
      out.push({
        name: `mcp__${id}__${t.name}`,
        description: t.description ? `(MCP) ${t.description}` : `(MCP) ${t.name}`,
        parameters: t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : { type: 'object', properties: {} },
      });
    }
  }
  return out;
}

export function isMcpTool(name: string): boolean {
  return name.startsWith('mcp__');
}

/** Route an `mcp__<id>__<tool>` call to the right server. */
export async function callMcpTool(call: ToolCall): Promise<ToolResult> {
  const parts = call.name.split('__');
  const id = parts[1];
  const tool = parts.slice(2).join('__');
  const srv = servers.get(id);
  if (!srv || !srv.connected) {
    return { toolCallId: call.id, output: `MCP server "${id}" is not connected.`, isError: true };
  }
  try {
    const res = await srv.callTool(tool, call.input as Record<string, unknown>);
    const text = Array.isArray(res?.content)
      ? res.content.map((c: any) => c?.text ?? JSON.stringify(c)).join('\n')
      : JSON.stringify(res);
    return { toolCallId: call.id, output: text || '(no output)', isError: !!res?.isError };
  } catch (e) {
    return { toolCallId: call.id, output: `MCP call failed: ${(e as Error).message}`, isError: true };
  }
}

/** Connection status for the UI. */
export function mcpStatus(configs: McpServerConfig[]): McpServerStatus[] {
  return configs.map((c) => {
    const srv = servers.get(c.id);
    return {
      id: c.id,
      name: c.name,
      connected: !!srv?.connected,
      tools: (srv?.tools ?? []).map((t) => ({ name: t.name, description: t.description })),
      error: srv?.error,
    };
  });
}
