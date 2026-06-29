# Open Paw — Execution Plan

> **The plan + the build log, in one file.** Part 1 is the technical plan (architecture, stack, conventions) for the current wave; Part 2 is the task list — what shipped and what's next. (Merged from the former `plan.md` + `tasks.md`.)
>
> The **canonical, comprehensive** product spec + execution plan (every feature across every wave, full shipped history T1–T66, and the Road to v1.0) live in the workspace at `obsurdian/projects/open-paw/spec.md` and `obsurdian/projects/open-paw/executionplan.md`. This in-repo doc tracks the current IDE-surfaces wave plus the next two features.

---

# Part 1 — Plan (how we build it)

> **How.** Architecture, stack, and conventions for the wave described in [spec.md](spec.md).

## Architecture recap

- **Monorepo**: `packages/shared` (types + IPC contract), `packages/core` (agent loop +
  tools), `packages/host` (backend: settings, sessions, terminals, files), and apps
  (`desktop` = Electron, `server`/`cloud` = web editions, `cli`, `relay`, `mobile`).
- **Transport-agnostic host**: every edition wraps the same `Host`. Renderer talks to it
  via `window.nekko` — backed by Electron IPC (desktop) or WebSocket/HTTP (web).
- **Adding any renderer↔host capability** means touching, in order: `shared/ipc.ts`
  (channel + `NekkoApi` type) → `host` impl + `host.ts` interface → `dispatch.ts` →
  `preload/index.ts` (Electron) → `web-client.ts` (web). Keep all five in sync.
- **Workbench panes**: `store.ts` holds `groups: WbGroup[]`, each a column of tabbed
  `WbPane`s. `WbPane.kind` is `'chat' | 'terminal' | 'file' | 'browser' | 'diff'`;
  `WorkbenchView.tsx` routes each kind to a component.

## Feature plans

### 1 + 2. File / browser panes (and the dead-click fix)
- **New pane kinds**: `WbPane.kind` extended to `'chat' | 'terminal' | 'file' | 'browser' | 'diff'`.
  - `WbPane.refId` holds the file path (file/diff) or URL (browser).
- **Store openers**: `openFilePane(path)`, `openBrowserPane(url?)`, `openDiffPane(sessionId)` —
  mirror `openChatPane` (locate-or-create, focus). The diff pane is session-level (reviews
  all of a session's changed files), opened from a `Δ N` button in the chat header.
- **`FilePane` component**: reads the file via the file IPC; `.md` → toggle between rendered
  (`Markdown.tsx`) and source; other text → editable `<textarea>` (mono). Save button +
  Ctrl/Cmd-S → `writeFile`. Dirty indicator. Binary/oversized files show a notice.
- **`BrowserPane` component**: `<webview>` with a URL bar (go / back / forward / reload /
  open-external). Requires `webviewTag: true` in the main `webPreferences`.
- **SpecPanel fix**: the ↗/row click calls `useStore.getState().openFilePane(path)` instead
  of `window.nekko.openPath(path)`; keep an explicit "reveal in OS" affordance.
- **File IPC**: `readFile(path) → {content, truncated, binary}`,
  `writeFile(path, content)`, `listDir(path) → DirEntry[]`. Host implements with `fs`,
  honoring the existing sandbox/jail checks where applicable.

### 3. Hoverable Context Inspector
- Reuse the existing **CSS group-hover tooltip pattern** from `ChatMetrics.tsx` (no new
  dep): a `.group` wrapper + a `.group-hover:block` popover.
- Per-source explanation map (system / memory / attached-file / guideline / connector /
  index-snippet) attached to each section header in `ContextInspector.tsx`.

### 4. File explorer
- **`FileTree` component** in the workbench sidebar (collapsible section per project),
  lazy-loading children via `listDir` on expand.
- **`fileIcons.ts`**: a `{ extension/filename → {color, glyph} }` table + a `FileIcon`
  component (single tinted page glyph; folder open/closed). Colors from the
  Linguist/Material palette.
- Click a file → `openFilePane`. Right-click later for rename/new (deferred).

### 5. Diff & approval
- **Host change-tracking** (`packages/host/src/changes.ts`): keyed by sessionId, record
  `{ path, original }` the first time `write_file`/`edit_file` touches a path in a session
  (hook into `tools.ts`). Expose:
  - `listChanges(sessionId) → ChangeEntry[]` (`{path, original, current, status}`)
  - `revertChange(sessionId, path, lines?)` — write original (or per-line merge) back
  - `acceptChange(sessionId, path)` / `acceptAll` — drop from the pending set
- **`DiffPane` / Changes panel** (renderer): client-side LCS line diff (no dep), added/removed
  lines with per-line keep/revert checkboxes, per-file Approve/Revert, Approve-all / Revert-all.
- Emit a `changesUpdated` event so the panel refreshes as the agent edits.

### 6. Prompt analyzer
- **`promptAnalysis.ts`** (pure, renderer-side, no LLM): given the draft text, return
  `{ parts, findings, score: 'A'..'F', model }`.
  - **Part detection**: role / task / context / examples / output-format / constraints /
    reasoning / tone / variables (regex + structural).
  - **Lint rules** (critical/warn/info): vague terms, weak/passive verbs, missing role,
    missing output format, no examples for extraction tasks, ambiguous pronouns, length,
    long sentences, filler/redundancy, conflicting instructions, secret leak, PII.
  - **Model hint**: multi-step reasoning + large context → frontier; short single-shot → fast/cheap.
- **UI** in the composer (`ChatPane.tsx`): compact bar with the score + part checklist,
  expandable to a grouped findings list; inline underlines over flagged spans. Toggleable.

### 7. Inline editor comments (next)
- In `FilePane`'s mono editor, a gutter **+** on the hovered/active line opens an inline
  comment. Comment carries `{path, line, lineText, comment}`, persists per session (new
  `host/comments.ts` + `comments:add/list/resolve` IPC, five-touch rule). Gutter affordance
  is a textarea overlay (same technique as the analyzer underline) — no new deps.
- **Add to prompt** appends a `> file:line — comment` block to the active pane's composer
  draft (batch several); **Run now** dispatches it immediately via the pane's `sendChat`.

### 8. Design board (next)
- New **Design** view (and/or `WbPane.kind='design'`): a CSS-transform zoom/pan board of
  per-page UI **snapshots** (read-only in v1). Capture via the screenshot/`<webview>` path,
  store under the data dir keyed by route + a per-workspace `design.json`.
- Click a card → side sheet: **persistent notes** (saved to `design.json`) + **comments**
  reusing the Add-to-prompt / Run-now action. On agent file-change events mapping to a page,
  show an **"updating" badge**; re-capture on `done`/`changesUpdated`; badge click →
  `openChatPane(sessionId)`.

## Conventions
- Match existing style: Tailwind + CSS vars (`--ink`, `--surface-2`, `--accent`…), small
  zero-dep components, `title=`/group-hover tooltips, `window.nekko` for all host calls.
- New deps only when unavoidable; prefer in-repo implementations (diff, prompt analysis,
  icons, comments overlay all done/planned without new deps).
- Every change keeps **all workspaces typechecking** (`npm run typecheck`) and the desktop
  **building** (`npm run build`). Commit per feature; land via auto-merged PRs.

## Risks / verification
- The GUI can't be exercised in the headless build environment; changes are verified by
  typecheck + build. Interactive surfaces (webview, drag, diff, analyzer overlay, the
  planned inline comments + design board) need a hands-on pass.
- `<webview>` is discouraged by Electron; acceptable for v1, revisit `WebContentsView`.

---

# Part 2 — Tasks (what's built and what's next)

> Execution checklist. Human-readable items first; technical notes as sub-bullets.
> Check items off as they ship. See [spec.md](spec.md).

## Wave: IDE surfaces + prompt analyzer  ✅ shipped

### Foundation — let the app read & write files
- [x] Add the ability for the app to read a file, save a file, and list a folder
  - `readFile`/`writeFile`/`listDir` IPC wired through shared/host(`files.ts`)/dispatch/preload/web-client
  - `readFile` returns `{ content, truncated, binary }` (1 MB cap, NUL-byte binary detect); `listDir` dirs-first

### Fix — clicking a spec/plan/tasks doc opens it in the app
- [x] Clicking a doc (or its ↗) opens it in a built-in viewer pane, not the OS
  - `SpecPanel.tsx` ↗/row → `openFilePane(path)`; FilePane keeps a "reveal in OS" button

### Built-in viewer: markdown + code + browser
- [x] Open a markdown or code file in a pane and read or edit it — `FilePane.tsx`
  - `.md` rendered (Source/Preview toggle); other text → mono editor; Save + Cmd/Ctrl-S; dirty dot; binary/large notice
- [x] Open an integrated browser pane with a URL bar — `BrowserPane.tsx`
  - `<webview>` + back/forward/reload/open-external; `webviewTag` enabled in main window

### Context inspector explains itself on hover
- [x] Hovering a section/source shows what it is and how to control it
  - `ContextInspector.tsx` `InfoHint` (group-hover popover) on every section + source category

### VS Code–style file/folder explorer
- [x] A collapsible project file tree with file-type icons — `FileTree.tsx` (`ProjectFiles`)
  - lazy children via `listDir`; `fileIcons.tsx` color-tinted chips (Linguist/Material palette)
- [x] Clicking a file opens it; edits save in-app (via FilePane)

### Diff & approval (Devin-style)
- [x] See every file the agent changed this session in one place
  - host `changes.ts` snapshots original on first `write_file`/`edit_file`; `Δ N` button in chat header; live `changesUpdated` event
- [x] Approve or revert per line, per file, or all at once — `DiffPane.tsx`
  - client-side LCS line diff; tick lines → Revert selected; Keep/Revert file; Keep all/Revert all

### Prompt analyzer in the composer
- [x] As you type, identify the parts of your prompt and flag weak spots
  - `promptAnalysis.ts` (pure, no LLM) + `PromptAnalyzer.tsx`: A–F grade, part checklist, inline wavy underlines, suggestions
- [x] Suggests a model based on the prompt (complexity/context heuristic → fast/balanced/frontier)
- [ ] (Later) opt-in "Improve prompt" button → LLM rewrite with before/after diff — deferred

## Wave: editor comments + design board  ✅ shipped

### Inline editor comments
- [x] Drop a **+** comment on a line of code; the agent picks it up
  - gutter **+** overlay in `FilePane` (non-wrapping textarea + scroll-synced line gutter); `host/comments.ts` per-file store persisted to `comments.json` + `comments:list/add/resolve` IPC; commented lines keep a marker until resolved
- [x] Two actions: **Add to prompt** (queue into the composer) and **Run now** (send immediately)
  - both route through a new `store.sendToChat(text, run)` → `composerInbox`, which `ChatPane` consumes (append to draft, or send once the provider is ready); a bottom comment dock shows existing comments with re-send + resolve

### Design board (Figma-style snapshots)
- [x] A **Design** tab showing the app's UI pages as snapshots on a zoom/pan board
  - new left-rail `design` view (`DesignBoardView`); each card is a live, scaled, read-only `<iframe>` of the page (no capture infra needed); zoom slider; `host/design.ts` + `design.json` per workspace; add/remove pages
- [x] Click a page to add **persistent notes** or **comments** (Add to prompt / Run now)
  - side sheet: notes persist to `design.json` (`design:addNote/resolveNote`); comments route to a chat via `sendToChat` carrying page identity
- [x] Watch snapshots update live as the agent works; an **"updating" badge** per page links to the driving agent (`openChatPane`)
  - subscribes to `onAgentEvent`/`onChangesUpdated` filtered to the workspace's sessions; marks pages updating + reloads the iframe previews on change; the badge opens the running agent's chat

## Wave: Command Center, automation & skills  ✅ shipped

### Empty states + cost breakdowns
- [x] Friendly skeleton placeholders for every visual metric with no data yet (`ChartEmpty`)
- [x] **Cost** panel — month actual + projection + all-time, daily-spend chart, per-agent breakdown, token-pricing reference
  - host `usage.ts` now computes `totalCost`, `bySessionCost`, and per-day `cost` (via `estimateCostUSD`); UI hardened against older/missing usage shapes

### Tasks & scheduled work
- [x] Split the old "Background tasks & agents" board → **Services & model servers** (providers/MCP/relay) + a new **Tasks & scheduled work** section
- [x] Host scheduler `tasks.ts` (+ `tasks.json`): scheduled / recurring / background tasks fired through the agent loop, one reused session per task; `tasks:list/create/update/delete/runNow` IPC + `tasksUpdated` event
- [x] Task cards: cadence, status, run count, last result; Run-now / Pause-Resume / Open-chat / Delete; live updates

### Automate menu + skills
- [x] **⚡ Automate** button in the chat header → `ScheduleTaskModal` (scheduled / recurring / background; keep-alive forever or until a condition), pre-filled with the chat's project/model/draft
- [x] `/` menu lists **skills** (`shared/skills.ts`: research, plan, review, security-review, simplify, test, explain, fix, commit, pr) above saved prompts
- [x] **`goal` highlighted (★) skill**: `/goal <condition>` → creates a background "until" task (work-until-done), surfaced in the Tasks dashboard

> Verified end-to-end over the web edition: all six render with empty-state placeholders; created scheduled + background (`/goal`) tasks that persisted and showed in the dashboard; skills menu lists the standard set with goal starred at top. Screenshot captured.

## Verification status
- All eight workspaces typecheck (`npm run typecheck`); desktop builds (`npm run build`); 56 core tests pass.
- **Editor comments + design board verified end-to-end over the web edition**: added a design
  page (live iframe snapshot), pinned a note (round-trips through the host `design.json`),
  routed a page comment via "Add to prompt" into the chat composer; opened a file, confirmed
  the gutter + line numbers, opened the comment dock on a line, persisted a comment
  (`comments.json`), and routed it to the composer. Screenshot captured of the board.
- The earlier IDE-surfaces wave (file editor, browser pane, diff/approve, analyzer) is still
  best exercised with a model connected; the file editor + tree are confirmed via the above.

## Follow-ups / deferred
- "Improve prompt" LLM escalation (before/after diff).
- "Open in external terminal" launcher (from the earlier terminal wave).
- Browser pane on `WebContentsView` instead of `<webview>` (Electron's recommendation).
- File tree: right-click new/rename/delete; markdown scroll-sync; live underline overlay in the textarea.
