---
status: active
last-updated: 2026-06-25
owner:
---

# Spec — Open Paw

> **This is the source of truth for the project.** It describes *what* we're building and *why* — vision, users, journeys, the feature set, and what success looks like. It is **not** about stack or technical design (that's `TASKS.md`). It is a **living artifact**: every prompt that adds or changes a feature updates this file so it always describes the system as it actually is and intends to be. The verbatim origin ask lives in [original-prompt.md](../../obsurdian/projects/open-paw/original-prompt.md).

## Vision

**Open Paw** is a polished, open-source, local-first AI coding & cowork assistant — a desktop app in the spirit of Claude Code + Hermes/Cowork, unified into a single surface. Its differentiator is **first-class local model support**: connecting to LM Studio, Ollama, and vLLM should be one click, and managing those model servers (load models, watch token usage) happens inside the app. Cloud providers (Anthropic, OpenAI, OpenRouter, and any OpenAI-compatible endpoint) are equally supported.

Quality bar: on par with Zed / Cursor / Warp / OpenClaw — generous whitespace, minimal chrome, dark/light themes, fast.

The persona/mascot is **Nekko** — an 8-bit cat that peeks from the window edge, waves, and "makes biscuits" while the model is thinking.

## Why It Exists

People who want to run AI models locally are stuck choosing between two kinds of tool, each blind in its own way:

- **Local chat UIs (LM Studio, Ollama front-ends)** are *chat-only* — a great model runner with a chat box, but with no awareness of your files or projects. The model can talk about your work but can't actually do it.
- **Terminal CLIs (Claude Code, aider)** have agentic power but are *blind* — you can't see what changed without `git diff`, and editing means leaving the tool.

Open Paw exists to collapse that gap: easy local-model setup **and** a model that works inside your real codebases, with everything it does visible.

### Positioning (carry into website + README)

- **vs LM Studio / local chat UIs**: *"LM Studio runs models. Open Paw runs with your work."* Open Paw works *in your codebases* — reads/edits/searches/runs with a multi-folder index, IDE-like file viewing + inline editing, per-project memory, and guardrails. Same easy local-model setup; the model can actually do the work.
- **vs terminal CLIs (Claude Code, aider)**: *"The power of an agentic CLI, with eyes."* Open Paw adds an IDE-like surface — browse the indexed file tree, view files/diffs, edit inline — with every action visible via the Context Inspector + approvals.

### Messaging pillars

1. **Local-first, truly usable** — your models + your files, on your machine.
2. **See everything** — the Context Inspector shows exactly what the model gets; IDE-like file viewing/editing; guardrails on risky commands.
3. **Runs anywhere, same app** — native, one-command web, Docker, or hosted.
4. **Private by design** — offline OSS editions; Cloud offers an always-available ZDR mode and relays to *your* local model so inference content never leaves your machine.
5. **Your phone, your home model** — drive your local LLM from anywhere (Cloud).

## Who It's For

- **Developers who want to use local models for real work** — people running LM Studio / Ollama / vLLM who are tired of a chat box that can't touch their files, and want an agent that reads, edits, and runs in their codebases.
- **Claude Code / aider / terminal-CLI users** who want the same agentic power but with an IDE-like surface (file tree, diffs, inline edit, visible context).
- **Privacy-conscious / offline users** who want everything to stay on their machine — and, with Cloud, a zero-data-retention path that still keeps inference local.
- **People who want to reach their home/office model from their phone** (the headline Cloud feature).

## User Journeys & Experiences

### Editions — same engine + UI, different runtime

Open Paw ships the **same engine + same React UI** in several runtimes; from the user's point of view it's the same product wherever it runs (only the host transport differs — see `TASKS.md` and [spec-web-and-hosted.md](spec-web-and-hosted.md)):

- **Desktop** (Electron) — the primary experience, available today (installers on GitHub Releases).
- **Self-hosted web** — `npx open-paw` or `npm run web` starts a local server that serves the same UI in a browser; offline-first.
- **Docker** — `docker compose up`, workspaces as mounted volumes, local models reachable via `host.docker.internal`.
- **Open Paw Cloud** (paid) — managed hosting with subscriptions, an always-available **Zero-Data-Retention** mode, cloud chat-history + file management, and **phone connectivity to your locally-running model** via a secure relay.

### Setting up a local model

A user opens the app and goes to **Models**. Auto-discovery probes common localhost ports (Ollama 11434, LM Studio 1234, vLLM 8000, plus `127.0.0.1` to catch IPv4-only servers). They add or confirm a server, test the connection (green Connected / Offline), and the model list populates. Cloud providers are added the same way, grouped into **Local** vs **Cloud** sections. Favorites pin to the top of the picker.

### Working in a codebase

The user wires one or more **folders** into a chat (multi-root), and the workspace gets indexed (file tree + code outline + search). They talk to the model in a unified **Chat** surface — messages render as speech bubbles, reasoning streams into a collapsible "Thinking" box, and a metrics bar shows context used/total, tokens/sec, thinking on/off, an effort cycle, and estimated cost. The agent reads/edits/searches/runs with tool calls shown as cards; risky commands trigger an approval prompt. Per-chat control modes (Ask / Guardrails / YOLO, plus Offline and Incognito) govern how much it confirms.

### Editing, reviewing & previewing — without leaving the app

Files open as panes right in the workbench: a VS Code–style tree on the left, markdown rendered or code in a mono editor, an integrated browser pane for the live preview beside the code. When the agent edits files, a **Changes** panel shows a line diff and the user keeps or reverts at line/file/all granularity. Reviewing AI-made changes, browsing a preview, and writing better prompts (via the always-on prompt analyzer) all happen in one calm window. *(Planned next:)* the user drops a **+ comment** on a line and either queues it for the next prompt or runs it immediately, turning in-place review notes into agent work.

### Designing on the board (planned)

A **Design** tab shows the app's pages as snapshots on a Figma-style board. The user pins **notes** on a page or leaves a **comment** that they Add-to-prompt or Run-now. As the agent reworks the UI, the snapshots refresh live and an "updating" badge marks the page being changed; clicking it jumps to the agent doing the work. The board makes "what does my app look like, and what should change" a visual, direct-manipulation surface.

### Seeing exactly what the model gets (Context Inspector)

A toggleable right-side panel makes context legible. **Sources** lists the folders wired in, attached files, the chat's `SPEC.md` (with Build-from-chat / Live controls), and links to detected guideline files (AGENTS.md/CLAUDE.md) + a memory count. **Breakdown** is a live view of exactly what's entering the prompt this turn (files, guidelines, memory snippets, connector data, index snippets), each item toggleable/pinnable with token counts, plus a context-window headroom bar.

### Living spec from a conversation

Any chat can synthesize a `SPEC.md` in its workspace from the conversation (using the session's own provider/model, one-shot). With **Live** on, the spec is rebuilt after every turn so it tracks design changes and new features as the conversation evolves.

### Driving your home model from your phone (Cloud)

The user pairs a phone to a local agent (QR / link). The local agent dials out to a relay over an outbound, end-to-end-encrypted channel (no inbound ports). From anywhere, the phone drives the model running on the home machine; inference and tool calls execute locally under the machine's guardrails/sandbox. Because the relay only ever sees ciphertext, relayed local-model use is inherently zero-data-retention.

## What Success Looks Like

- **"Connect + use a local model" just works** — one-click local setup, and the model can actually read/edit/run in a real codebase end-to-end (verified repeatedly against a live LM Studio gemma reasoning model: streaming reasoning, single + multi-step tool loops, index-grounded context).
- **The unique features land**: users can *see* what the model is given (Context Inspector) and trust it on risky commands (guardrails) — the two differentiators from the original ask.
- **Same app everywhere** — desktop, one-command web, Docker, and (paid) hosted, with a byte-identical UI.
- **Polished enough to stand next to Zed/Cursor/Warp** — whitespace, themes, speed, and a charming mascot.
- **Shipped and installable** — public MIT repo with downloadable signed-ish installers for win/mac/linux, auto-updates, and a marketing site with downloads.

## Feature Set

> Living catalog of capabilities, grouped by area, marked `[shipped]` / `[in progress]` / `[planned]`. Capability-level descriptions; the task-level breakdown (with stable IDs and history) lives in [TASKS.md](TASKS.md) Part 2, and the full technical design for the web/Docker/Cloud editions lives in [spec-web-and-hosted.md](spec-web-and-hosted.md).

### Models & providers
- **Provider support** `[shipped]` — Anthropic (native), OpenAI-compatible streaming SSE (covers OpenAI/OpenRouter/LM Studio/vLLM), Ollama native (list/pull/ps/load/unload), with OpenRouter presets. Base-URL `/v1` normalization for bare `host:port` entries.
- **Local-model auto-discovery** `[shipped]` — scans localhost + `127.0.0.1` on common ports; Test-connection in the add form; cards auto-check and show Connected/Offline; Local vs Cloud grouping.
- **Models page** `[shipped]` — server cards (add/connect ollama/lmstudio/vllm/cloud), model list, load/unload (ollama), usage analytics (tokens over time, per model/provider), model favorites.
- **Reasoning-model streaming** `[shipped]` — `reasoning_content` deltas render into a collapsible Thinking box.

### Chat & cowork (unified surface)
- **Workbench (multi-pane)** `[shipped]` — the Chat surface is a Warp/Devin-style workbench: a project-grouped left sidebar (chats + terminals per workspace, with spawned sub-agents nested as sub-tabs under their parent), a tabbed center, and side-by-side split columns (up to 3) so many agents and terminals run at once. Each chat pane is independent — its own provider/model picker, streaming, and Context Inspector — so agents run in parallel.
- **Terminals** `[shipped]` — persistent shell sessions rendered as Warp-style command **blocks** (command + streamed output + exit code + duration). Backed by one long-lived host shell per terminal (PowerShell on Windows, `$SHELL`/bash elsewhere) so cwd/env persist across commands; marker-delimited blocks capture status with no native PTY (honors the no-native-modules rule). Command history (↑/↑), best-effort interrupt, scrollback restore on tab reattach. New-terminal shortcut (Ctrl+J).
- **Sub-agents & orchestration** `[shipped]` — a `spawn_agent` tool lets an agent delegate a scoped sub-task to a fresh child session (own context, same project, inherits the parent's tool-execution mode). An **orchestration strategy** (Settings) governs delegation: `solo` (no sub-agents — `spawn_agent` is withheld), `balanced` (delegate only clearly separable/heavy work — default), or `swarm` (act as orchestrator, proactively decompose into parallel sub-agents). The strategy shapes the system prompt and tool availability; **max nesting depth** and an advisory **parallel** count are configurable. Children stream their own events, and the Command Center renders the full **swarm as a recursive tree** under each agent (live status, descendant counts, click-to-open) and reports the final answer back as the tool result.
- **Streaming chat** `[shipped]` — markdown + code rendering, tool-call cards, approval prompts, model picker, speech-bubble messages.
- **Metrics bar** `[shipped]` — context used/total with a by-source token tooltip, tokens/sec, thinking on/off, an effort cycle (low/normal/high → sampling temperature), and per-chat estimated cost.
- **Model auto-mode** `[shipped]` — a per-chat **✨ Auto (pick best)** option in the model picker. When on, each turn is routed to the best available model for that prompt via a pure heuristic: complex/coding asks get the strongest model the provider offers, quick questions get a small fast one, with favorited models breaking ties. The picker shows a "→ <model>" preview of what Auto will use for the current message. Persisted per chat (`session.autoModel`).
- **Chat control modes** `[shipped]` — per-chat Ask / Guardrails / YOLO, plus Offline (local-only, no tools/connectors/internet) and Incognito (no transcript/memory persistence); in-composer Tools popover to enable/disable builtins + MCP tools.
- **Competitor-parity chat features** `[shipped]` — export to Markdown, regenerate last response, edit & resend, per-message + code-block Copy, slash-command palette (`/`), @-mention files, chat-list search + rename, conversation tags, per-chat ⋯ menu (Pin/Rename/Delete).
- **Command Center dashboard** `[shipped]` — front-and-center **Active agent work** board: detailed live cards for every running/recent agent (status + elapsed, provider/model, message + token counts, mode, last-answer snippet, the **recursive sub-agent swarm tree**, Open/Stop actions), live stat tiles (running agents, live terminals, tokens today, est. cost), an **Optimize** insights panel (see below), a Terminals strip, next-action suggestions, the all-chats kanban by activity, a **Tasks & scheduled work** board, a **Cost** panel, a **Services & model servers** board, and the usage/token chart. Every visual metric shows a **friendly skeleton placeholder** when there's no data yet.
- **Optimization insights** `[shipped]` — an **Optimize** panel on the Command Center turns your own usage into prioritized, actionable tips (warnings first, then by estimated saving): route light chats to a connected local model, use a smaller model for short chats (with a concrete cheaper alternative), prune context when input dwarfs output, the single biggest cost driver, and pinning your go-to models. Pure heuristics over the existing usage summary + sessions + providers — no extra model calls; shows a total potential-savings figure.
- **Cost breakdowns** `[shipped]` — a Command Center **Cost** panel: this-month **actual** spend + a month-end **projection**, an **all-time** total, a **daily-spend chart**, a **per-agent breakdown** (accurate to the model each session used), and a collapsible **token-pricing reference** (USD / 1M tokens, published list prices). Local models are $0; everything is labelled an estimate. Computed in the host from the usage log (`totalCost` / `bySessionCost` / per-day `cost`).
- **Automation tasks** `[shipped]` — **scheduled** (run once at a time), **recurring** (every interval), and **background** (long-running agents that stay alive **forever** or **until a condition** the agent judges met) tasks, shown in the Command Center's **Tasks & scheduled work** board (cadence, status, run count, last result; Run-now / Pause-Resume / Open-chat / Delete; live updates). A host **scheduler** fires due tasks through the normal agent loop, reusing one chat session per task so background agents keep context. Created from a chat via the **⚡ Automate** menu (pre-filled with the chat's project/model/draft).
- **Skills in the `/` menu** `[shipped]` — the composer's `/` menu lists **skills** — standard capabilities any agent can run (research, plan, review, security-review, simplify, test, explain, fix, commit, pr) — above the user's saved prompts. **`goal` is a highlighted (★) skill**: `/goal <condition>` starts a long-running **background agent** that works until the condition is met (a real "work until done" loop), surfaced in the Tasks board.
- **Skills tab & workflow visualizer** `[shipped]` — a dedicated **Skills** view in the left rail. Skills are grouped by category (Research & planning, Code quality, Delivery, Automation) in a searchable list; selecting one shows its description, the tools it uses, and a **workflow visualizer** that renders the skill's steps as an n8n / Make-style node graph (trigger → context → agent → tool → decision/loop → output) on a dotted canvas, with colour-coded node types, bezier connectors, branch labels, and dashed return arrows for loops (e.g. `/goal`'s "goal met? → no → keep working" cycle, `/research`'s fan-out to parallel searches). A **Use in chat** button drops the skill's template straight into a chat composer. The graph layout is a pure, unit-tested layered algorithm in `shared/skills.ts` (`layoutWorkflow`), so each skill carries a real `workflow` definition rather than ad-hoc art.

### Files, editor & visual surfaces (IDE-like — "stay in the app")
- **Built-in file viewer/editor** `[shipped]` — clicking a file (or a spec/plan/tasks row, or a tree entry) opens it as a workbench **pane**, splittable side-by-side with chats and terminals — never handed off to the OS. Markdown renders with a Source/Preview toggle; other text opens in a lightweight mono editor with Save + Cmd/Ctrl-S, a dirty indicator, and binary/oversized-file guards. Fixes the old dead-click where `.md` files silently failed to open (`shell.openPath` with no registered handler).
- **Integrated browser pane** `[shipped]` — a Chromium `<webview>` pane with a URL bar (back / forward / reload / open-external) for previewing a local dev server or docs right next to the code that drives them (code-left, preview-right).
- **VS Code–style file explorer** `[shipped]` — a collapsible per-project file tree in the workbench sidebar with color-coded file-type icons (lazy-loaded on expand); click a file to open it in a pane and edit in-app. Not a full IDE — no language servers, debugger, or Monaco.
- **Diff & approval (Devin-style)** `[shipped]` — every file the agent touches this session is snapshotted on first write; a **Changes** panel (a `Δ N` button in the chat header) shows a client-side line diff and lets you **keep / revert** at **line**, **file**, or **all-files** granularity, live-updating as the agent edits. Writes still happen immediately (the tool loop is never gated); "reject" reverts.
- **Hoverable Context Inspector** `[shipped]` — every Context Inspector section and source explains itself on hover (what it is, why it's included, how to control it), turning the provenance panel into a teaching surface.
- **Prompt analyzer** `[shipped]` — a live, fully client-side (no LLM, zero-latency, offline) composer analyzer that identifies the parts of a prompt (role / task / context / examples / output-format / constraints / tone / variables…), underlines weak spots inline, gives an **A–F health score**, and recommends a model tier (fast / balanced / frontier) — a marketable always-on coaching surface. An opt-in LLM "Improve prompt" rewrite (before/after diff) is deferred.
- **Inline editor comments** `[shipped]` — in the file editor, a **+** appears on each line (a scroll-synced gutter); clicking it opens an inline comment box. The comment is captured with its file + line context and the agent picks it up via one of two actions: **Add to prompt** (queues the comment into the composer for the next turn, so several annotations batch into one ask) or **Run now** (dispatches it immediately to the active chat). A line keeps a gutter marker (persisted in `comments.json`) until resolved; a bottom dock lists a line's comments with re-send / resolve. Lets you review code in place and turn margin notes into agent work without leaving the file.
- **Design board (Figma-style)** `[shipped]` — a **Design** tab that lays out the app's UI pages as snapshots on a zoomable board, like a Figma canvas. v1 keeps snapshots as **read-only live previews** — each card is a scaled, non-interactive `<iframe>` of the page (so it mirrors the app as it actually renders, no capture infra). Click a card to attach **persistent notes** (saved in `design.json`, survive across sessions) or **comments** that feed the prompt — the same **Add to prompt / Run now** actions as inline editor comments. As the agent edits the UI, previews **reload so you watch the design update live**; a per-page **"updating" indicator** flags an in-flight change, and clicking it jumps to the driving agent's chat pane. A visual companion to the file/diff surfaces: see the app as pages, not just files.

### Context, guardrails & memory (the differentiators)
- **Context Inspector** `[shipped]` — Sources (folders, attached files, SPEC.md, guideline/memory links) + Breakdown (live per-source token view, toggle/pin, headroom bar); prefs persist per session and actually shape the prompt.
- **Spec-driven development** `[shipped]` — first-class Kiro-style spec workflow built from the conversation. Pick a **methodology** (per-chat + global default): `openpaw` (spec.md → plan.md → tasks.md), `kiro` (requirements.md → design.md → tasks.md), or `lean` (single spec.md). Each artifact has its own **Build/Update** button and is **chained** — the plan is generated with the spec as context, the tasks with both. A "Build all from chat" button runs the whole pipeline. The **tasks artifact renders as an interactive checklist** whose toggles write `[ ]`/`[x]` back to the file, with a progress bar. Lives in the Context Inspector's Spec panel. A **Live** toggle keeps the primary spec rebuilt after every turn.
- **Guardrails** `[shipped]` — risky-command classifier (destructive fs, force push, curl|sh, registry, privilege escalation) + allow/ask/deny policy engine with a default ruleset; settings UI with a guardrails JSON editor.
- **Memory** `[shipped]` — markdown memory store (global + per-workspace) with CRUD and a manager UI.

### Workspaces, indexing & connectors
- **Workspaces** `[shipped]` — multi-root folder add/remove/activate, chats bound to a workspace so index + per-project memory engage.
- **Indexer** `[shipped]` — workspace file tree, regex-based code outline, search; index-grounded context.
- **Projects page** `[shipped]` — folder add/remove, index status, file browser.
- **Connectors** `[shipped]` — Linear/Slack/Discord (token-based, real REST), Gmail/Drive (paste an OAuth access token; one-click OAuth flow still pending Google client creds); connector snippets fed into context. **Official brand icons** (Simple Icons, CC0, in brand colours) and **validate-on-connect** — Connect stores the token and immediately does a real fetch, surfacing a bad token as an inline error instead of silently "connecting"; each card links to where to get its token.

### Tooling & integrations
- **MCP client** `[shipped]` — connect stdio MCP servers; their tools merge into the agent loop namespaced `mcp__<id>__<tool>`, with per-chat toggles and live status. Verified against `@modelcontextprotocol/server-filesystem`.
- **`opaw` CLI + MCP server** `[shipped]` — run the host in-process or against a running server over HTTP+WS; `opaw status|sessions|chat|mcp|watch`; `opaw mcp` exposes Open Paw as an MCP *server* (chat/list/new/get/status) so other agents can trigger agents + swarms. Bundled into the npx package.

### Mascot, polish & onboarding
- **Nekko mascot** `[shipped]` — 8-bit pixel cat (CSS/canvas sprite): wave / biscuit-kneading / peek-from-edge / idle, hooked into app state (thinking → biscuits).
- **Polish** `[shipped]` — welcome/empty states, command palette (Ctrl+K), keyboard shortcuts, toasts, onboarding banner, persistent Context Inspector prefs, app icon, boot smoke test.
- **Refined design system** `[shipped]` — a Warp/Linear-grade visual pass: cleaner cooler neutrals with more breathing room, soft elevation shadows on cards, a friendly **secondary color** (`--accent-2`) paired with the warm accent into a **brand gradient** (the Command Center wordmark, primary buttons, and the active-nav indicator), focus rings, and tighter heading tracking. All theme tokens (incl. `--accent-soft`) track the user's chosen accent. Approachable for non-technical users while keeping the 8-bit Nekko mascot.
- **Multi-language UI (i18n)** `[shipped]` — system-language detection + English fallback; en/es/fr/de/pt/ja/zh.
- **Data & privacy controls** `[shipped]` — delete chats by window, Reset configs, Delete everything; settings export/import.

### Distribution & platforms
- **Marketing website** `[shipped]` — static site with downloads, feature tour, mascot; positioning + edition cards.
- **Desktop packaging & release** `[shipped]` — electron-builder (win/mac/linux), GitHub Actions release workflow, branded NSIS installer + Windows uninstaller, macOS Gatekeeper ad-hoc-sign workaround, auto-updates (electron-updater). Released through v0.1.5.
- **Self-hosted web edition** `[shipped]` — `npm run web` / `npx open-paw` serves the same UI; localhost bind by default, token to expose.
- **Docker edition** `[shipped]` — multi-stage image, compose with volume workspaces + `host.docker.internal`, non-root, GHCR publish.
- **Native phone apps (Capacitor)** `[shipped]` — wraps the shared renderer; relay pairing (paste link + QR), local notifications; Android APK + iOS simulator builds verified on CI.
- **Remote push (relay-mediated)** `[shipped]` — APNs + FCM, dependency-free, content-free "a run finished" notifications; real delivery pending creds + device.

### Open Paw Cloud (paid, hosted)
- **Cloud foundation** `[shipped]` — multi-account hosted edition wrapping the same engine + renderer per account; email+password auth, bearer tokens, per-account data isolation, entitlements (free/pro/team) gated server-side. The OSS app never license-checks.
- **Phone↔local-model relay** `[in progress]` — working prototype: dumb-pipe relay, outbound WSS agent, pairing-key auth, browser relay transport, end-to-end encryption (relay sees only ciphertext). Remaining: device registry + revocation, mobile/PWA polish.
- **Payments (Stripe)** `[shipped]` — Checkout (upgrade to Pro/Team) + Customer Portal (manage/cancel) + signature-verified webhooks that drive an account's plan (and therefore its entitlements). Hand-rolled against the Stripe REST API (no SDK dependency) and gated on `STRIPE_SECRET_KEY`, so the cloud server runs fully without a Stripe account; real charges light up once keys are configured.
- **ZDR + cloud history/files** `[planned]` — retention modes, encrypted-at-rest sync engine, ZDR badges + audit log.
- **Managed connectors** `[planned]` — pre-registered OAuth apps for Gmail/Drive/Slack/Discord.

## Scope Boundaries

- **No native node modules** — keeps Electron rebuild pain away; ripgrep/git are spawned via child_process with JS fallbacks. (Technical constraint; see `TASKS.md`.)
- **Not a full IDE** — the file editor is a lightweight mono textarea (+ rendered markdown), not Monaco/CodeMirror; no language servers, debugger, multi-cursor, or refactoring tooling. The browser pane is a preview/utility surface, not a hardened general web browser. The Design board (planned) shows snapshots, not an editable vector canvas.
- **Cloud never runs your shell/filesystem tools on our servers** — inference and tool calls always execute on *your* paired machine. The cloud is a sync + relay + billing layer, not a remote executor.
- **The OSS app never checks a license** — paid features are gated server-side in Cloud only; the open-source editions are fully functional and free.
- **The relay is a dumb pipe** — it authenticates/routes and forwards ciphertext; it does not inspect or store message bodies.
- Pricing tiers (Free OSS / Pro / Team) are drafts pending cost modeling — see [spec-web-and-hosted.md](spec-web-and-hosted.md) §6.

## Open Questions

- Hosting/runtime for Cloud (Fly.io / Render / AWS?) and the relay scaling model.
- E2E key-management UX (recovery vs zero-knowledge trade-offs).
- Mobile: PWA first, or native shells later? (Native Capacitor shells now exist; PWA also works.)
- Exact ZDR boundary for cloud-configured (non-local) providers without ZDR tiers — likely "not allowed in ZDR workspaces."
- Do desktop + local web share one data dir by default, or separate? (Lean: share, so the web UI sees your desktop sessions.)
- Full Gmail/Drive OAuth flow (needs Google client creds); code-signing / notarization (needs paid Apple cert); npm publish of `open-paw`/`opaw` (needs the user's npm login) — all pending user-side credentials. Provisioning details in [provisioning.md](../../obsurdian/projects/open-paw/provisioning.md).
