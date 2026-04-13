# Codex Agile Backlog Manager

Minimal React backlog manager with a local API that reads and writes a markdown backlog file safely.

## What it does

- Reads a markdown backlog file from disk when one is opened.
- Parses lanes, epics, and backlog stories.
- Displays stories in a minimalist Kanban board.
- Lets you create and edit stories from the UI.
- Writes changes back to markdown atomically with version checks.
- Ships with a prompt for a UX-focused product owner agent who maintains the same file directly.

## Run

```bash
npm install
./bin/backlog-manager BACKLOG.md
```

If you launch without an argument, the UI starts with no backlog loaded and you can open or create one from the interface.

This starts:

- Vite on `http://localhost:5173`
- The local API on `http://localhost:4177`
