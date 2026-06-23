import { getClient, resolveModel, runChat, type Client } from './lib.js';

/**
 * MCP stdio server exposing Open Paw to other tools (Claude Code, Codex, …).
 * Hand-rolled JSON-RPC 2.0 over newline-delimited stdio — the MCP stdio
 * transport. Other agents can trigger this machine's agent, make chat requests,
 * spin up sessions (swarm by calling chat across several sessions), and read
 * status, all driving the local model.
 */

const VERSION = '0.1.4';

const TOOLS = [
  {
    name: 'open_paw_chat',
    description:
      "Run an agent turn on this machine's Open Paw (reads/edits/searches/runs in the configured workspace, using the local or cloud model). Returns the assistant's reply. Omit sessionId to start a fresh session.",
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What to ask / tell the agent.' },
        sessionId: { type: 'string', description: 'Continue an existing chat (optional).' },
        workspaceId: { type: 'string', description: 'Workspace/project to scope a new chat to (optional).' },
        provider: { type: 'string', description: 'Provider id override (optional).' },
        model: { type: 'string', description: 'Model id override (optional).' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'open_paw_list_sessions',
    description: 'List chat sessions (id, title, message count, last updated).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'open_paw_new_session',
    description: 'Create a new chat session and return its id.',
    inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' } } },
  },
  {
    name: 'open_paw_get_session',
    description: 'Get a session transcript (user/assistant messages).',
    inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] },
  },
  {
    name: 'open_paw_status',
    description: 'Summary of this Open Paw: providers, default model, workspaces, session count, remote relay status.',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function callTool(client: Client, name: string, args: Record<string, any>): Promise<string> {
  switch (name) {
    case 'open_paw_chat': {
      let sessionId = args.sessionId as string | undefined;
      if (!sessionId) sessionId = (await client.createSession(args.workspaceId)).id;
      const session = await client.getSession(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      const settings = await client.getSettings();
      const { providerId, modelId } = resolveModel(settings, {
        provider: args.provider,
        model: args.model,
        sessionProvider: session.providerId,
        sessionModel: session.modelId,
      });
      const reply = await runChat(client, { sessionId, providerId, modelId, text: String(args.prompt ?? '') });
      return `session: ${sessionId}\n\n${reply}`;
    }
    case 'open_paw_list_sessions':
      return JSON.stringify(
        (await client.listSessions()).map((s) => ({ id: s.id, title: s.title, messages: s.messages.length, updatedAt: s.updatedAt })),
        null,
        2,
      );
    case 'open_paw_new_session':
      return `Created session ${(await client.createSession(args.workspaceId)).id}`;
    case 'open_paw_get_session': {
      const s = await client.getSession(String(args.sessionId));
      if (!s) throw new Error('Session not found');
      return s.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => `## ${m.role}\n${m.content}`)
        .join('\n\n');
    }
    case 'open_paw_status': {
      const [s, sessions, remote] = await Promise.all([client.getSettings(), client.listSessions(), client.remoteStatus()]);
      return JSON.stringify(
        {
          providers: s.providers.map((p) => ({ id: p.id, label: p.label, kind: p.kind })),
          defaultModel: s.defaultModelId ?? null,
          workspaces: s.workspaces.map((w) => ({ id: w.id, name: w.name, path: w.path })),
          sessions: sessions.length,
          remote,
        },
        null,
        2,
      );
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function runMcpServer(opts: { url?: string; token?: string } = {}): void {
  // Protect the stdout protocol stream: route any stray logs to stderr.
  console.log = (...a: unknown[]) => console.error(...a);
  const client = getClient(opts);
  let buffer = '';

  const send = (msg: unknown) => process.stdout.write(JSON.stringify(msg) + '\n');
  const ok = (id: unknown, result: unknown) => send({ jsonrpc: '2.0', id, result });
  const err = (id: unknown, message: string) => send({ jsonrpc: '2.0', id, error: { code: -32000, message } });

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      handle(msg);
    }
  });

  async function handle(msg: any) {
    const { id, method, params } = msg;
    if (method === 'initialize') {
      ok(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'open-paw', version: VERSION } });
    } else if (method === 'notifications/initialized' || method?.startsWith('notifications/')) {
      /* notifications: no response */
    } else if (method === 'ping') {
      ok(id, {});
    } else if (method === 'tools/list') {
      ok(id, { tools: TOOLS });
    } else if (method === 'tools/call') {
      try {
        const text = await callTool(client, params?.name, params?.arguments ?? {});
        ok(id, { content: [{ type: 'text', text }] });
      } catch (e) {
        ok(id, { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true });
      }
    } else if (id !== undefined) {
      err(id, `Unknown method: ${method}`);
    }
  }

  console.error('[open-paw] MCP server ready on stdio');
}
