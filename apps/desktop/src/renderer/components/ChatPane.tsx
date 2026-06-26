import React, { useEffect, useRef, useState } from 'react';
import type { AgentEvent, ChatMessage, Session, ToolCall, ContextBundle, IndexedFile, ModelInfo } from '@open-paw/shared';
import { estimateCostUSD } from '@open-paw/shared';
import { useStore } from '../store.js';
import { Markdown } from './Markdown.js';
import { ContextInspector } from './ContextInspector.js';
import { ChatMetrics } from './ChatMetrics.js';
import { ChatControls } from './ChatControls.js';
import { SendIcon, PanelIcon, ShieldIcon, DownloadIcon } from '../icons.js';

const LOCAL_KINDS = ['ollama', 'lmstudio', 'vllm', 'openai-compat'];

interface PendingApproval {
  call: ToolCall;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * One chat conversation, fully self-contained so several can run side by side in
 * the workbench. Provider/model are chosen per-pane (independent agents); the
 * pane subscribes to agent events filtered by its own sessionId.
 */
export function ChatPane({ sessionId, onRunningChange }: { sessionId: string; onRunningChange?: (running: boolean) => void }) {
  const { providers, settings, setMascotMood, refreshSessions, activeWorkspaceId } = useStore();

  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [liveReasoning, setLiveReasoning] = useState('');
  const [liveTools, setLiveTools] = useState<ToolCall[]>([]);
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const [ctx, setCtx] = useState<ContextBundle | null>(null);
  const [tps, setTps] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [atFiles, setAtFiles] = useState<IndexedFile[]>([]);
  const [cost, setCost] = useState(0);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const turnStart = useRef(0);

  useEffect(() => onRunningChange?.(streaming), [streaming, onRunningChange]);

  const refreshCtx = () => {
    window.nekko.previewContext(sessionId, []).then(setCtx).catch(() => setCtx(null));
  };

  // Load the session; seed provider/model from it (or the global defaults).
  useEffect(() => {
    window.nekko.getSession(sessionId).then((s) => {
      setSession(s);
      const st = useStore.getState();
      setProviderId(s?.providerId ?? st.activeProviderId ?? providers[0]?.id ?? null);
      setModelId(s?.modelId ?? st.activeModelId ?? null);
    });
    refreshCtx();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Models for this pane's provider (independent of other panes).
  useEffect(() => {
    if (!providerId) { setModels([]); return; }
    window.nekko.listModels(providerId).then((m) => {
      setModels(m);
      setModelId((cur) => (cur && m.some((x) => x.id === cur) ? cur : m[0]?.id ?? null));
    }).catch(() => setModels([]));
  }, [providerId]);

  // Per-chat estimated cost.
  useEffect(() => {
    window.nekko.getUsageSummary().then((u) => {
      const s = u.bySession[sessionId];
      setCost(s ? estimateCostUSD(session?.modelId, s.input, s.output) : 0);
    }).catch(() => setCost(0));
  }, [sessionId, session?.modelId, session?.messages.length]);

  // Stream agent events for this session only.
  useEffect(() => {
    const off = window.nekko.onAgentEvent((e: AgentEvent) => {
      if (e.sessionId !== sessionId) return;
      switch (e.type) {
        case 'text': setLiveText((t) => t + e.delta); break;
        case 'reasoning': setLiveReasoning((t) => t + e.delta); setThinking(true); break;
        case 'usage': {
          const secs = (Date.now() - turnStart.current) / 1000;
          if (secs > 0 && e.outputTokens > 0) setTps(Math.round(e.outputTokens / secs));
          break;
        }
        case 'tool_call': setLiveTools((tc) => [...tc, e.call]); break;
        case 'tool_approval_required':
          setApproval({ call: e.call, reason: e.reason, severity: e.severity });
          setMascotMood('thinking');
          break;
        case 'tool_result': setApproval(null); break;
        case 'error':
          useStore.getState().pushToast('error', e.message || 'Something went wrong.');
          endTurn();
          break;
        case 'done':
          endTurn();
          refreshCtx();
          break;
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, setMascotMood]);

  const endTurn = () => {
    setStreaming(false);
    setLiveText('');
    setLiveReasoning('');
    setLiveTools([]);
    setMascotMood('idle');
    window.nekko.getSession(sessionId).then(setSession);
    refreshSessions();
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [session?.messages.length, liveText, liveTools.length]);

  const beginTurn = () => {
    setStreaming(true);
    setLiveText('');
    setLiveReasoning('');
    setLiveTools([]);
    setThinking(false);
    turnStart.current = Date.now();
    setMascotMood('thinking');
  };

  const send = async () => {
    if (!draft.trim() || !providerId || !modelId) return;
    const text = draft;
    setDraft('');
    beginTurn();
    setSession((prev) =>
      prev ? { ...prev, messages: [...prev.messages, { id: 'tmp', role: 'user', content: text, createdAt: Date.now() }] } : prev,
    );
    await window.nekko.sendChat({ sessionId, providerId, modelId, text });
  };

  const regenerate = async () => {
    if (streaming || !providerId || !modelId || !session) return;
    const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    beginTurn();
    setSession((prev) => {
      if (!prev) return prev;
      const msgs = [...prev.messages];
      while (msgs.length && msgs[msgs.length - 1].role !== 'user') msgs.pop();
      return { ...prev, messages: msgs };
    });
    await window.nekko.sendChat({ sessionId, providerId, modelId, text: lastUser.content, regenerate: true });
  };

  const editResend = async (messageId: string, newText: string) => {
    if (!providerId || !modelId || !newText.trim()) return;
    await window.nekko.truncateSession(sessionId, messageId);
    beginTurn();
    setSession((prev) => {
      if (!prev) return prev;
      const idx = prev.messages.findIndex((m) => m.id === messageId);
      const kept = idx >= 0 ? prev.messages.slice(0, idx) : prev.messages;
      return { ...prev, messages: [...kept, { id: 'tmp', role: 'user', content: newText, createdAt: Date.now() }] };
    });
    await window.nekko.sendChat({ sessionId, providerId, modelId, text: newText });
  };

  const exportChat = () => {
    if (!session) return;
    const lines = session.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `## ${m.role === 'user' ? 'You' : 'Nekko'}\n\n${m.content}`);
    const md = `# ${session.title}\n\n${lines.join('\n\n')}\n`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(session.title || 'chat').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const approve = async (okDecision: boolean) => {
    if (!approval) return;
    await window.nekko.approveTool(sessionId, approval.call.id, okDecision);
    setApproval(null);
  };

  const hasProvider = providers.length > 0;
  const slashQuery = draft.startsWith('/') && !draft.includes('\n') ? draft.slice(1).toLowerCase() : null;
  const slashMatches =
    slashQuery !== null ? (settings?.prompts ?? []).filter((p) => p.name.toLowerCase().includes(slashQuery)) : [];

  const atQuery = (draft.match(/(?:^|\s)@([^\s@]*)$/) ?? [])[1] ?? null;
  const atMatches =
    atQuery !== null ? atFiles.filter((f) => f.relPath.toLowerCase().includes(atQuery.toLowerCase())).slice(0, 8) : [];

  useEffect(() => { setAtFiles([]); }, [session?.workspaceId]);
  useEffect(() => {
    if (atQuery !== null && session?.workspaceId && atFiles.length === 0) {
      window.nekko.listFiles(session.workspaceId).then(setAtFiles).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atQuery, session?.workspaceId]);

  const pickFile = async (f: IndexedFile) => {
    if (!session) return;
    const next = Array.from(new Set([...(session.attachedPaths ?? []), f.path]));
    await window.nekko.setSessionAttachments(session.id, next);
    setDraft((d) => d.replace(/(?:^|\s)@([^\s@]*)$/, (full) => (/^\s/.test(full) ? ' ' : '') + '@' + f.relPath + ' '));
    setSession(await window.nekko.getSession(session.id));
    refreshCtx();
    composerRef.current?.focus();
  };

  const favoriteModels = new Set(settings?.favoriteModels ?? []);
  const sortedModels = [...models].sort((a, b) => {
    const fa = favoriteModels.has(`${providerId}::${a.id}`) ? 0 : 1;
    const fb = favoriteModels.has(`${providerId}::${b.id}`) ? 0 : 1;
    return fa - fb;
  });

  const lastMsg = session?.messages[session.messages.length - 1];
  const canRegenerate = !streaming && !!session?.messages.some((m) => m.role === 'assistant') && lastMsg?.role !== 'user';
  const isCloudModel = !LOCAL_KINDS.includes(providers.find((p) => p.id === providerId)?.kind ?? '');

  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      <section className="flex min-w-0 w-full flex-1 flex-col overflow-x-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <select className="input min-w-0 flex-1 py-1 text-[12px] md:max-w-[140px]" value={providerId ?? ''} onChange={(e) => setProviderId(e.target.value)}>
              {!hasProvider && <option value="">No provider</option>}
              {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <select className="input min-w-0 flex-1 py-1 text-[12px] md:max-w-[180px]" value={modelId ?? ''} onChange={(e) => setModelId(e.target.value)}>
              {models.length === 0 && <option value="">No models</option>}
              {sortedModels.map((m) => (
                <option key={m.id} value={m.id}>{favoriteModels.has(`${providerId}::${m.id}`) ? '★ ' : ''}{m.name}</option>
              ))}
            </select>
            {session?.parentSessionId && <span className="chip shrink-0 text-[10px]">sub-agent</span>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!!session?.messages.length && (
              <button className="btn btn-ghost px-2 py-1" onClick={exportChat} title="Export chat as Markdown"><DownloadIcon /></button>
            )}
            <button className={`btn btn-ghost px-2 py-1 ${ctxOpen ? 'text-accent' : ''}`} onClick={() => setCtxOpen((o) => !o)} title="Toggle context panel"><PanelIcon /></button>
          </div>
        </header>

        <div ref={scrollRef} className="w-full flex-1 overflow-y-auto overflow-x-hidden px-4 py-5">
          <div className="mx-auto w-full max-w-3xl space-y-5">
            {!session?.messages.length && !liveText && !liveReasoning && (
              <div className="fade-in mt-12 text-center text-[13px] text-ink-faint">
                {hasProvider ? 'Ask a question or give Nekko a task to run in this project.' : 'Connect a model in Models to get started.'}
              </div>
            )}
            {session?.messages.map((m, i) => (
              <MessageBubble key={m.id + i} message={m} onResend={!streaming && m.role === 'user' && m.id !== 'tmp' ? editResend : undefined} />
            ))}
            {liveReasoning && <ReasoningBlock text={liveReasoning} live={!liveText} />}
            {liveTools.map((t) => <ToolCard key={t.id} call={t} />)}
            {liveText && <MessageBubble message={{ id: 'live', role: 'assistant', content: liveText, createdAt: 0 }} />}
            {streaming && !liveText && !liveReasoning && !liveTools.length && (
              <div className="flex items-center gap-2 text-[13px] text-ink-faint">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Nekko is thinking…
              </div>
            )}
            {canRegenerate && (
              <div className="flex justify-center pt-1">
                <button className="btn btn-outline py-1.5 text-[12px]" onClick={regenerate} title="Re-answer the last message">↻ Regenerate</button>
              </div>
            )}
          </div>
        </div>

        {approval && <ApprovalBar approval={approval} onDecide={approve} />}

        <ChatMetrics bundle={ctx} tps={tps} thinking={thinking} streaming={streaming} cost={cost} />

        <div className="border-t border-line px-4 pb-1 pt-3">
          <ChatControls session={session} isCloudModel={isCloudModel} onChange={setSession} />
        </div>

        <div className="px-4 pb-4">
          <div className="relative mx-auto flex w-full max-w-3xl items-end gap-2">
            {atQuery !== null && session?.workspaceId && (
              <div className="card absolute bottom-full left-0 z-40 mb-2 w-full max-w-md overflow-hidden p-1.5 shadow-lg">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-ink-faint">Attach a file</div>
                {atMatches.length === 0 ? (
                  <div className="px-2.5 py-1.5 text-[11px] text-ink-faint">{atFiles.length === 0 ? 'Index this folder in Projects to mention files.' : 'No matching files.'}</div>
                ) : (
                  atMatches.map((f) => (
                    <button key={f.path} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-2" onClick={() => pickFile(f)}>
                      <span className="font-mono text-[12px] text-accent">@{f.relPath}</span>
                    </button>
                  ))
                )}
              </div>
            )}
            {slashMatches.length > 0 && (
              <div className="card absolute bottom-full left-0 z-40 mb-2 w-full max-w-md overflow-hidden p-1.5 shadow-lg">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-ink-faint">Slash commands</div>
                {slashMatches.map((p) => (
                  <button key={p.id} className="flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-2" onClick={() => { setDraft(p.body); composerRef.current?.focus(); }}>
                    <span className="font-mono text-[12.5px] text-accent">/{p.name}</span>
                    <span className="truncate text-[11px] text-ink-faint">{p.body}</span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={composerRef}
              className="input max-h-40 min-h-[44px] resize-none"
              rows={1}
              placeholder={hasProvider ? 'Message Nekko…  (/ for prompts, @ to attach files)' : 'Add a model provider in Models first'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (slashMatches.length === 1) { setDraft(slashMatches[0].body); return; }
                  send();
                } else if (e.key === 'Escape' && slashMatches.length) {
                  setDraft('');
                }
              }}
              disabled={!hasProvider}
            />
            {streaming ? (
              <button className="btn btn-outline" onClick={() => window.nekko.abortChat(sessionId)}>Stop</button>
            ) : (
              <button className="btn btn-primary" onClick={send} disabled={!draft.trim() || !hasProvider}><SendIcon /></button>
            )}
          </div>
        </div>
      </section>

      {ctxOpen && (
        <div className="hidden border-l border-line lg:block" style={{ background: 'var(--paper)' }}>
          <ContextInspector sessionId={sessionId} />
        </div>
      )}
    </div>
  );
}

/** Claude-Code-style thinking box: quiet, left-accent rule, collapsible. */
function ReasoningBlock({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { if (!live) setOpen(false); }, [live]);
  return (
    <div className="fade-in thinking-box overflow-hidden">
      <button className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-ink-soft hover:text-ink" onClick={() => setOpen((o) => !o)}>
        <span className={live ? 'h-2 w-2 animate-pulse rounded-full' : 'h-2 w-2 rounded-full'} style={{ background: live ? 'var(--accent)' : 'var(--ink-faint)' }} />
        {live ? 'Thinking…' : 'Thought process'}
        <span className="ml-auto text-[10px] text-ink-faint">{open ? 'hide ▾' : 'show ▸'}</span>
      </button>
      {open && (
        <div className="max-h-60 overflow-y-auto whitespace-pre-wrap border-t border-line px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-faint">
          {text}
          {live && <span className="ml-0.5 inline-block h-3 w-1 animate-pulse align-middle" style={{ background: 'var(--accent)' }} />}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, onResend }: { message: ChatMessage; onResend?: (id: string, text: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  if (message.role === 'tool') return null;
  const isUser = message.role === 'user';
  const copy = () => {
    navigator.clipboard?.writeText(message.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); });
  };

  if (editing) {
    return (
      <div className="flex justify-end">
        <div className="w-full max-w-[85%]">
          <textarea className="input max-h-48 min-h-[60px] resize-none text-[14px]" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} />
          <div className="mt-1.5 flex justify-end gap-2">
            <button className="btn btn-ghost py-1 text-[12px]" onClick={() => { setEditing(false); setDraft(message.content); }}>Cancel</button>
            <button className="btn btn-primary py-1 text-[12px]" onClick={() => { setEditing(false); onResend?.(message.id, draft); }}>Save &amp; send</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`group fade-in flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-ai'}`}>
        {isUser ? <p className="whitespace-pre-wrap text-[14px]">{message.content}</p> : <Markdown text={message.content} />}
        {message.toolCalls?.map((c) => <ToolCard key={c.id} call={c} />)}
        {message.content && (
          <div className={`mt-1.5 flex gap-3 text-[10.5px] opacity-0 transition-opacity group-hover:opacity-100 ${isUser ? 'justify-end text-white/80' : 'text-ink-faint'}`}>
            <button onClick={copy} title="Copy message" className={isUser ? 'hover:text-white' : 'hover:text-ink'}>{copied ? '✓ copied' : 'Copy'}</button>
            {onResend && <button onClick={() => { setDraft(message.content); setEditing(true); }} title="Edit & resend" className="hover:text-white">Edit</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCard({ call }: { call: ToolCall }) {
  const isSpawn = call.name === 'spawn_agent';
  return (
    <div className="mt-2 rounded-xl border border-line p-2.5 font-mono text-[12px]" style={{ background: 'var(--surface-2)' }}>
      <div className="flex items-center gap-2 text-ink-soft">
        <ShieldIcon className="h-3.5 w-3.5" />
        <span className="font-semibold">{isSpawn ? '🤖 spawn_agent' : call.name}</span>
      </div>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-ink-faint">{JSON.stringify(call.input, null, 2)}</pre>
    </div>
  );
}

function ApprovalBar({ approval, onDecide }: { approval: PendingApproval; onDecide: (ok: boolean) => void }) {
  const color = approval.severity === 'high' ? '#e0574a' : approval.severity === 'medium' ? '#e0a44a' : '#8a8f98';
  return (
    <div className="border-t border-line px-5 py-3" style={{ background: 'var(--surface-2)' }}>
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <ShieldIcon className="h-5 w-5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold">Approval required</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ background: color }}>{approval.severity}</span>
            <span className="text-[12px] text-ink-faint">{approval.reason}</span>
          </div>
          <code className="mt-0.5 block truncate font-mono text-[12px] text-ink-soft">
            {String((approval.call.input as Record<string, unknown>).command ?? JSON.stringify(approval.call.input))}
          </code>
        </div>
        <button className="btn btn-outline" onClick={() => onDecide(false)}>Deny</button>
        <button className="btn btn-primary" onClick={() => onDecide(true)}>Approve</button>
      </div>
    </div>
  );
}
