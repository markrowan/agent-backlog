# Codex Agile Backlog Manager

Minimal React backlog manager with a local API that reads and writes a markdown backlog file safely.

## What it does

- Reads a markdown backlog file from disk.
- Parses lanes, epics, and backlog stories.
- Displays stories in a minimalist Kanban board.
- Lets you create and edit stories from the UI.
- Writes changes back to markdown atomically with version checks.
- Ships with a prompt for a UX-focused product owner agent who maintains the same file directly.

## Target backlog file

Default path:

`/home/mark/Programs/OpenClaw/workspace/openclaw-docker/backlog/openclaw-docker-backlog.md`

Override with:

`BACKLOG_FILE=/absolute/path/to/backlog.md`

## Run

```bash
npm install
npm run dev
```

This starts:

- Vite on `http://localhost:5173`
- The local API on `http://localhost:4177`

## One-command launcher

```bash
/home/mark/Programs/CodexAgile/bin/backlog-manager /home/mark/Programs/OpenClaw/workspace/openclaw-docker/backlog
```

What it does:

- Resolves the markdown backlog file from the given path.
- Starts the GUI against that file.
- Opens the browser on Linux when `xdg-open` is available.
- Spawns a `codex` backlog-product-owner agent with the bundled prompt when `codex` is installed.

## UX pass

The concept works best when the backlog stays markdown-first and the UI stays intentionally narrow.

- The board only shows what matters at triage speed: priority, story ID, title, summary, owner, readiness.
- Epics are visible as quiet labels inside each lane instead of becoming a second navigation system.
- The editing surface is modal and dense so the board remains calm and readable.
- The visual language avoids generic SaaS defaults: warm paper tones, serif typography, soft glass panels, and restrained motion.
- Drag-and-drop is limited to status movement, because lane changes are the highest-frequency interaction and should be nearly frictionless.

## Files

- [src/App.tsx](/home/mark/Programs/CodexAgile/src/App.tsx)
- [server/backlog.ts](/home/mark/Programs/CodexAgile/server/backlog.ts)
- [docs/UX_PRODUCT_OWNER_PROMPT.md](/home/mark/Programs/CodexAgile/docs/UX_PRODUCT_OWNER_PROMPT.md)
