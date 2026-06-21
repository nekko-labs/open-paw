import React, { useEffect, useRef, useState } from 'react';
import type { AgentEvent, ChatMessage, Session, ToolCall, ContextBundle, EffortLevel, IndexedFile } from '@open-paw/shared';
import { useStore } from '../store.js';
import { Markdown } from '../components/Markdown.js';
import { ContextInspector } from '../components/ContextInspector.js';
import { ChatMetrics } from '../components/ChatMetrics.js';
import { ChatControls } from '../components/ChatControls.js';
import { SendIcon, PlusIcon, PanelIcon, ShieldIcon, TrashIcon, DownloadIcon, PencilIcon } from '../icons.js';

const LOCAL_KINDS = ['ollama', 'lmstudio', 'vllm', 'openai-compat'];

interface PendingApproval {
  call: ToolCall;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

export function ChatView() {
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    refreshSessions,
    providers,
    models,
    activeProviderId,
    activeModelId,
    selectProvider,
    selectModel,
    contextPanelOpen,
    toggleContextPanel,
    setMascotMood,
    settings,
    activeWorkspaceId,
    setActiveWorkspace,
  } = useStore();

  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [liveReasoning, setLiveReasoning] = useState('');
  const [liveTools, setLiveTools] = useState<ToolCall[]>([]);
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const [mobileNav, setMobileNav] = useState(false); // session drawer on phones
  const [ctx, setCtx] = useState<ContextBundle | null>(null);
  const [tps, setTps] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [atFiles, setAtFiles] = useState<IndexedFile[]>([]);
  const [chatQuery, setChatQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const turnStart = useRef(0);

  const refreshCtx = (sid: string | null) => {
    if (sid) window.nekko.previewContext(sid, []).then(setCtx).catch(() => setCtx(null));
    else setCtx(null);
  };
  useEffect(() => refreshCtx(activeSessionId), [activeSessionId, sessions]);

  // Load the active session's transcript; reflect its workspace in the header.
  useEffect(() => {
    if (activeSessionId) {
      window.nekko.getSession(activeSessionId).then((s) => {
        setSession(s);
        if (s?.workspaceId) setActiveWorkspace(s.workspaceId);
      });
    } else setSession(null);
  }, [activeSessionId, sessions, setActiveWorkspace]);

  // Subscribe to streaming agent events.
  useEffect(() => {
    const off = window.nekko.onAgentEvent((e: AgentEvent) => {
      if (e.sessionId !== activeSessionId) return;
      switch (e.type) {
        case 'text':
          setLiveText((t) => t + e.delta);
          break;
        case 'reasoning':
          setLiveReasoning((t) => t + e.delta);
          setThinking(true);
          break;
        case 'usage': {
          const secs = (Date.now() - turnStart.current) / 1000;
          if (secs > 0 && e.outputTokens > 0) setTps(Math.round(e.outputTokens / secs));
          break;
        }
        case 'tool_call':
          setLiveTools((tc) => [...tc, e.call]);
          break;
        case 'tool_approval_required':
          setApproval({ call: e.call, reason: e.reason, severity: e.severity });
          setMascotMood('thinking');
          break;
        case 'tool_result':
          setApproval(null);
          break;
        case 'error':
          useStore.getState().pushToast('error', e.message || 'Something went wrong.');
          setStreaming(false);
          setLiveText('');
          setLiveReasoning('');
          setLiveTools([]);
          setMascotMood('idle');
          if (activeSessionId) window.nekko.getSession(activeSessionId).then(setSession);
          refreshSessions();
          break;
        case 'done':
          setStreaming(false);
          setLiveText('');
          setLiveReasoning('');
          setLiveTools([]);
          setMascotMood('idle');
          if (activeSessionId) window.nekko.getSession(activeSessionId).then(setSession);
          refreshCtx(activeSessionId);
          refreshSessions();
          break;
      }
    });
    return off;
  }, [activeSessionId, refreshSessions, setMascotMood]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [session?.messages.length, liveText, liveTools.length]);

  const newChat = async () => {
    const s = await window.nekko.createSession(activeWorkspaceId ?? undefined);
    await refreshSessions();
    setActiveSession(s.id);
  };

  const filteredSessions = chatQuery.trim()
    ? sessions.filter((s) => s.title.toLowerCase().includes(chatQuery.toLowerCase()))
    : sessions;

  const commitRename = async (id: string) => {
    const title = renameDraft.trim();
    setRenamingId(null);
    if (title) {
      await window.nekko.setSessionOptions(id, { title });
      refreshSessions();
    }
  };

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
    if (!draft.trim() || !activeProviderId || !activeModelId) return;
    let sid = activeSessionId;
    if (!sid) {
      const s = await window.nekko.createSession(activeWorkspaceId ?? undefined);
      await refreshSessions();
      setActiveSession(s.id);
      sid = s.id;
    }
    const text = draft;
    setDraft('');
    beginTurn();
    // Optimistically show the user's message.
    setSession((prev) =>
      prev
        ? { ...prev, messages: [...prev.messages, { id: 'tmp', role: 'user', content: text, createdAt: Date.now() }] }
        : prev,
    );
    await window.nekko.sendChat({ sessionId: sid!, providerId: activeProviderId, modelId: activeModelId, text });
  };

  // Re-answer the last user turn.
  const regenerate = async () => {
    if (streaming || !activeSessionId || !activeProviderId || !activeModelId || !session) return;
    const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    beginTurn();
    // Optimistically drop trailing assistant/tool messages.
    setSession((prev) => {
      if (!prev) return prev;
      const msgs = [...prev.messages];
      while (msgs.length && msgs[msgs.length - 1].role !== 'user') msgs.pop();
      return { ...prev, messages: msgs };
    });
    await window.nekko.sendChat({ sessionId: activeSessionId, providerId: activeProviderId, modelId: activeModelId, text: lastUser.content, regenerate: true });
  };

  // Edit a previous user message and re-run from there.
  const editResend = async (messageId: string, newText: string) => {
    if (!activeSessionId || !activeProviderId || !activeModelId || !newText.trim()) return;
    await window.nekko.truncateSession(activeSessionId, messageId);
    beginTurn();
    setSession((prev) => {
      if (!prev) return prev;
      const idx = prev.messages.findIndex((m) => m.id === messageId);
      const kept = idx >= 0 ? prev.messages.slice(0, idx) : prev.messages;
      return { ...prev, messages: [...kept, { id: 'tmp', role: 'user', content: newText, createdAt: Date.now() }] };
    });
    await window.nekko.sendChat({ sessionId: activeSessionId, providerId: activeProviderId, modelId: activeModelId, text: newText });
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

  const approve = async (ok: boolean) => {
    if (!approval || !activeSessionId) return;
    await window.nekko.approveTool(activeSessionId, approval.call.id, ok);
    setApproval(null);
  };

  const hasProvider = providers.length > 0;
  // Slash-command palette: when the draft is just `/query` (no newline yet).
  const slashQuery = draft.startsWith('/') && !draft.includes('\n') ? draft.slice(1).toLowerCase() : null;
  const slashMatches =
    slashQuery !== null ? (settings?.prompts ?? []).filter((p) => p.name.toLowerCase().includes(slashQuery)) : [];

  // @-mention file picker: the word being typed ends with `@query`.
  const atQuery = (draft.match(/(?:^|\s)@([^\s@]*)$/) ?? [])[1] ?? null;
  const atMatches =
    atQuery !== null
      ? atFiles.filter((f) => f.relPath.toLowerCase().includes(atQuery.toLowerCase())).slice(0, 8)
      : [];

  // Reset the file cache when the chat's workspace changes; (re)load on demand.
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
    const s = await window.nekko.getSession(session.id);
    setSession(s);
    refreshCtx(session.id);
    composerRef.current?.focus();
  };

  // Favorited models sort to the top of the picker (★).
  const favoriteModels = new Set(settings?.favoriteModels ?? []);
  const sortedModels = [...models].sort((a, b) => {
    const fa = favoriteModels.has(`${activeProviderId}::${a.id}`) ? 0 : 1;
    const fb = favoriteModels.has(`${activeProviderId}::${b.id}`) ? 0 : 1;
    return fa - fb;
  });

  const lastMsg = session?.messages[session.messages.length - 1];
  const canRegenerate = !streaming && !!session?.messages.some((m) => m.role === 'assistant') && lastMsg?.role !== 'user';

  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      {/* Backdrop for the mobile session drawer */}
      {mobileNav && (
        <div className="absolute inset-0 z-20 bg-black/40 md:hidden" onClick={() => setMobileNav(false)} />
      )}
      {/* Session list (static on desktop, slide-over drawer on phones) */}
      <aside
        className={`${mobileNav ? 'absolute inset-y-0 left-0 z-30 flex' : 'hidden'} w-60 flex-col border-r border-line md:relative md:z-auto md:flex`}
        style={{ background: 'var(--paper)' }}
      >
        <div className="flex items-center justify-between p-3 pb-1.5">
          <span className="text-sm font-semibold">Chats</span>
          <button className="btn btn-ghost px-2 py-1.5" onClick={newChat} title="New chat">
            <PlusIcon />
          </button>
        </div>
        <div className="px-3 pb-2">
          <input
            className="input py-1.5 text-[12px]"
            placeholder="Search chats…"
            value={chatQuery}
            onChange={(e) => setChatQuery(e.target.value)}
          />
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {sessions.length === 0 && <p className="px-2 text-[12px] text-ink-faint">No chats yet.</p>}
          {filteredSessions.length === 0 && sessions.length > 0 && (
            <p className="px-2 text-[12px] text-ink-faint">No chats match “{chatQuery}”.</p>
          )}
          {filteredSessions.map((s) => (
            <div
              key={s.id}
              onClick={() => { setActiveSession(s.id); setMobileNav(false); }}
              className={`group flex w-full cursor-pointer items-center justify-between gap-1 rounded-xl px-3 py-2 text-left text-[13px] ${
                s.id === activeSessionId ? 'bg-surface-2 font-medium' : 'text-ink-soft hover:bg-surface-2'
              }`}
            >
              {renamingId === s.id ? (
                <input
                  className="input min-w-0 flex-1 py-0.5 text-[13px]"
                  value={renameDraft}
                  autoFocus
                  onClick={(ev) => ev.stopPropagation()}
                  onChange={(ev) => setRenameDraft(ev.target.value)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') commitRename(s.id); if (ev.key === 'Escape') setRenamingId(null); }}
                  onBlur={() => commitRename(s.id)}
                />
              ) : (
                <span className="truncate" onDoubleClick={(ev) => { ev.stopPropagation(); setRenamingId(s.id); setRenameDraft(s.title); }}>
                  {s.title}
                </span>
              )}
              <span className="hidden shrink-0 items-center gap-1 group-hover:flex">
                <button
                  className="text-ink-faint hover:text-ink"
                  title="Rename"
                  onClick={(ev) => { ev.stopPropagation(); setRenamingId(s.id); setRenameDraft(s.title); }}
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  className="text-ink-faint hover:text-red-400"
                  title="Delete"
                  onClick={async (ev) => {
                    ev.stopPropagation();
                    await window.nekko.deleteSession(s.id);
                    if (s.id === activeSessionId) setActiveSession(null);
                    refreshSessions();
                  }}
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          ))}
        </div>
      </aside>

      {/* Conversation */}
      <section className="flex min-w-0 w-full flex-1 flex-col overflow-x-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-3 md:px-5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:flex-nowrap md:gap-3">
            <button
              className="btn btn-ghost shrink-0 px-2 py-1.5 md:hidden"
              onClick={() => setMobileNav(true)}
              title="Chats"
              aria-label="Open chats"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            </button>
            <select
              className="input min-w-0 flex-1 py-1.5 md:flex-none md:max-w-[150px]"
              value={activeProviderId ?? ''}
              onChange={(e) => selectProvider(e.target.value)}
            >
              {!hasProvider && <option value="">No provider</option>}
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              className="input min-w-0 flex-1 py-1.5 md:flex-none md:max-w-[200px]"
              value={activeModelId ?? ''}
              onChange={(e) => selectModel(e.target.value)}
            >
              {models.length === 0 && <option value="">No models</option>}
              {sortedModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {favoriteModels.has(`${activeProviderId}::${m.id}`) ? '★ ' : ''}{m.name}
                </option>
              ))}
            </select>
            {settings && settings.workspaces.length > 0 && (
              <select
                className="input hidden max-w-[170px] py-1.5 md:block"
                title="Project this chat works in (scopes the index + per-project memory)"
                value={activeWorkspaceId ?? ''}
                onChange={async (e) => {
                  const wid = e.target.value || undefined;
                  setActiveWorkspace(wid ?? null);
                  if (activeSessionId) {
                    await window.nekko.setSessionWorkspace(activeSessionId, wid);
                    const s = await window.nekko.getSession(activeSessionId);
                    setSession(s);
                  }
                }}
              >
                <option value="">No project</option>
                {settings.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!!session?.messages.length && (
              <button className="btn btn-ghost hidden md:inline-flex" onClick={exportChat} title="Export chat as Markdown">
                <DownloadIcon />
              </button>
            )}
            <button className={`btn btn-ghost hidden md:inline-flex ${contextPanelOpen ? 'text-accent' : ''}`} onClick={toggleContextPanel} title="Toggle context panel">
              <PanelIcon />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="w-full flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 md:px-5">
          <div className="mx-auto w-full max-w-3xl space-y-5">
            {!session?.messages.length && !liveText && !liveReasoning && <Welcome hasProvider={hasProvider} />}
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
                <button className="btn btn-outline py-1.5 text-[12px]" onClick={regenerate} title="Re-answer the last message">
                  ↻ Regenerate
                </button>
              </div>
            )}
          </div>
        </div>

        {approval && <ApprovalBar approval={approval} onDecide={approve} />}

        <ChatMetrics bundle={ctx} tps={tps} thinking={thinking} streaming={streaming} />

        <div className="border-t border-line px-4 pb-1 pt-3">
          <ChatControls
            session={session}
            isCloudModel={
              !LOCAL_KINDS.includes(providers.find((p) => p.id === activeProviderId)?.kind ?? '')
            }
            onChange={setSession}
          />
        </div>

        <div className="px-4 pb-4">
          <div className="relative mx-auto flex w-full max-w-3xl items-end gap-2">
            {atQuery !== null && session?.workspaceId && (
              <div className="card absolute bottom-full left-0 z-40 mb-2 w-full max-w-md overflow-hidden p-1.5 shadow-lg">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-ink-faint">Attach a file</div>
                {atMatches.length === 0 ? (
                  <div className="px-2.5 py-1.5 text-[11px] text-ink-faint">
                    {atFiles.length === 0 ? 'Index this folder in Projects to mention files.' : 'No matching files.'}
                  </div>
                ) : (
                  atMatches.map((f) => (
                    <button
                      key={f.path}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-2"
                      onClick={() => pickFile(f)}
                    >
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
                  <button
                    key={p.id}
                    className="flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-2"
                    onClick={() => { setDraft(p.body); composerRef.current?.focus(); }}
                  >
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
              <button className="btn btn-outline" onClick={() => activeSessionId && window.nekko.abortChat(activeSessionId)}>
                Stop
              </button>
            ) : (
              <button className="btn btn-primary" onClick={send} disabled={!draft.trim() || !hasProvider}>
                <SendIcon />
              </button>
            )}
          </div>
        </div>
      </section>

      {contextPanelOpen && (
        <>
          <div
            className="absolute inset-0 z-20 bg-black/40 md:hidden"
            onClick={toggleContextPanel}
          />
          <div className="absolute inset-y-0 right-0 z-30 md:relative md:z-auto" style={{ background: 'var(--paper)' }}>
            <ContextInspector sessionId={activeSessionId} />
          </div>
        </>
      )}
    </div>
  );
}

function Welcome({ hasProvider }: { hasProvider: boolean }) {
  return (
    <div className="fade-in mt-16 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl text-3xl" style={{ background: 'var(--accent-soft)' }}>
        🐾
      </div>
      <h2 className="text-xl font-semibold">Chat, cowork, and code — in one place</h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-faint">
        {hasProvider
          ? 'Ask a question, or tell Nekko to make a change. It works in your folders, respects your guardrails, and shows you every file it touches.'
          : 'Head to Models to connect a local server (Ollama / LM Studio / vLLM) or a cloud provider, then come back here.'}
      </p>
    </div>
  );
}

/** Claude-Code-style thinking box: quiet, left-accent rule, collapsible. */
function ReasoningBlock({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(true);
  // Auto-collapse once the model moves on to the actual answer.
  useEffect(() => {
    if (!live) setOpen(false);
  }, [live]);
  return (
    <div className="fade-in thinking-box overflow-hidden">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-ink-soft hover:text-ink"
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className={live ? 'h-2 w-2 animate-pulse rounded-full' : 'h-2 w-2 rounded-full'}
          style={{ background: live ? 'var(--accent)' : 'var(--ink-faint)' }}
        />
        {live ? 'Thinking…' : 'Thought process'}
        <span className="ml-auto text-[10px] text-ink-faint">{open ? 'hide ▾' : 'show ▸'}</span>
      </button>
      {open && (
        <div
          className="max-h-60 overflow-y-auto whitespace-pre-wrap border-t border-line px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-faint"
        >
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
    navigator.clipboard?.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  if (editing) {
    return (
      <div className="flex justify-end">
        <div className="w-full max-w-[85%]">
          <textarea
            className="input max-h-48 min-h-[60px] resize-none text-[14px]"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
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
        {isUser ? (
          <p className="whitespace-pre-wrap text-[14px]">{message.content}</p>
        ) : (
          <Markdown text={message.content} />
        )}
        {message.toolCalls?.map((c) => <ToolCard key={c.id} call={c} />)}
        {message.content && (
          <div className={`mt-1.5 flex gap-3 text-[10.5px] opacity-0 transition-opacity group-hover:opacity-100 ${isUser ? 'justify-end text-white/80' : 'text-ink-faint'}`}>
            <button onClick={copy} title="Copy message" className={isUser ? 'hover:text-white' : 'hover:text-ink'}>
              {copied ? '✓ copied' : 'Copy'}
            </button>
            {onResend && (
              <button onClick={() => { setDraft(message.content); setEditing(true); }} title="Edit & resend" className="hover:text-white">
                Edit
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCard({ call }: { call: ToolCall }) {
  return (
    <div className="mt-2 rounded-xl border border-line p-2.5 font-mono text-[12px]" style={{ background: 'var(--surface-2)' }}>
      <div className="flex items-center gap-2 text-ink-soft">
        <ShieldIcon className="h-3.5 w-3.5" />
        <span className="font-semibold">{call.name}</span>
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
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ background: color }}>
              {approval.severity}
            </span>
            <span className="text-[12px] text-ink-faint">{approval.reason}</span>
          </div>
          <code className="mt-0.5 block truncate font-mono text-[12px] text-ink-soft">
            {String((approval.call.input as any).command ?? JSON.stringify(approval.call.input))}
          </code>
        </div>
        <button className="btn btn-outline" onClick={() => onDecide(false)}>
          Deny
        </button>
        <button className="btn btn-primary" onClick={() => onDecide(true)}>
          Approve
        </button>
      </div>
    </div>
  );
}
