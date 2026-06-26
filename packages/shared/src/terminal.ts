/** Terminal session types — Warp-style command blocks over a persistent shell. */

/** A persistent shell session the user can run commands in. */
export interface TerminalInfo {
  id: string;
  title: string;
  /** Project this terminal belongs to (groups it in the workbench sidebar). */
  workspaceId?: string;
  /** Working directory the shell started in. */
  cwd: string;
  /** Shell binary (e.g. powershell.exe, /bin/bash). */
  shell: string;
  createdAt: number;
  /** False once the shell process has exited. */
  running: boolean;
  exitCode?: number;
}

/**
 * One command-and-output unit (a "block", à la Warp). The renderer assembles
 * these from the stream of {@link TerminalEvent}s; the host also retains the
 * most recent blocks so a reattaching renderer can restore scrollback.
 */
export interface TerminalBlock {
  id: string;
  command: string;
  /** Interleaved stdout/stderr text as it streamed. */
  output: string;
  /** Process exit code for the command (undefined while still running). */
  exitCode?: number;
  startedAt: number;
  endedAt?: number;
}

/** Snapshot returned when a renderer (re)attaches to a terminal. */
export interface TerminalSnapshot {
  info: TerminalInfo;
  blocks: TerminalBlock[];
}

/** Streaming events emitted by a terminal, mirrored to every renderer. */
export type TerminalEvent =
  | { type: 'block_start'; terminalId: string; blockId: string; command: string }
  | { type: 'data'; terminalId: string; blockId: string; stream: 'out' | 'err'; chunk: string }
  | { type: 'block_end'; terminalId: string; blockId: string; exitCode: number }
  | { type: 'exit'; terminalId: string; code: number | null };
