#!/usr/bin/env node
import { getClient, resolveModel, runChat, dataDir } from './lib.js';
import { runMcpServer } from './mcp.js';

const VERSION = '0.1.4';

function parseFlags(argv: string[]): { _: string[]; flags: Record<string, string | boolean> } {
  const _: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else _.push(a);
  }
  return { _, flags };
}

const HELP = `Open Paw CLI (opaw ${VERSION}) — drive your local agent from the terminal.

Usage:
  opaw status [--json]              Show providers, model, workspaces, sessions
  opaw sessions [--json]            List chat sessions
  opaw chat "<prompt>" [opts]       Run an agent turn (streams the reply)
  opaw mcp                          Start the MCP server (stdio) for other tools
  opaw --help | --version

Target (any command):
  --url <http://host:port>          Talk to a running server (else OPENPAW_URL,
                                    else the local data dir)
  --token <token>                   Bearer token for a secured server (OPENPAW_TOKEN)

chat options:
  --session <id>     Continue an existing session (default: newest, or new)
  --new              Force a new session
  --workspace <id>   Scope a new session to a workspace
  --provider <id>    Provider override
  --model <id>       Model override

Local data dir: ${dataDir()}  (override with OPENPAW_DATA_DIR)`;

async function main() {
  const { _, flags } = parseFlags(process.argv.slice(2));
  const cmd = _[0];

  if (flags.version || cmd === 'version') return void console.log(VERSION);
  if (!cmd || flags.help || cmd === 'help') return void console.log(HELP);

  if (cmd === 'mcp') return runMcpServer({ url: flags.url as string, token: flags.token as string });

  const json = !!flags.json;
  const client = getClient({ url: flags.url as string, token: flags.token as string });

  if (cmd === 'status') {
    const [s, sessions, remote] = await Promise.all([client.getSettings(), client.listSessions(), client.remoteStatus()]);
    if (json) {
      console.log(JSON.stringify({
        providers: s.providers.map((p) => ({ id: p.id, label: p.label, kind: p.kind })),
        defaultModel: s.defaultModelId ?? null,
        workspaces: s.workspaces.map((w) => ({ id: w.id, name: w.name })),
        sessions: sessions.length,
        remote,
      }, null, 2));
      return;
    }
    console.log(`Open Paw — ${flags.url || process.env.OPENPAW_URL || dataDir()}`);
    console.log(`Providers: ${s.providers.map((p) => `${p.label} (${p.id})`).join(', ') || 'none'}`);
    console.log(`Default model: ${s.defaultModelId ?? '—'}`);
    console.log(`Workspaces: ${s.workspaces.map((w) => w.name).join(', ') || 'none'}`);
    console.log(`Sessions: ${sessions.length}`);
    console.log(`Remote relay: ${remote.enabled ? 'enabled' : 'off'}`);
    return;
  }

  if (cmd === 'sessions') {
    const list = await client.listSessions();
    if (json) return void console.log(JSON.stringify(list.map((s) => ({ id: s.id, title: s.title, messages: s.messages.length, updatedAt: s.updatedAt })), null, 2));
    if (!list.length) return void console.log('No sessions yet.');
    for (const s of list) {
      console.log(`${s.id}  ${new Date(s.updatedAt).toISOString().slice(0, 16).replace('T', ' ')}  ${s.messages.length}msg  ${s.title}`);
    }
    return;
  }

  if (cmd === 'chat') {
    const text = _[1];
    if (!text) throw new Error('Usage: opaw chat "<prompt>"');
    let sessionId = flags.session as string | undefined;
    if (!sessionId && !flags.new) sessionId = (await client.listSessions())[0]?.id;
    if (!sessionId) sessionId = (await client.createSession(flags.workspace as string | undefined)).id;
    const session = await client.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    const settings = await client.getSettings();
    const { providerId, modelId } = resolveModel(settings, {
      provider: flags.provider as string,
      model: flags.model as string,
      sessionProvider: session.providerId,
      sessionModel: session.modelId,
    });
    process.stderr.write(`· session ${sessionId} · ${modelId}\n`);
    await runChat(client, { sessionId, providerId, modelId, text, onText: (t) => process.stdout.write(t) });
    process.stdout.write('\n');
    return;
  }

  console.error(`Unknown command: ${cmd}\n`);
  console.log(HELP);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
});
