import React, { useEffect, useRef, useState } from 'react';
import type { TerminalBlock, TerminalEvent, TerminalInfo } from '@open-paw/shared';
import { SendIcon } from '../icons.js';

/**
 * Warp-style terminal: each command and its output is a self-contained "block"
 * with a status dot and exit code. Backed by a persistent host shell (cwd/env
 * survive across commands); no PTY, so this is line/command oriented rather than
 * a full TTY — which keeps it dependency-free and cross-platform.
 */
export function TerminalPane({ terminalId }: { terminalId: string }) {
  const [info, setInfo] = useState<TerminalInfo | null>(null);
  const [blocks, setBlocks] = useState<TerminalBlock[]>([]);
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initial snapshot (restores scrollback when reattaching a tab).
  useEffect(() => {
    window.nekko.terminalSnapshot(terminalId).then((snap) => {
      if (snap) { setInfo(snap.info); setBlocks(snap.blocks.map((b) => ({ ...b }))); }
    }).catch(() => {});
  }, [terminalId]);

  // Live stream: mutate blocks as events arrive.
  useEffect(() => {
    const off = window.nekko.onTerminalEvent((e: TerminalEvent) => {
      if (!('terminalId' in e) || e.terminalId !== terminalId) return;
      setBlocks((prev) => {
        switch (e.type) {
          case 'block_start':
            return [...prev, { id: e.blockId, command: e.command, output: '', startedAt: Date.now() }];
          case 'data':
            return prev.map((b) => (b.id === e.blockId ? { ...b, output: b.output + e.chunk } : b));
          case 'block_end':
            return prev.map((b) => (b.id === e.blockId ? { ...b, exitCode: e.exitCode, endedAt: Date.now() } : b));
          default:
            return prev;
        }
      });
      if (e.type === 'exit') setInfo((i) => (i ? { ...i, running: false, exitCode: e.code ?? undefined } : i));
    });
    return off;
  }, [terminalId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [blocks]);

  const run = () => {
    const cmd = draft.trim();
    if (!cmd) return;
    window.nekko.runInTerminal(terminalId, cmd);
    setHistory((h) => [...h, cmd]);
    setHistIdx(-1);
    setDraft('');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); run(); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1);
      if (history[idx] !== undefined) { setHistIdx(idx); setDraft(history[idx]); }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx === -1) return;
      const idx = histIdx + 1;
      if (idx >= history.length) { setHistIdx(-1); setDraft(''); }
      else { setHistIdx(idx); setDraft(history[idx]); }
    } else if (e.key === 'c' && e.ctrlKey) {
      window.nekko.signalTerminal(terminalId, 'interrupt');
    }
  };

  const running = blocks.some((b) => b.exitCode === undefined);

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ background: 'var(--surface-2)' }} onClick={() => inputRef.current?.focus()}>
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[11px] text-ink-faint">
        <span className="truncate font-mono">{info?.cwd ?? ''}</span>
        <span className="flex items-center gap-2">
          {running && <span className="flex items-center gap-1 text-accent"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> running</span>}
          {info && !info.running && <span className="text-red-400">shell exited</span>}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[12.5px] leading-relaxed">
        {blocks.length === 0 && (
          <p className="text-ink-faint">Type a command below and press Enter. Working directory and environment persist across commands.</p>
        )}
        {blocks.map((b) => <Block key={b.id} block={b} />)}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-3 py-2">
        <span className="font-mono text-[13px] text-accent">❯</span>
        <input
          ref={inputRef}
          className="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none"
          placeholder={info?.running === false ? 'Shell exited — close and open a new terminal.' : 'Run a command…'}
          value={draft}
          spellCheck={false}
          autoComplete="off"
          disabled={info?.running === false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
        />
        <button className="btn btn-ghost px-2 py-1" onClick={run} title="Run (Enter)"><SendIcon /></button>
      </div>
    </div>
  );
}

function Block({ block }: { block: TerminalBlock }) {
  const pending = block.exitCode === undefined;
  const dot = pending ? 'var(--accent)' : block.exitCode === 0 ? '#4ec98a' : '#e0574a';
  const dur = block.endedAt ? `${((block.endedAt - block.startedAt) / 1000).toFixed(1)}s` : '';
  return (
    <div className="mb-2.5">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${pending ? 'animate-pulse' : ''}`} style={{ background: dot }} />
        <span className="min-w-0 flex-1 truncate text-ink">{block.command || <span className="text-ink-faint italic">shell</span>}</span>
        {!pending && (
          <span className="shrink-0 text-[10.5px] text-ink-faint">
            {dur && <span className="mr-2">{dur}</span>}exit {block.exitCode}
          </span>
        )}
      </div>
      {block.output && (
        <pre className="mt-1 ml-4 max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-ink-soft">{block.output}</pre>
      )}
    </div>
  );
}
