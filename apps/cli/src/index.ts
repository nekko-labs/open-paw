#!/usr/bin/env node
import { getHost, resolveModel, runChat, dataDir } from './lib.js';
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
  opaw status                       Show providers, model, workspaces, sessions
  opaw sessions                     List chat sessions
  opaw chat "<prompt>" [opts]       Run an agent turn (streams the reply)
  opaw mcp                          Start the MCP server (stdio) for other tools
  opaw --help | --version

chat options:
  --session <id>     Continue an existing session (default: newest, or new)
  --new              Force a new session
  --workspace <id>   Scope a new session to a workspace
  --provider <id>    Provider override
  --model <id>       Model override

Data dir: ${dataDir()}  (override with OPENPAW_DATA_DIR)`;

async function main() {
  const { _, flags } = parseFlags(process.argv.slice(2));
  const cmd = _[0];

  if (flags.version || cmd === 'version') return void console.log(VERSION);
  if (!cmd || flags.help || cmd === 'help') return void console.log(HELP);

  if (cmd === 'mcp') return runMcpServer();

  const h = getHost();

  if (cmd === 'status') {
    const s = h.getSettings();
    console.log(`Open Paw — ${dataDir()}`);
    console.log(`Providers: ${s.providers.map((p) => `${p.label} (${p.id})`).join(', ') || 'none'}`);
    console.log(`Default model: ${s.defaultModelId ?? '—'}`);
    console.log(`Workspaces: ${s.workspaces.map((w) => w.name).join(', ') || 'none'}`);
    console.log(`Sessions: ${h.listSessions().length}`);
    const r = h.remoteStatus();
    console.log(`Remote relay: ${r.enabled ? 'enabled' : 'off'}`);
    return;
  }

  if (cmd === 'sessions') {
    const list = h.listSessions();
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
    if (flags.new || !sessionId) {
      if (!sessionId) sessionId = flags.new ? undefined : h.listSessions()[0]?.id;
      if (!sessionId) sessionId = h.createSession(flags.workspace as string | undefined).id;
    }
    const session = h.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    const { providerId, modelId } = resolveModel(h, {
      provider: flags.provider as string,
      model: flags.model as string,
      sessionProvider: session.providerId,
      sessionModel: session.modelId,
    });
    process.stderr.write(`· session ${sessionId} · ${modelId}\n`);
    await runChat(h, { sessionId, providerId, modelId, text, onText: (t) => process.stdout.write(t) });
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
