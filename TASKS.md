---
status: active
last-updated: 2026-06-28
owner:
---

# Execution Plan — Open Paw

> Converted from executionplan.md on 2026-06-29. ✅ = done per the prior plan; Part 1 below is the technical plan, Part 2 is the task checklist.

> **The plan + the build log, in one file.** Part 1 is the **technical plan** — how we build what [SPEC.md](SPEC.md) describes (stack, architecture, data model, conventions, design system, constraints). Part 2 is the **task list** — Now / Backlog / Shipped, recording *how every past feature was built and how future features will be built*, with the context around them. The full technical design for the web/Docker/Cloud editions lives in [spec-web-and-hosted.md](spec-web-and-hosted.md); credential/ops setup lives in [provisioning.md](../../obsurdian/projects/open-paw/provisioning.md) — referenced here, not duplicated. (Merged from the former `plan.md` + `tasks.md`.)

---

# Part 1 — Plan (how we build it)

> The **technical plan**: how we build what [SPEC.md](SPEC.md) describes. Update this whenever the technical approach changes.

## Stack (decided — do not relitigate)

- **Monorepo**: npm workspaces. **No pnpm** (broken on this machine by a corepack/yarn override up the directory tree).
- **Desktop**: Electron 33 (pinned `33.4.11` — caret ranges break electron-builder version resolution under workspaces) + Vite 6 + React 18 + TypeScript 5 + Tailwind CSS **v3 (not v4)** + Zustand. `electron-vite` for the build; `electron-builder` (stable **24.13.3** — v25's `app-builder-bin` helper was ENOENT on CI and a local Defender false-positive) for installers.
- **Core engine**: `packages/core` — pure TS, no Electron imports, unit-testable with Vitest.
- **Host services**: `packages/host` (`@open-paw/host`) — transport-agnostic Node services + a `createHost()` facade (Phase-2 extraction; see Architecture).
- **Shared types/IPC contracts**: `packages/shared` (`@open-paw/shared`).
- **Web server**: `apps/server` — Fastify v5 (+ @fastify/static, @fastify/websocket).
- **Cloud**: `apps/cloud` — Fastify, multi-account, file-backed store (Postgres-swappable).
- **CLI**: `apps/cli` (`opaw`) — ESM, Node 22 globals (`fetch`/`WebSocket`), no deps.
- **Relay**: `apps/relay` — Fastify WS dumb pipe.
- **Mobile**: `apps/mobile` — Capacitor wrapping the shared renderer (standalone, not a root workspace).
- **Website**: `apps/website` — static hand-crafted HTML/CSS/JS (no framework, GitHub Pages), download buttons → GitHub Releases.
- **Storage**: JSON files under the app data dir; usage analytics as JSONL. **No native modules** — spawn `ripgrep`/git via child_process when available, with JS fallbacks.

## Architecture Overview

```
apps/desktop/
  src/main/        Electron main: thin IPC wiring over createHost() (windows, IPC router,
                   workspace add dialog, window-state) — service logic now lives in packages/host
  src/preload/     contextBridge API (typed, from packages/shared) → window.nekko
  src/renderer/    React app (shared verbatim across all editions; see Design System & UI/UX)
packages/core/     providers/ (anthropic, openai-compat, ollama-native, lmstudio, vllm,
                   openrouter), agent/ (loop, tools, prompts), guardrails/ (risky-command
                   classifier + policy), memory/ (markdown memory store), indexer/ (file
                   tree + outline + search), context/ (context assembly with provenance —
                   powers the Context panel), connectors/ (linear, slack, discord, gmail, gdrive)
packages/host/     services/ (settings, sessions, chat, tools, workspace, memory, usage,
                   connectors, mcp, spec, relay-agent, terminal, files, changes); host.ts
                   createHost() → NekkoApi surface + EventEmitter; dispatch.ts createDispatcher(host);
                   paths.ts (data dir, ALS)
packages/shared/   types, IPC channel contracts, defaults, e2e.ts (WebCrypto seal/open)
apps/server/       Fastify: POST /api/:channel + /api/events WS over createHost(); serves renderer;
                   relay-agent mode; esbuild bundle → npx open-paw
apps/cloud/        multi-account hosted edition (accounts, entitlements, per-account Host)
apps/relay/        dumb E2E pipe + push sender (APNs/FCM)
apps/cli/          opaw CLI + MCP server (local in-process or remote HTTP+WS)
apps/mobile/       Capacitor shell over the shared renderer
apps/website/      marketing site (index.html, styles, mascot sprite, downloads)
```

### One codebase, multiple runtimes (the host extraction)

The keystone Phase-2 decision: service logic was extracted out of `apps/desktop/src/main` into the transport-agnostic **`packages/host`**. `createHost(opts)` returns one object implementing every `NekkoApi` method (minus the `on*` subscriptions, which become an `EventEmitter` emitting `agentEvent` / `indexProgress` / `terminalEvent` / `changesUpdated`). A shared **`createDispatcher(host)`** provides one routing table reused by every transport. Then every edition wraps the same `Host`:

- **Desktop** (`apps/desktop/src/main`): thin IPC wiring — `ipcMain.handle(channel, …) → host[method](...)`; forwards host events to `webContents.send`. Overrides only `workspaceAdd` for the native folder dialog.
- **Web/Docker** (`apps/server`): `POST /api/:channel → host[method]` + a `/api/events` WebSocket, both routed by `createDispatcher`. Serves the same built renderer.
- **Cloud** (`apps/cloud`): per-account `Host` (own data dir + event emitter), every request run inside `withDataDir()`.
- **Renderer transport adapter**: `renderer/web-client.ts` provides `window.nekko` over fetch/WS (auto-installed by `main.tsx` when no Electron preload exists), so the React UI is **shared byte-for-byte**. It can also route over the relay (`?relay=&room=&key=`).

> **The five-touch rule (recurring):** adding any renderer↔host capability means touching, in order: `shared/ipc.ts` (channel + `NekkoApi` type) → host impl + `host.ts` interface → `dispatch.ts` → `preload/index.ts` (Electron) → `web-client.ts` (web). Keep all five in sync. (Extending `setSessionOptions` is the same shape: update the `Pick` in **three** places — `sessions.ts`, the `host.ts` interface, and `shared/ipc.ts`.)

See [spec-web-and-hosted.md](spec-web-and-hosted.md) for the full web/Docker/Cloud design, edition matrix, relay protocol, and ZDR boundary.

### Workbench panes (chat / terminal / file / browser / diff)

The workbench is a Zustand pane model (`store.ts`: `groups: WbGroup[]`, each a column of tabbed `WbPane`s shown side by side; `MAX_GROUPS = 3`). `WbPane.kind` is `'chat' | 'terminal' | 'file' | 'browser' | 'diff'`; `WbPane.refId` holds the file path (file/diff) or URL (browser). `WorkbenchView.tsx` routes each kind to a component. Store openers mirror `openChatPane` (locate-or-create, focus): `openFilePane(path)`, `openBrowserPane(url?)`, `openDiffPane(sessionId)`.

## Data Model

- **Storage**: JSON files under the app data dir (desktop: `%APPDATA%/Open Paw/open-paw`; server/CLI: `~/.open-paw`, `OPENPAW_DATA_DIR` override). Usage analytics as JSONL.
- **Settings** (`AppSettings`): providers, defaults (provider/model), guardrails ruleset, prompts (`PromptTemplate[]`), MCP servers (`McpServerConfig[]`), favorites, language, default chat mode, auto-update prefs, `specMethodology`, `orchestration`.
- **Session**: messages, `workspaceId`, `attachedPaths`, `specLinked`, `mode` (ask/guardrails/yolo), `disabledTools`, `offline`, `incognito`, `pinned`, `tags`, `title`, `modelId`, `autoModel`, `specMethodology`, `parentSessionId`, `ContextPrefs` (toggle/pin state).
- **Memory**: markdown entries, global + per-workspace.
- **Workspace**: folder roots + index (file tree, outline, search).
- **Usage**: JSONL append; `UsageSummary` aggregates byModel / bySession (drives cost estimation).
- **Changes** (diff/approval): keyed by sessionId — `{ path, original }` recorded the first time `write_file`/`edit_file` touches a path in a session; `listChanges`/`revertChange`/`acceptChange` operate over it.
- **Cloud**: file-backed `CloudStore` (`cloud.json` + per-account dirs under `accounts/<id>`) behind an interface so Postgres can drop in; `setPlan` ready for Stripe. Each account gets its own data dir, scoped via `withDataDir` (`AsyncLocalStorage` in `paths.ts`); the settings cache is keyed by data dir (`Map<dataDir, AppSettings>`).

## Integrations & APIs

- **Model providers**: Anthropic native; OpenAI-compatible SSE (OpenAI/OpenRouter/LM Studio/vLLM); Ollama native (list/pull/ps/load/unload). Base-URL `/v1` normalization for bare `host:port`.
- **File IPC** (powers file panes / explorer / editor): `readFile(path) → {content, truncated, binary}` (1 MB cap, NUL-byte binary detect), `writeFile(path, content)`, `listDir(path) → DirEntry[]` (dirs-first) — host `files.ts`, honoring sandbox/jail checks where applicable.
- **Connectors**: Linear/Slack/Discord via real REST (token-based); Gmail/Drive OAuth scaffold (full flow pending Google client creds).
- **MCP**: hand-rolled JSON-RPC-2.0-over-stdio client (no SDK dep; `shell:true` on win32 so `npx`/`.cmd` resolve) — `initialize` + `notifications/initialized`, `tools/list`, `tools/call`. Open Paw is also an MCP *server* via `opaw mcp`.
- **Push (relay)**: APNs (HTTP/2 + ES256 JWT) and FCM (HTTP v1, service-account RS256 JWT → OAuth → messages:send), both dependency-free in `apps/relay/src/push.ts`. Config via `APNS_*` / `FCM_SERVICE_ACCOUNT` env. Credential setup: [provisioning.md](../../obsurdian/projects/open-paw/provisioning.md).
- **Cloud auth**: email+password (scrypt via `node:crypto`, `salt:hash`, `timingSafeEqual`), bearer session tokens.

## Infrastructure & Deployment

- **Desktop**: electron-builder targets win (MSI/NSIS/zip), mac (dmg/zip, arm64 ad-hoc signed), linux (AppImage/deb). Release CI on `v*` tags builds all 3 OSes and publishes a draft. Auto-updates via electron-updater (GitHub feed, NSIS). To cut a release: bump version (root/desktop/server) + `git tag vX.Y.Z && git push` → CI publishes a draft → publish it.
- **Web/npx**: `npm run web` (in-repo) or `npm run bundle:web` → esbuild-bundled self-contained `open-paw` package in `apps/server/cli-dist` (server+engine inlined, fastify external) → `npx open-paw`. Publish needs the user's npm login.
- **Docker**: multi-stage `Dockerfile` (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`, dev deps pruned, non-root node:20-slim) + `docker-compose.yml` (volume workspace + data, `host.docker.internal:host-gateway`, publishes to 127.0.0.1:4317); GHCR publish workflow on `v*` tags.
- **Mobile**: `.github/workflows/mobile.yml` (manual) builds Android debug APK + iOS simulator. `cap add ios/android` + native toolchains run on cloud runners (not the Windows dev box). Requires a full root `npm run build` first so workspace dists resolve.
- **Cloud**: `npm run cloud` (:4318) locally; hosted deploy target TBD (open question).
- **Local test loop**: `npm run local` builds + launches the built desktop app (electron-vite preview, no installer/Defender); `npm run web` for the browser edition.
- **Ports**: web 4317, cloud 4318. Kill a stale dev server by port (`Get-NetTCPConnection -LocalPort … | Stop-Process`) — npm-wrapped node survives `pkill`.

## Design System & UI/UX

**UI map (renderer).** Left rail (icon nav): **Chat** → the **Workbench**, **Projects** (workspace folders + codebase index), **Models** (model server UI), **Connectors**, **Memory**, **Command Center** (dashboard), **Settings**, and (planned) **Design** (the snapshot board). **Mascot**: 8-bit cat (Nekko) that peeks from the window edge, waves, makes biscuits while the model is thinking.

**Workbench (the Chat surface).** A Warp/Devin-style multi-pane shell driven by a Zustand pane model (`groups: WbGroup[]`, each a tab-stack of `WbPane`s shown side by side; `MAX_GROUPS = 3`). Left sidebar groups work by project (workspace bucket + a "No project" bucket), listing chats and terminals; sub-agent sessions (`parentSessionId`) nest recursively under their parent. Center is a tab bar + split columns. Components: `WorkbenchView` (orchestrator + sidebar + tab strips), `ChatPane` (self-contained conversation — per-pane provider/model, streaming, inline Context Inspector; refactored out of the old monolithic `ChatView`), `TerminalPane` (Warp block terminal), `FilePane` (markdown preview / mono editor), `BrowserPane` (`<webview>` + URL bar), `DiffPane` (session change review). Terminals are an in-memory host service (`packages/host/terminal.ts`): one persistent shell process per terminal, per-command marker echo delimits blocks + carries the exit code (`$?`-aware on PowerShell), output streamed over a `terminalEvent` bus channel. Sub-agents: `spawn_agent` builtin tool handled in `host/chat.ts` (creates a child session, runs a nested `sendChat`, returns its last assistant message; depth-capped).

**Chat surface.** Messages render as **speech bubbles** (user right, assistant left with a tail) flowing into the composer. Reasoning streams into a Claude-Code-style collapsible **Thinking** box (dimmed, auto-collapses when the answer starts). A **metrics bar** above the composer shows context used/total (hover → token breakdown by source), tokens/sec, thinking on/off, an **effort** cycle (low/normal/high → `EFFORT_TEMPERATURE` {0.2,0.7,1.0}), and per-chat estimated cost. The composer also hosts the **prompt analyzer** (see below).

**File / editor / browser surfaces (IDE-like).** `FilePane` reads via the file IPC; `.md` → toggle between rendered (`Markdown.tsx`) and source; other text → editable mono `<textarea>` with Save (Ctrl/Cmd-S) + dirty dot; binary/oversized → notice. `BrowserPane` is an Electron `<webview>` (`webviewTag: true` in the main `webPreferences`) with go/back/forward/reload/open-external. `FileTree.tsx` (`ProjectFiles`) is a collapsible per-project tree with `fileIcons.tsx` color-tinted glyphs (Linguist/Material palette), lazy children via `listDir`. `DiffPane.tsx` computes a client-side LCS line diff and renders added/removed lines with per-line keep/revert checkboxes + per-file and all-files Keep/Revert; refreshes on the `changesUpdated` event. The `SpecPanel` ↗/row click calls `openFilePane(path)` (not `openPath`), keeping an explicit "reveal in OS" affordance as fallback.

**Prompt analyzer.** `promptAnalysis.ts` (pure, renderer-side, no LLM): given the draft, returns `{ parts, findings, score: 'A'..'F', model }`. Part detection (role/task/context/examples/output-format/constraints/reasoning/tone/variables) + lint rules (vague terms, weak/passive verbs, missing role/format, ambiguous pronouns, length, filler, conflicting instructions, secret/PII leak) + a model hint (multi-step + large context → frontier; short single-shot → fast/cheap). `PromptAnalyzer.tsx` in the composer shows the grade + part checklist, expandable to grouped findings, with inline wavy underlines over flagged spans.

**Context Inspector (right panel, toggleable).** Two parts, each section self-explaining on hover (`InfoHint` group-hover popover):
- **Sources** — folders wired into the chat (active highlighted, add/remove, multi-root), attached files (native multi-file picker; `prompt` fallback on web), the chat's `SPEC.md` (highlighted + openable) with Build-from-chat / Live controls, links to detected guideline files (AGENTS.md/CLAUDE.md), and a memory count.
- **Breakdown** — live view of exactly what's entering the prompt this turn (files, guidelines, memory snippets, connector data, index snippets), each item toggleable/pinnable with token counts, plus a context-window headroom bar.

**Design tokens.** Cleaner cooler ink/paper neutrals, one warm accent (salmon ~`#ff7a59`) + a friendly `--accent-2` paired into `--brand-grad`, 8px spacing grid, rounded-xl cards with soft elevation `--shadow-sm/md`, hairline borders, focus `--ring`, Inter/system font, JetBrains Mono for code. `--accent-soft`/`--ring`/gradient all derive from `--accent` (color-mix) so they track the user's chosen accent. Dark and light themes via CSS variables + `data-theme`, with `color-scheme: light/dark` set on `:root`/`[data-theme=dark]` (and styled `select option` bg/color) to avoid white-on-white.

**Responsive / PWA.** ChatView session list + context panel become slide-over drawers on phones; header selects shrink/hide via `md:`. Installable PWA (manifest + network-first `sw.js` that never caches `/api`, registered only on http origins).

### Inline editor comments (planned) — design

- **Surface**: in `FilePane`'s mono editor, a gutter **+** appears on the hovered/active line. Clicking opens an inline comment box anchored to that line.
- **Capture**: a comment carries `{ path, line, lineText, comment }`. Comments persist per session (extend the host `changes`/a new `comments.ts` store, keyed by sessionId; surfaced via a new `comments:*` IPC channel set following the five-touch rule). A small marker stays on commented lines until resolved.
- **Actions**: **Add to prompt** appends a formatted block (`> file:line — comment`) into the active pane's composer draft so several annotations batch into one ask; **Run now** dispatches immediately via `sendChat` on the pane's session with the same block as the user turn. Both reuse the existing composer/send path — no new agent plumbing.
- **Constraint**: zero new deps; gutter affordance built with the existing editor textarea + an overlay (same technique as the analyzer underline overlay).

### Design board (planned) — design

- **Surface**: a new left-rail **Design** view (and/or a `WbPane.kind = 'design'`). A zoomable/pannable board lays out captured **page snapshots** as cards (Figma-canvas feel) using CSS transform pan/zoom — no new canvas/graph dep for v1.
- **Snapshots**: v1 = read-only images. Capture per page/route. For web/desktop, snapshot the rendered app (reuse the existing screenshot path / `webview` capture for the running preview); store under the app data dir keyed by route. A capture refresh is triggered on demand and when the agent reports a UI change.
- **Notes & comments**: clicking a card opens a side sheet. **Notes** persist with the board (a `design.json` per workspace). **Comments** reuse the inline-comment actions — **Add to prompt** / **Run now** — carrying the page identity as context.
- **Live update + indicator**: when an agent edits files that map to a page, mark that card with an **"updating" badge**; on the agent's `done`/`changesUpdated`, re-capture so the user watches the snapshot change. Clicking the badge calls `openChatPane(sessionId)` to jump to the driving agent.
- **Scope (v1)**: snapshots only (not an editable vector canvas — see Non-goals in spec). Page→file mapping starts heuristic (route table / manual tag) and can tighten later.

## Coding Conventions

Extends `../../knowledgebase/principles/coding.md` (which these override).

- **TypeScript everywhere**; `packages/core` is pure (no Electron) and unit-tested with Vitest.
- **Keep the build green** — `npm run build` at repo root (order: shared → core → host → desktop) before each commit; typecheck across all workspaces; core tests passing.
- **Land code via auto-merged PRs** on `nekko-labs/open-paw`: branch → push → `gh pr create` → `gh pr merge --squash --admin --delete-branch`. PR descriptions stay **short and plain** — a few human-readable bullets.
- **Human-readable tasks first** — checklist items read like plain product statements; technical detail goes as indented sub-bullets, never the top line.
- **Cross-platform** code (Windows-first dev). MCP/stdio spawns use `shell:true` on win32.
- **No new deps when avoidable** — diff (LCS), prompt analysis, file icons, MCP, push JWTs are all in-repo.
- **MCP server stdout hygiene**: `runMcpServer` reassigns `console.log = console.error` so stray stdout never corrupts the protocol stream.
- Autonomous build: don't ask the user; use best judgement; record open questions in `memory.md`.

## Constraints

- **No native node modules** (avoids Electron rebuild pain); **no pnpm**; **Windows-first** dev but keep code cross-platform.
- **Not a full IDE** — lightweight textarea editor (not Monaco/CodeMirror), no LSP/debugger; `<webview>` browser is a preview, not a hardened browser; Design board shows snapshots, not an editable canvas.
- The web/Docker server grants file + shell access to whoever can reach it → **bind to `127.0.0.1` by default**; exposing beyond localhost requires `--host`/`OPENPAW_HOST=0.0.0.0` **and** a token (`OPENPAW_TOKEN`), with a prominent banner. Guardrails + sandbox modes live in the host (not the UI), so they apply identically across editions.
- **Local Windows `dist` is blocked** by Defender quarantining `app-builder.exe` (AV false-positive) — release CI runners are unaffected; don't change Defender settings unprompted.
- **Privacy invariant**: the relay sees only ciphertext + the fact "a run finished" (for push); never message content. Never read/echo a secret value into the conversation (the rotate script is no-echo by design).
- **GUI can't be exercised headless here** — interactive surfaces (webview, drag, diff line-revert math, analyzer overlay, the planned inline comments + design board) are verified by typecheck + build in this environment and need a hands-on pass on a real desktop/web run.
- **Standing rule**: confirm before first-time public exposure / new permissions/credentials unless explicitly authorized this session ([[confirm-before-public-or-permissions]]). Building tooling is fine; only *executing* the public/permission action needs the prompt.

## Key Technical Decisions

- **Host extraction (`packages/host`)** — one transport-agnostic `createHost()` + `createDispatcher()` so desktop/web/Docker/Cloud/CLI all reuse the same engine and the renderer is shared verbatim. The single biggest architectural move; everything else hangs off it.
- **Per-account isolation via `AsyncLocalStorage`** — `withDataDir(dir, fn)` scopes the data dir per request; the settings cache became `Map<dataDir, AppSettings>` (also a general correctness fix). Editions that never call `withDataDir` are byte-for-byte unaffected.
- **E2E-encrypted, outbound-only relay** — the local agent dials out (no inbound ports); keys derived from the pairing secret (PBKDF2 → AES-GCM); the relay forwards opaque ciphertext. This is what makes relayed local-model use inherently ZDR.
- **Open files in-app, not the OS** — matches the "stay in the app" goal and fixes the dead click (`openPath` silently fails with no registered `.md` handler); OS hand-off kept only as a "reveal" fallback.
- **Editor is a lightweight textarea**, not CodeMirror/Monaco — honors "simple, not a full IDE" + the small-dependency footprint; markdown gets the existing zero-dep `Markdown` renderer.
- **Browser pane uses Electron `<webview>`** for v1 (DOM-flow, simplest inside splittable panes); `WebContentsView` is more robust but needs main-process bounds syncing across split groups — deferred.
- **Diff/approve snapshots originals** on first agent write, then diffs current-vs-original; writes still happen immediately (tool loop never gated), "reject" reverts — full review/revert UX without blocking the agent.
- **Prompt analyzer is fully client-side** (regex/structural heuristics) — instant, offline, free; the marketable always-on feel. LLM rewrite is a later opt-in.
- **Capacitor over React Native for mobile** — wraps the existing shared renderer (the web edition already runs over the relay in a phone browser), matching "same UI everywhere" and maximizing reuse.
- **Tags over hierarchical folders** for conversation organization (lighter, less sidebar restructuring).
- **Hand-rolled MCP & push** (JSON-RPC over stdio; APNs/FCM JWTs via `node:crypto`) — dependency-free, in keeping with "no native modules" and a lean tree.

---

# Part 2 — Tasks (what's built and what's next)

> The spec + plan broken into **small, reviewable, independently testable work items** — the project-level build checklist + shipped history. Capability-level descriptions live in [SPEC.md](SPEC.md); the full web/Docker/Cloud design lives in [spec-web-and-hosted.md](spec-web-and-hosted.md).

> **Status values**: `[ ]` not-started · `[~]` in-progress · `[x]` done · `[!]` blocked
>
> IDs are the original build-checklist numbers (kept stable; do not renumber). Phase groupings are preserved as sub-headings. Current narrative status lives in [memory.md](../../obsurdian/projects/open-paw/memory.md).

## Road to v1.0

> **What v1.0 means**: the polished, installable **OSS product** (Desktop + self-hosted web + Docker) — every differentiator and IDE surface working and verified, the two new visual/editing features landed, and clean signed installs + npm publish. **Open Paw Cloud (paid)** runs as a *parallel track* (T31/T32/T34) and does **not** gate the OSS v1.0 launch.

**Done toward v1.0** — core engine + agent loop, all providers + local auto-discovery, the differentiators (Context Inspector, guardrails, memory), workbench + terminals + sub-agents + Command Center, spec-driven dev + orchestration + optimize + auto-mode + refined design system, the **IDE-surfaces wave** (file viewer/editor, browser pane, file explorer, diff/approval, hoverable inspector, prompt analyzer — T66), **inline editor comments (T72)** and the **Design board (T73)**, and all distribution editions (desktop release through **v0.1.5**, web/npx, Docker, mobile shells, relay-mediated push).

**Remaining for v1.0:**
- [ ] **GUI verification pass** of the IDE-surfaces wave (T66) with a model connected — webview browsing, the diff line-revert math, the analyzer overlay. (The file editor + tree + the new comment/design surfaces are now hands-on verified over the web edition; the rest is best exercised with a live model.)
- [ ] Pending user-side credentials/infra (below): code-signing + notarization for clean installs, npm publish of `open-paw`/`opaw`, full Gmail/Drive OAuth, real APNs/FCM delivery, wiki push.
- [ ] Cut the **v1.0 release** once the above land (bump versions + tag).
- [ ] **T33** relay/phone polish (mobile/PWA, device registry + revocation) — needed for the phone-connectivity story; the Cloud-account dependency for revocation may push full revocation just past v1.0.

## Now / In Progress

- [ ] **T33** — Relay + phone connectivity: working prototype done (`apps/relay` dumb pipe, `apps/server` relay-agent outbound WSS, pairing-key auth, web-client relay transport, E2E encryption — relay sees only ciphertext). **Still TODO**: mobile/PWA polish, device registry + revocation (needs the Cloud account model).

## Backlog / Planned

### Phase 3 — Open Paw Cloud (paid, hosted) — parallel track, does not gate OSS v1.0
- [ ] **T32** — ZDR mode (always available) + cloud chat-history + cloud file management; encrypted-at-rest sync engine; ZDR badges + audit log.
- [ ] **T34** — Managed connectors: pre-registered OAuth apps for Gmail/Drive/Slack/Discord.

### Pending user-side credentials / infra
- [ ] Full Gmail/Drive OAuth flow (needs Google client creds).
- [ ] Code-signing certs (win/mac) + macOS notarization for clean installs (needs paid Apple Developer cert).
- [ ] Publish `open-paw` / `opaw` to npm so `npx open-paw …` works (needs the user's npm login; bundle built + verified locally).
- [ ] Push the GitHub wiki pages after a manual first-page creation (staged in `docs/wiki/`).
- [ ] Real APNs/FCM delivery (needs creds + a device); Cloud hosted deploy target. See [provisioning.md](../../obsurdian/projects/open-paw/provisioning.md).
- [ ] Stripe billing keys to enable live charges (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM`, `CLOUD_PUBLIC_URL`); integration is built + tested, just unconfigured.

## Shipped

> Append as work lands; bug fixes folded into the feature they harden. Verified throughout against a live LM Studio gemma reasoning model (streaming reasoning, single + multi-step tool loops, index-grounded context).

### Core build (1–25)
- [x] **T1** — Monorepo scaffold, tsconfig, lint-light, README, MIT license.
- [x] **T2** — `packages/shared`: types + IPC contracts.
- [x] **T3** — `packages/core` providers: OpenAI-compatible (streaming SSE), Anthropic, Ollama native (list/pull/ps/load), LM Studio, vLLM, OpenRouter presets; provider auto-discovery (scan localhost:11434/1234/8000).
- [x] **T4** — `packages/core` agent loop: system prompt, tool-use loop (read/write/edit/glob/grep/bash), streaming events.
- [x] **T5** — Guardrails: risky-command classifier (destructive fs, force push, curl|sh, registry, privilege esc), policy engine (allow/ask/deny), default ruleset.
- [x] **T6** — Context engine: context assembly with provenance records (file/guideline/memory added, token estimates) → drives Context Inspector.
- [x] **T7** — Memory: markdown memory store (global + per-workspace), CRUD.
- [x] **T8** — Indexer: workspace file tree, code outline (regex symbols), search.
- [x] **T9** — Connector framework + Linear/Slack/Discord (real REST), Gmail/Drive (OAuth scaffold).
- [x] **T10** — Electron main: IPC router, settings store, multi-window, multi-root workspaces, tool execution with sandbox modes (workspace-jail / ask / docker-if-present).
- [x] **T11** — Renderer shell: theming, left rail, layout, command palette.
- [x] **T12** — Chat surface: streaming messages, markdown+code rendering, tool-call cards, approval prompts, model picker.
- [x] **T13** — Models page: server cards (add/connect ollama/lmstudio/vllm/cloud), model list, load/unload (ollama), usage analytics.
- [x] **T14** — Context Inspector panel (unique feature #1).
- [x] **T15** — Guardrails settings UI (unique feature #2).
- [x] **T16** — Memory manager UI.
- [x] **T17** — Projects page: folder add/remove, index status, file browser.
- [x] **T18** — Connectors UI.
- [x] **T19** — Mascot: 8-bit pixel cat (CSS/canvas sprite), wave / biscuit-kneading / peek-from-edge / idle, hooked into app state (thinking → biscuits).
- [x] **T20** — Marketing website with downloads, feature tour, mascot.
- [x] **T21** — electron-builder config (win/mac/linux) + GitHub Actions release workflow.
- [x] **T22** — Core tests (vitest): guardrails, context assembly, outline, providers (mocked SSE).
- [x] **T23** — Polish pass: welcome/empty states, approval flow, command palette (Ctrl+K), keyboard shortcuts, toasts, onboarding banner, connector→context wiring, persistent Context Inspector prefs, app icon, boot smoke test.
- [x] **T24** — Docs: UI screenshots + walkthrough guide (docs/WALKTHROUGH.md).
- [x] **T25** — Verified local model end-to-end vs LM Studio (gemma reasoning model): reasoning streaming, base-URL `/v1` normalization, single + multi-step tool loops; friendly connection errors; workspace-bound chats; index-grounded context; persisted defaults; window state.

### Phase 2 — Web & Docker editions (same code) (26–29) — see [spec-web-and-hosted.md](spec-web-and-hosted.md)
- [x] **T26** — Extract `packages/host` (`createHost()` = NekkoApi surface + event emitter); desktop main rewritten as thin IPC wiring; verified via `scripts/itest-host.mjs` against LM Studio.
- [x] **T27** — `apps/server` (Fastify): shared `createDispatcher` routes `POST /api/:channel` + `/api/events` WS over the same host; `renderer/web-client.ts` provides `window.nekko` over fetch/WS; `npm run web`; localhost bind + token when exposed.
- [x] **T28** — Docker: multi-stage `Dockerfile` + `docker-compose.yml` (volume workspace+data, `host.docker.internal`, localhost publish) + `.dockerignore` + GHCR publish workflow. Verified: 361MB image serves UI + API, reached LM Studio.
- [x] **T29** — `npx open-paw` package: `npm run bundle:web` → esbuild self-contained `open-paw` (server+engine inlined, fastify external, built `web/`). Verified by running the packed tarball outside the repo. Actual `npm publish` needs the user's npm login.

### Phase 3 — Open Paw Cloud (paid, hosted) — shipped portion (30, 31)
- [x] **T30** — Cloud foundation (`apps/cloud`): multi-account hosted edition wrapping the same host + renderer per account. Email+password auth (scrypt), bearer tokens, file-backed `CloudStore` (Postgres-swappable). Per-account isolation via `withDataDir` (`AsyncLocalStorage`) + settings cache keyed by data dir. Entitlements (free/pro/team) gated server-side; OSS app never license-checks. Thin `CloudLogin` renderer gate. 13 cloud tests + live smoke. `npm run cloud` (:4318). PR #54.
- [x] **T31** — Payments (Stripe): `apps/cloud/src/billing.ts` hand-rolled against the Stripe REST API (no SDK dep, same dependency-free DNA as the relay's APNs/FCM senders), gated on `STRIPE_SECRET_KEY`. `POST /api/billing/checkout` ({plan} → Checkout Session URL), `POST /api/billing/portal` (Customer Portal URL), and a raw-body `POST /api/billing/webhook` whose `Stripe-Signature` is verified with HMAC-SHA256 (`node:crypto`, replay-window check). `planChangeFromEvent` maps `checkout.session.completed` / `customer.subscription.updated|deleted` → a plan, applied via `store.setPlan` so entitlements update immediately; `CloudStore` now carries `stripeCustomerId` (+ `findByStripeCustomer`/`setStripeCustomer`). `/api/auth/config` advertises `{billing}`. 19 new cloud tests (signature verify incl. tamper/replay, event mapping, and a full signed-webhook → account-upgraded HTTP path via Fastify `inject`); 32 cloud tests total. Live Stripe charges need the user's keys (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_PRO`/`STRIPE_PRICE_TEAM` + `CLOUD_PUBLIC_URL`). Renderer Upgrade UI deferred (server-side complete).

### Chat UI/UX polish (post-1.0 desktop) (35–59)
- [x] **T35** — Chat redesign: fixed spacing + light/dark `color-scheme`, speech-bubble messages, collapsible Thinking box; in-chat metrics bar (context used/total + by-source tooltip, tokens/sec, thinking on/off, effort cycle → `EFFORT_TEMPERATURE`).
- [x] **T36** — Context Inspector Sources: manage workspace folders + attached files per chat; highlight SPEC.md + guideline/memory links; **living spec** (`buildSpec(sessionId)` → `<workspace>/SPEC.md`) with Build-from-chat + Live toggle (`session.specLinked`).
- [x] **T37** — Settings polish: accent-color swatch edge-to-edge; aligned toggle/control rows.
- [x] **T38** — Auto-updates: desktop `electron-updater` (GitHub feed, NSIS) behind first-run opt-in + Settings toggle + auto-check; Update banner; web compares served build version; app version via `app:info`.
- [x] **T39** — Models UX: auto-discovery probes `127.0.0.1` too; Test-connection in add form; cards auto-check Connected/Offline; Local vs Cloud sections.
- [x] **T40** — Chat control modes: per-chat Ask/Guardrails/YOLO + Settings default; in-composer Tools popover (`session.disabledTools`); Offline + Incognito; guardrails JSON editor.
- [x] **T41** — Command Center dashboard: next-action suggestions, usage stats + token chart, kanban of agent chats by activity with inline transcript, background-tasks/agents board.
- [x] **T42** — Multi-language UI (i18n): system-language detection + English fallback (en/es/fr/de/pt/ja/zh); Settings language picker.
- [x] **T43** — Branded NSIS installer (dark sidebar + Nekko mascot + tagline) + hover Copy on chat messages.
- [x] **T44** — macOS Gatekeeper fix: afterPack ad-hoc signs the `.app`; `hardenedRuntime:false`/`gatekeeperAssess:false`; `xattr -cr` workaround documented (clean opening still needs notarization).
- [x] **T45** — Competitor-parity chat features: export (Markdown), regenerate, edit & resend (`session:truncate`), per-message + code-block Copy, slash commands, @-mention files, chat-list search + rename, model favorites.
- [x] **T46** — Released v0.1.1.
- [x] **T47** — Windows uninstaller: NSIS `customUnInstall` offers to delete user data; silent/auto-update uninstalls keep data. Released in v0.1.2.
- [x] **T48** — Data & privacy cleanup (Settings): delete chats by window, Reset configs, Delete everything; export/import helpers.
- [x] **T49** — Per-chat ⋯ menu: Pin / Rename / Delete.
- [x] **T50** — MCP client support: hand-rolled JSON-RPC-over-stdio client; `settings.mcpServers`; tools merged namespaced `mcp__<id>__<tool>`; Settings card + live status. Verified vs `@modelcontextprotocol/server-filesystem` (14 tools).
- [x] **T51** — Released v0.1.3.
- [x] **T52** — MCP tools per-chat toggle; MCP servers shown in Command Center workers board.
- [x] **T53** — Estimated cost: `MODEL_PRICING` + `estimateCostUSD`/`formatUSD`; `UsageSummary.bySession`; per-chat cost in metrics bar + Command Center.
- [x] **T54** — Conversation tags: `session.tags`, per-row chips, tag filter bar.
- [x] **T55** — Settings export/import: backup & restore (export/import config JSON).
- [x] **T56** — Native phone apps (Capacitor): `apps/mobile` wraps the shared renderer; RelayPairing first-run screen + QR (jsQR), local notifications; `mobile.yml` builds Android APK + iOS simulator (both green on CI).
- [x] **T57** — Remote push (relay-mediated): phone registers token with the relay; desktop sends content-free `notify` on `done`; relay pushes via APNs (HTTP/2 + ES256) and FCM (HTTP v1, RS256 → OAuth), dependency-free. Real delivery pending creds + device.
- [x] **T58** — CLI + MCP server (`opaw`): runs the host in-process or against a running server over HTTP+WS; `opaw status|sessions|chat|mcp|watch`; `opaw mcp` exposes Open Paw as an MCP server (chat/list/new/get/status). Embedded into the npx package. Released v0.1.5.
- [x] **T59** — Local test loop + provisioning tooling: `npm run local` / `npm run web`; reusable vault skills `provision-keys` + `rotate-keys`; needs in [provisioning.md](../../obsurdian/projects/open-paw/provisioning.md); standing confirm-before-public rule.

### Phase 4 — Workbench, terminals & sub-agents (60)
- [x] **T60** — Multi-pane Workbench + terminals + sub-agents + Command Center board. **Backend**: `packages/host/terminal.ts` — persistent-shell terminal service (one process per terminal, marker-delimited Warp blocks, `$?`-aware PowerShell exit codes, scrollback retained for reattach), exposed over a new `terminalEvent` bus channel wired through dispatch → preload/web-client/main IPC/server/cloud; `spawn_agent` builtin tool (core) handled in `host/chat.ts` (nested `sendChat` on a `parentSessionId` child session, depth-capped at 2, returns the child's last answer); `Session.parentSessionId` + terminal types in `packages/shared`. **Frontend**: `WorkbenchView` (project-grouped sidebar with nested sub-agents, tab strips, up to 3 side-by-side split columns), `ChatPane` (self-contained conversation extracted from the old `ChatView`, independent per-pane provider/model so agents run in parallel), `TerminalPane` (block terminal w/ history + interrupt), Zustand pane/split model + terminal state, Ctrl+J new-terminal. **Command Center**: prominent live *Active agent work* board (status/elapsed, model, msg+token counts, mode, last-answer snippet, nested sub-agents, Open/Stop), running/terminal stat tiles, Terminals strip. Verified: full build + all 27 core tests green; terminal create/run/cwd-persistence/exit-codes confirmed end-to-end over the web edition.

### Phase 5 — Command Center / orchestration / spec-driven dev (61–65)
- [x] **T61** — First-class spec-driven development (Kiro-inspired). `shared/spec.ts`: `SpecMethodology`/`SpecDocDef` types + `SPEC_METHODOLOGIES` (openpaw spec→plan→tasks, kiro requirements→design→tasks, lean single-spec) + pure `parseTasks`/`toggleTaskLine`/`getMethodology` helpers. `host/spec.ts` generalized to `buildSpecDoc(sessionId, docId)` (role-specific system prompt; earlier artifacts chained in as context), `readSpecDocs`, `setSpecMethodology`, `toggleSpecTask`; `buildSpec` kept as a thin alias for the primary doc. New channels `spec:buildDoc|readDocs|setMethodology|toggleTask` wired through dispatch/host/ipc/preload/web-client. `settings.specMethodology` + `session.specMethodology`. Renderer `SpecPanel` (methodology picker, per-artifact Build/Update, Build-all, interactive tasks checklist + progress) replacing the thin Spec section in the Context Inspector; Settings default-methodology section. 8 new unit tests (parse/toggle/methodology), 35 core tests + typecheck across 8 workspaces green; verified rendering + methodology-switch persistence over the web edition.
- [x] **T62** — Agent orchestration strategies + swarm tree. `shared/orchestration.ts`: `OrchestrationStrategy` (solo/balanced/swarm) + `OrchestrationSettings` (strategy/maxDepth/maxParallel) + `ORCHESTRATION_STRATEGIES` (allowsSpawn + promptHint) + `DEFAULT_ORCHESTRATION` + pure `getStrategy`/`orchestrationPromptHint`. Real behavior: `host/chat.ts` withholds `spawn_agent` under `solo`, injects the strategy's guidance into the system prompt (new `PromptContext.orchestrationHint`), and reads `maxDepth` from settings (replacing the hardcoded const). `settings.orchestration` + store default. SettingsView "Agent orchestration" section (3 strategy cards + depth/parallel inputs, hidden under solo). CommandCenter `AgentCard` now renders a **recursive `SubAgentTree`** of the whole descendant swarm (live dots, descendant counts) instead of a flat 4-item list. 7 new unit tests (42 core total) + typecheck across 8 workspaces + builds green; verified Settings render + strategy persistence (swarm/solo/balanced) + conditional depth inputs over the web edition.
- [x] **T63** — Optimization insights ("Optimize" panel). `shared/insights.ts`: pure `optimizationTips({usage,sessions,providers}, limit)` → prioritized `OptimizationTip[]` (warn→suggest→info, then by saving). Heuristics: cloud-spend-while-local-available (with savings est.), expensive-model-on-short-chats (suggests a cheaper alternative via `cheaperAlternative`), context-heavy prompts (input:output ≥ 12:1), top cost driver (≥50% of spend), model-sprawl favorites nudge. CommandCenterView `OptimizePanel` renders the tips as severity-coloured cards + a total-potential-savings chip + "Manage models" link. 6 new unit tests (48 core total) + typecheck across 8 workspaces + builds green; verified rendering against seeded usage (use-local + top-driver tips, $5.29 savings) over the web edition, then cleaned the seed.
- [x] **T64** — Model auto-mode. `shared/model-select.ts`: `AUTO_MODEL_ID` sentinel + pure `isComplexPrompt`/`modelTier`/`recommendModel(models, prompt, preferred)` (complex→strongest tier, simple→smallest-capable tier≥2, favorites break ties). `session.autoModel` (added to all THREE setSessionOptions Picks — sessions.ts/host.ts/ipc.ts). ChatPane: ✨ Auto option in the model select (shown when >1 model), resolves the concrete model at send/regenerate/editResend time, persists `autoModel` on change, and previews "→ <model>" for the current draft. 8 new unit tests (56 core total) + typecheck across 8 workspaces + builds green; verified the `autoModel` field round-trips through the host (set true→reread→false) over the web edition.
- [x] **T65** — Refined design system (Warp/Linear-grade polish). `renderer/styles.css`: cleaner cooler neutrals (light + dark), more whitespace, soft elevation `--shadow-sm/md` on `.card`, a friendly `--accent-2` + `--brand-grad` (used on the Command Center wordmark via `.text-gradient`, `.btn-primary`, and the `.nav-item.active::before` indicator), focus `--ring` on inputs, button press transitions, tighter heading tracking; `--accent-soft`/`--ring`/gradient all derive from `--accent` (color-mix) so they track the user's accent. CommandCenter stat tiles got per-tile colour accents + more padding. typecheck + desktop/web builds green; verified the tokens/gradient-title/card-shadow/nav-indicator via computed styles over the web edition.

### Phase 6 — IDE surfaces + prompt analyzer (66)
- [x] **T66** — Built-in file viewer/editor, integrated browser, file explorer, diff/approval, hoverable Context Inspector, and the prompt analyzer — the "stay in the app" wave. **Foundation**: `readFile`/`writeFile`/`listDir` IPC wired through shared/host(`files.ts`)/dispatch/preload/web-client (`readFile` → `{content, truncated, binary}`, 1 MB cap + NUL-byte binary detect; `listDir` dirs-first). **Dead-click fix**: `SpecPanel` ↗/row → `openFilePane(path)` instead of `openPath` (which silently failed with no `.md` handler); FilePane keeps a "reveal in OS" button. **Panes**: `WbPane.kind` extended to `chat|terminal|file|browser|diff`; store openers `openFilePane`/`openBrowserPane`/`openDiffPane`. `FilePane.tsx` (md Source/Preview toggle; mono editor + Save/Ctrl-S + dirty dot; binary/large notice). `BrowserPane.tsx` (`<webview>` + back/forward/reload/open-external; `webviewTag` enabled in main window). **Explorer**: `FileTree.tsx` (`ProjectFiles`) collapsible per-project tree, lazy children via `listDir`, `fileIcons.tsx` color-tinted chips (Linguist/Material palette). **Diff/approval (Devin-style)**: host `changes.ts` snapshots the original on first `write_file`/`edit_file` per session; `Δ N` button in the chat header; `DiffPane.tsx` client-side LCS line diff with per-line tick→Revert, Keep/Revert file, Keep-all/Revert-all; live `changesUpdated` event. **Hoverable inspector**: `ContextInspector.tsx` `InfoHint` group-hover popover on every section + source category. **Prompt analyzer**: `promptAnalysis.ts` (pure, no LLM) + `PromptAnalyzer.tsx` — A–F grade, part checklist, inline wavy underlines, suggestions, model recommendation (complexity/context heuristic → fast/balanced/frontier). All eight workspaces typecheck; desktop builds. **NOT yet exercised in the running GUI** — needs a hands-on pass (webview browsing, file edit+save, file tree, diff line-revert math, analyzer overlay); tracked under Road to v1.0. *Deferred follow-ups*: opt-in "Improve prompt" LLM rewrite (before/after diff); browser pane on `WebContentsView`; file-tree right-click new/rename/delete; markdown scroll-sync; live underline overlay in the textarea.

### Phase 7 — Editor comments + Design board (72–73)
- [x] **T72** — **Inline editor comments.** `FilePane` gained a scroll-synced line gutter: a **+** on each line opens an inline comment box; commented lines keep a marker. Host `comments.ts` persists comments per file to `comments.json` (`comments:list/add/resolve` IPC, wired through dispatch/host/ipc/preload/web-client). A new `store.sendToChat(text, run)` sets a `composerInbox` that `ChatPane` consumes — **Add to prompt** appends the formatted `Re file:line — comment` block to the draft, **Run now** sends it once the provider is ready (guarded against the freshly-opened-pane race). A bottom comment dock lists a line's comments with re-send / resolve. Editor switched to a non-wrapping textarea so the gutter aligns row-for-row. No new deps. Verified end-to-end over the web edition (gutter + line numbers, dock on a line, comment persisted to `comments.json`, Add-to-prompt landed in the composer). Feature folder: `features/inline-editor-comments/`.
- [x] **T73** — **Design board (Figma-style).** New left-rail **Design** view (`DesignBoardView`, `View='design'` + nav entry + `LayoutIcon`). Each page is a card with a live, scaled, read-only `<iframe>` "snapshot" (no capture infra — mirrors the app as it renders); zoom slider; add/remove pages. Host `design.ts` persists pages + notes per workspace to `design.json` (`design:get/addPage/updatePage/removePage/addNote/resolveNote`). A side sheet pins **persistent notes** and routes **comments** (Add to prompt / Run now) via `sendToChat` carrying page identity. Subscribes to `onAgentEvent`/`onChangesUpdated` filtered to the workspace's sessions to flag pages **updating** and reload previews; the badge opens the running agent's chat (`openChatPane`). Verified end-to-end over the web edition (added a page with a live snapshot, pinned a note that round-trips through `design.json`, routed a comment into the composer; screenshot captured). Feature folder: `features/design-board/`.

### Phase 8 — Command Center, automation & skills (74–77)
- [x] **T74** — **Cost breakdowns + empty-state placeholders.** Host `usage.ts` now computes `totalCost`, `bySessionCost`, and per-day `cost` (via `estimateCostUSD`). Command Center **Cost** panel: this-month actual + month-end projection + all-time, a daily-spend bar chart, a per-agent breakdown (accurate to each session's model), and a collapsible token-pricing reference (USD/1M, published list prices). A reusable `ChartEmpty` skeleton placeholder shows for any metric with no data yet (Cost + Token usage). UI hardened against older/missing usage shapes (`?? {}` / `?? 0`).
- [x] **T75** — **Tasks & scheduled work.** Host scheduler `tasks.ts` (+ `tasks.json`): `scheduled` (one-shot at a time), `recurring` (every interval), and `background` (long-running; keep alive **forever** or **until** a condition the agent judges met via the `⟦DONE⟧` token). A periodic tick fires due tasks through `sendChat`, reusing one session per task; `tasks:list/create/update/delete/runNow` IPC + a `tasksUpdated` event, wired through dispatch/host/ipc/preload/web-client. Command Center board split: model servers/MCP/relay → **Services & model servers**; new **Tasks & scheduled work** board with cadence/status/run-count/last-result + Run-now / Pause-Resume / Open-chat / Delete, updating live. **Every task links to a chat**: `createTask` provisions a tagged session (`session.taskId`) up front so scheduled tasks/goals always open a chat (even pre-fire); task chats are kept out of the agent board / All-chats / sidebar and dropped on delete if still empty.
- [x] **T76** — **⚡ Automate menu in the agent window.** `ScheduleTaskModal` (opened from a chat header button) creates a scheduled / recurring / background task, pre-filled with the chat's project/model/draft; background tasks pick keep-alive forever or until a condition.
- [x] **T77** — **Skills in the `/` menu (+ goal).** `shared/skills.ts`: a standard skills registry (research, plan, review, security-review, simplify, test, explain, fix, commit, pr) shown in the composer's `/` menu above saved prompts. **`goal` is highlighted (★)**: `/goal <condition>` routes to a background "until" task (work-until-done) instead of a one-off turn, surfaced in the Tasks board. Verified end-to-end over the web edition (all sections render with empty-state placeholders; created scheduled + background `/goal` tasks that persisted and showed in the dashboard; skills menu lists the set with goal starred; screenshot captured).
- [x] **T79** — **Skills tab + workflow visualizer (n8n / Make-style).** Extended `shared/skills.ts`: each `SkillDef` now carries a `category` (Research & planning / Code quality / Delivery / Automation), a `tools` list, and a real `workflow` graph (`SkillNode` kinds trigger/context/agent/tool/decision/loop/output + `SkillEdge` with an optional `back` flag for loop returns). Added a **pure, unit-tested** `layoutWorkflow` (longest-path layered layout; fan-outs splay and centre; back edges ignored for layering) → `LaidOutNode` x/y. New left-rail **Skills** view (`SkillsView`, `View='skills'` + `WandIcon` nav entry + command-palette "Go to Skills"): searchable category-grouped list (goal ★) on the left; on the right the selected skill's header (category/background-agent chips, tools), a **Use in chat** button (`store.sendToChat(template)`), and a **WorkflowCanvas** rendering the graph on a dotted node-editor canvas — node cards with colour-coded type borders + glyphs, bezier connectors with arrowheads, branch labels, and dashed return arrows for loops. 10 new core tests (66 total). Verified over the web edition: all 11 skills grouped correctly, `/research` fan-out splays to 3 parallel Search nodes, `/goal` shows the decision + dashed "no" loop back to "Do the work"; CDP screenshots captured (preview screenshot tool still hangs on the SPA — used the headless-Chrome fallback). `nav.skills` i18n added.

### Release
- [x] **T78** — **Released v0.3.0.** Bumped root/desktop/server to 0.3.0, pushed the backlog to `nekko-labs/open-paw` main, tagged `v0.3.0` → Release workflow (win/mac/linux installers → draft GitHub Release) + Docker workflow (GHCR image). First release carrying T66 (IDE surfaces), T72 (inline comments), T73 (design board), T74–77 (Command Center rework, cost, tasks, skills), and connector official icons + validate-on-connect. Pending creds (non-blocking): npm publish of `open-paw`/`opaw`, code-signing/notarization, one-click Gmail/Drive OAuth.
