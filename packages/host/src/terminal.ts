import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';
import type { TerminalInfo, TerminalBlock, TerminalEvent, TerminalSnapshot } from '@open-paw/shared';
import { getSettings } from './store.js';

/**
 * Terminal sessions are persistent shells the user runs commands in, rendered as
 * Warp-style command blocks. We deliberately avoid a native PTY (the project
 * bans native modules — no node-pty); instead one long-lived shell process per
 * terminal keeps cwd/env across commands, and a per-command marker echo delimits
 * each block and carries its exit code. Terminals live in memory only.
 */

type Sender = (e: TerminalEvent) => void;

const MAX_BLOCKS = 60;
const MAX_BLOCK_OUTPUT = 100_000;

interface TermState {
  info: TerminalInfo;
  proc: ChildProcessWithoutNullStreams;
  /** Unique-per-terminal sentinel the shell echoes after each command. */
  marker: string;
  blocks: TerminalBlock[];
  /** Commands waiting to run (one block executes at a time). */
  queue: string[];
  active: TerminalBlock | null;
  /** stdout carry-over, so a marker split across chunks is still detected. */
  buf: string;
  send: Sender;
}

const terms = new Map<string, TermState>();
let senders: Sender[] = [];

/** Register the host event sink that fans terminal events out to renderers. */
export function setTerminalSender(send: Sender): void {
  if (!senders.includes(send)) senders.push(send);
}
const emit: Sender = (e) => senders.forEach((s) => s(e));

function defaultShell(): { shell: string; args: string[] } {
  if (process.platform === 'win32') {
    return { shell: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'] };
  }
  const shell = process.env.SHELL && existsSync(process.env.SHELL) ? process.env.SHELL : '/bin/bash';
  return { shell, args: [] };
}

function resolveCwd(workspaceId?: string, cwd?: string): string {
  if (cwd && existsSync(cwd)) return cwd;
  if (workspaceId) {
    const w = getSettings().workspaces.find((x) => x.id === workspaceId);
    if (w && existsSync(w.path)) return w.path;
  }
  const first = getSettings().workspaces[0]?.path;
  return first && existsSync(first) ? first : process.cwd();
}

export function listTerminals(): TerminalInfo[] {
  return [...terms.values()].map((t) => t.info).sort((a, b) => a.createdAt - b.createdAt);
}

export function terminalSnapshot(id: string): TerminalSnapshot | null {
  const t = terms.get(id);
  return t ? { info: t.info, blocks: t.blocks } : null;
}

export function createTerminal(opts?: { workspaceId?: string; cwd?: string; title?: string }): TerminalInfo {
  const id = `term_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  const cwd = resolveCwd(opts?.workspaceId, opts?.cwd);
  const { shell, args } = defaultShell();
  const proc = spawn(shell, args, {
    cwd,
    env: { ...process.env, TERM: 'dumb', GIT_PAGER: 'cat', PAGER: 'cat' },
    windowsHide: true,
  });
  const info: TerminalInfo = {
    id,
    title: opts?.title || 'Terminal',
    workspaceId: opts?.workspaceId,
    cwd,
    shell,
    createdAt: Date.now(),
    running: true,
  };
  const state: TermState = {
    info,
    proc,
    marker: `__OPAW_${id}__`,
    blocks: [],
    queue: [],
    active: null,
    buf: '',
    send: emit,
  };
  terms.set(id, state);

  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  proc.stdout.on('data', (chunk: string) => onStdout(state, chunk));
  proc.stderr.on('data', (chunk: string) => {
    if (state.active) appendOutput(state, state.active, chunk, 'err');
  });
  proc.on('exit', (code) => {
    info.running = false;
    info.exitCode = code ?? undefined;
    if (state.active) finishBlock(state, code ?? -1);
    emit({ type: 'exit', terminalId: id, code });
  });
  proc.on('error', (err) => {
    info.running = false;
    emit({ type: 'exit', terminalId: id, code: -1 });
    // Surface the spawn failure as a synthetic block so the user sees why.
    const blk: TerminalBlock = { id: `blk_${Date.now().toString(36)}`, command: '', output: String(err), startedAt: Date.now(), endedAt: Date.now(), exitCode: -1 };
    state.blocks.push(blk);
  });

  return info;
}

/** Queue a command to run as its own block; drains FIFO. */
export function runInTerminal(id: string, command: string): void {
  const t = terms.get(id);
  if (!t || !t.info.running) return;
  t.queue.push(command);
  if (!t.active) drain(t);
}

function drain(t: TermState): void {
  if (t.active || t.queue.length === 0) return;
  const command = t.queue.shift()!;
  const block: TerminalBlock = {
    id: `blk_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    command,
    output: '',
    startedAt: Date.now(),
  };
  t.active = block;
  t.blocks.push(block);
  if (t.blocks.length > MAX_BLOCKS) t.blocks.splice(0, t.blocks.length - MAX_BLOCKS);
  emit({ type: 'block_start', terminalId: t.info.id, blockId: block.id, command });

  // Write the command, then echo the marker + exit code on its own line so we
  // can delimit the block and capture the status. A leading newline guarantees
  // the marker isn't glued onto a command's trailing partial line.
  const nl = '\n';
  if (process.platform === 'win32') {
    // $LASTEXITCODE only tracks native executables; capture $? first (it reflects
    // cmdlet/parse failures too) so a failed PowerShell command reports non-zero.
    t.proc.stdin.write(`${command}${nl}`);
    t.proc.stdin.write(`$ok=$?; $c=$LASTEXITCODE; if(-not $ok){if($null -eq $c){$c=1}}; Write-Output "\`n${t.marker} $c"${nl}`);
  } else {
    t.proc.stdin.write(`${command}${nl}`);
    t.proc.stdin.write(`printf '\\n%s %s\\n' '${t.marker}' "$?"${nl}`);
  }
}

function onStdout(t: TermState, chunk: string): void {
  t.buf += chunk;
  // Process all complete markers currently in the buffer.
  for (;;) {
    const idx = t.buf.indexOf(t.marker);
    if (idx === -1) break;
    // Output preceding the marker belongs to the active block.
    const pre = t.buf.slice(0, idx);
    if (t.active && pre) appendOutput(t, t.active, pre, 'out');
    // Read the exit code that follows the marker, up to the next newline.
    const rest = t.buf.slice(idx + t.marker.length);
    const nlAt = rest.indexOf('\n');
    if (nlAt === -1) {
      // Exit code line not fully arrived yet; stash and wait.
      t.buf = t.buf.slice(idx);
      return;
    }
    const code = parseInt(rest.slice(0, nlAt).trim(), 10);
    t.buf = rest.slice(nlAt + 1);
    finishBlock(t, Number.isFinite(code) ? code : 0);
  }
  // Emit everything except a tail that might be the start of a marker.
  const hold = t.marker.length - 1;
  if (t.buf.length > hold) {
    const flush = t.buf.slice(0, t.buf.length - hold);
    t.buf = t.buf.slice(t.buf.length - hold);
    if (t.active && flush) appendOutput(t, t.active, flush, 'out');
  }
}

function appendOutput(t: TermState, block: TerminalBlock, chunk: string, stream: 'out' | 'err'): void {
  block.output = (block.output + chunk).slice(-MAX_BLOCK_OUTPUT);
  emit({ type: 'data', terminalId: t.info.id, blockId: block.id, stream, chunk });
}

function finishBlock(t: TermState, exitCode: number): void {
  const block = t.active;
  if (!block) return;
  block.exitCode = exitCode;
  block.endedAt = Date.now();
  t.active = null;
  emit({ type: 'block_end', terminalId: t.info.id, blockId: block.id, exitCode });
  drain(t);
}

export function signalTerminal(id: string, _signal: 'interrupt'): void {
  const t = terms.get(id);
  if (!t || !t.info.running) return;
  // No PTY → no real SIGINT delivery. Best-effort: send an ETX so shells/REPLs
  // that read it from stdin abort the current line.
  try {
    t.proc.stdin.write('\x03');
  } catch {
    /* stream closed */
  }
}

export function closeTerminal(id: string): void {
  const t = terms.get(id);
  if (!t) return;
  try {
    t.proc.kill();
  } catch {
    /* already gone */
  }
  terms.delete(id);
}

/** Kill every shell (called on host teardown). */
export function closeAllTerminals(): void {
  for (const id of [...terms.keys()]) closeTerminal(id);
}
