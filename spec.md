# Open Paw — Spec

> **What & why.** This file captures the vision, the users, and the requirements for
> the current wave of work. The matching **How** and the concrete, checkable work items
> live in [executionplan.md](executionplan.md).
>
> The **canonical, comprehensive** product spec — every feature across every wave — lives
> in the workspace at `obsurdian/projects/open-paw/spec.md`. This in-repo spec focuses on
> the current IDE-surfaces wave plus the next two features.

## Vision

Open Paw is a local-first AI coding & cowork desktop app (Electron + React). The aim
of this wave is to close the gap with full agentic IDEs (Cursor, Devin, cmux, Claude
Code) on the surfaces that matter for *staying in the app*: viewing and editing files,
reviewing AI-made changes, browsing a live preview, and writing better prompts — all
without leaving the calm single-window experience.

## Working process (applies to all future work)

- **Plan before building.** Every new piece of work starts by adding a human-readable
  execution checklist to [executionplan.md](executionplan.md) *before* code is written.
- **Human-readable first.** Checklist items read like plain product statements. Any
  technical detail goes as **indented sub-bullets** under the friendly item — never as
  the top-line.
- Keep [spec.md](spec.md) / [executionplan.md](executionplan.md) in sync as work
  lands; check items off in executionplan.md as they ship.

## Users

- **Solo developers** running local or cloud models who want one window for chat,
  terminals, files, diffs, and a browser preview.
- **Prompt-conscious users** who want help writing stronger prompts and picking the
  right model — a differentiator we can market.

## Features in this wave

### 1. Built-in file viewer (fix: clicking a spec doc does nothing)
- Clicking a spec/plan/tasks row (or its ↗) must open the file **inside the app**, not
  hand off to the OS (`shell.openPath` silently fails when no app is registered for
  `.md`).
- A file opens as a **pane** in the workbench (alongside chats and terminals), so it can
  be split side-by-side. Markdown renders; code shows as text; both are viewable and
  editable.

### 2. Split viewing: markdown, code, and an integrated browser
- The workbench gains two new pane kinds: a **file pane** (markdown preview / code
  editor) and a **browser pane** (an integrated Chromium view with a URL bar).
- Inspired by Claude Code / cmux / Cursor: code-left, preview/browser-right is the
  default mental model; any pane can be split out.

### 3. Hoverable context inspector
- Each section of the Context Inspector explains itself on mouse-over (what the source
  is, why it's included, how to control it) — turning the provenance panel into a
  teaching surface.

### 4. VS Code–style file/folder explorer (not a full IDE)
- A collapsible file tree for each project with **file-type icons** (color-coded by
  extension, special-cased filenames like `package.json`, `Dockerfile`).
- Click to open in a file pane; **edit and save in-app** so users don't have to leave.

### 5. Diff & approval system for file changes (Devin-style)
- When the agent changes files, the user can **review a diff** and **approve (keep)** or
  **reject (revert)** changes at **line**, **file**, or **all-files** granularity.
- A "Changes" panel lists every file the agent touched this session.

### 6. Prompt analyzer (marketing edge)
- A live, zero-latency analyzer in the composer that **identifies the parts** of a prompt
  (role, task, context, examples, output format, constraints…), **underlines weak spots**
  inline, gives a **health score**, and suggests improvements + a **model recommendation**.
- Modeled on PromptLint's diagnostics approach (client-side, no API cost), with an
  optional LLM-powered "Improve" escalation later.

## Newest features (shipped)

### 7. Inline editor comments ✅
- In the file editor, a **+** appears on each line (a scroll-synced gutter); clicking it opens
  an inline comment the agent picks up. The comment carries its file + line context and
  persists as a gutter marker (in `comments.json`) until resolved.
- Two actions: **Add to prompt** (queue the comment into the composer so several
  annotations batch into one ask) and **Run now** (dispatch it immediately to the active
  chat). A bottom dock lists a line's comments with re-send / resolve. Turns in-place review
  notes into agent work without leaving the file.

### 8. Design board (Figma-style) ✅
- A **Design** tab laying out the app's UI pages as snapshots on a zoomable board, like a
  Figma canvas. v1: read-only **live** snapshots — each card is a scaled, non-interactive
  `<iframe>` of the page (no capture infra), so it reflects the app as it actually renders.
- Click a card to add **persistent notes** (saved with the board) or **comments** that feed
  the prompt — the same **Add to prompt / Run now** actions as inline comments.
- As the agent edits the UI, previews **reload so you watch the design update live**; an
  **"updating" indicator** flags pages being changed and clicking it jumps to the driving
  agent's chat.

## Command Center, automation & skills (shipped)

### 9. Command Center polish — empty states + cost breakdowns
- Every visual metric has a **friendly empty-state placeholder** (a faded skeleton chart +
  a line of guidance) instead of a blank space when there's no data yet.
- A **Cost** section: this-month **actual** spend + a **projection** to month-end, an
  **all-time** total, a **daily-spend chart**, a **per-agent breakdown** (bar list, accurate
  to the model each session used), and a collapsible **token-pricing reference** (USD / 1M
  tokens, from published list prices). Local models are $0; everything is labelled an
  estimate. Costs are computed in the host from the usage log (`bySessionCost`, `daily.cost`,
  `totalCost`).

### 10. Tasks & scheduled work (reworked dashboard)
- The old "Background tasks & agents" board (which really just listed model servers) is split:
  model servers / MCP / relay now live under **Services & model servers**, and a new **Tasks
  & scheduled work** section shows real automation: **scheduled** (run once at a time),
  **recurring** (every interval), and **background** (long-running agents that stay alive
  **forever** or **until a condition** the agent judges met). Each card shows cadence, status,
  run count, last result, and Run-now / Pause-Resume / Open-chat / Delete actions; the list
  updates live as tasks fire.
- Backed by a host **scheduler** (`tasks.ts` + `tasks.json`) that fires due tasks through the
  normal agent loop, reusing one chat session per task so background agents keep context.

### 11. Automate menu in the agent window
- A **⚡ Automate** button in each chat creates a scheduled / recurring / background task,
  pre-filled with the chat's project, model, and current draft. Background tasks choose
  **keep alive forever** or **until a condition**.

### 12. Skills in the `/` menu (+ goal)
- The composer's `/` menu now lists **skills** — the standard capabilities any agent can run
  (research, plan, review, security-review, simplify, test, explain, fix, commit, pr) —
  above the user's saved prompts. Picking one drops its scaffold into the composer.
- **`goal` is a highlighted (★) skill**: `/goal <condition>` starts a long-running
  **background agent** that keeps working until the condition is met (a real "work until done"
  loop), surfaced in the Tasks dashboard.

## Decisions & rationale (made autonomously; revisit if desired)

- **Open files in-app instead of the OS.** Matches the "stay in the app" goal and fixes
  the dead click. The OS hand-off (`openPath`) is kept only as a fallback / "reveal".
- **Browser pane uses Electron `<webview>`** for v1 (DOM-flow, simplest to place inside
  splittable panes). `WebContentsView` is more robust but requires main-process bounds
  syncing across split groups — deferred. (See executionplan.md.)
- **Editor is a lightweight textarea** (mono, save-on-demand), not CodeMirror/Monaco —
  honors the "simple, not a full IDE" goal and the project's small-dependency footprint.
  Markdown gets a rendered preview via the existing zero-dep `Markdown` renderer.
- **Diff/approve works by snapshotting** a file's original content the first time the
  agent modifies it in a session, then diffing current-vs-original. Writes still happen
  immediately (no disruption to the agent loop); "reject" reverts. This avoids gating the
  blocking tool loop while still giving a full review/revert UX.
- **Prompt analyzer is fully client-side** (regex/structural heuristics) so it's instant,
  offline, and free — the marketable "always-on" feel. LLM rewrite is a later opt-in.
- **File icons** use a single tinted glyph + a small curated category set, mapped by a
  JSON `{filename/extension → {icon,color}}` table (react-file-icon / Material Icon Theme
  model) — tiny asset footprint.

## Non-goals
- Not a full IDE (no language servers, no debugger, no Monaco).
- No multi-cursor / refactoring tooling.
- Browser pane is a preview/utility surface, not a hardened general web browser.
- Design board is read-only snapshots in v1, not an editable vector canvas.
