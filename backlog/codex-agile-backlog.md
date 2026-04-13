# codex-agile backlog

This file is the durable repo backlog for `CodexAgile`.

## Workflow
- Paula Product owns backlog intake, grooming, and prioritization.
- New backlog requests and product changes should be captured here before implementation.
- Items in `Inbox` or `Grooming` are not implementation-ready.
- The markdown file remains the source of truth for backlog state.

## Status lanes

### Inbox
Use for raw ideas, requests, and unresolved feature discussions.

### Grooming
Use for items Paula is clarifying, scoping, or prioritizing.

### Ready
Use for items Paula has scoped well enough for implementation. Every `Ready` item should have `Ready for Implementation?: Yes` plus clear scope notes and acceptance criteria.

### In Progress
Use for items currently being implemented, reviewed, or deployed.

### Done
Use for completed items with outcome notes.

## Item template

```md
## BACKLOG-XXX - Title
- Status: Inbox | Grooming | Ready | In Progress | Done
- Owner: Paula Product
- Requester: Name or source thread
- Date added: YYYY-MM-DD
- Last updated: YYYY-MM-DD
- Priority: P0 | P1 | P2 | P3
- Ready for Implementation?: No | Yes
- Tech handoff owner: Unassigned | Ben | Tess | Dave
- Summary: One-sentence description of the request
- Outcome / user value: Why this matters
- Scope notes: In scope / out of scope / open questions
- Acceptance criteria:
  - [ ] Specific observable outcome
- Dependencies: Systems, approvals, or blocking tickets
- Links: Issue, PR, docs, chat thread, artifacts
- Implementation notes: Leave blank until the item is `Ready` or in execution
```

---

## Inbox

### Epic 3, Future UX and workflow polish

## BACKLOG-003 - Add saved board views for common backlog review modes
- Status: Inbox
- Owner: Paula Product
- Requester: repo-local backlog seed
- Date added: 2026-04-13
- Last updated: 2026-04-13
- Priority: P2
- Ready for Implementation?: No
- Tech handoff owner: Unassigned
- Summary: Let users switch quickly between views like all epics, single epic, and ready-only review.
- Outcome / user value: Faster backlog triage without reconfiguring the board each time.
- Scope notes: In scope, lightweight saved filters or named views. Out of scope, full custom dashboarding.
- Acceptance criteria:
  - [ ] Users can switch between at least three useful backlog review views.
  - [ ] The selected view changes the visible story set without mutating the markdown source.
- Dependencies: Board filtering model, UX validation.
- Links: local UX backlog
- Implementation notes: Leave blank until the item is `Ready` or in execution

## Grooming

### Epic 1, Markdown-first backlog workflow

## BACKLOG-001 - Make repo-local backlog the default launch target
- Status: Grooming
- Owner: Paula Product
- Requester: repo setup
- Date added: 2026-04-13
- Last updated: 2026-04-13
- Priority: P1
- Ready for Implementation?: No
- Tech handoff owner: Unassigned
- Summary: Default the launcher to the repo-local backlog so the app works out of the box without an external file path.
- Outcome / user value: Faster first run and less friction when using this repo standalone.
- Scope notes: In scope, launcher defaults and README updates. Out of scope, removing support for external backlog targets.
- Acceptance criteria:
  - [ ] Running the launcher with no arguments opens the repo-local backlog.
  - [ ] Users can still override the backlog path explicitly.
- Dependencies: launcher script, README.
- Links: bin/backlog-manager, README.md
- Implementation notes: Leave blank until the item is `Ready` or in execution

### Epic 2, Agent-driven backlog maintenance

## BACKLOG-002 - Surface Codex agent session status in the UI
- Status: Grooming
- Owner: Paula Product
- Requester: repo-local backlog seed
- Date added: 2026-04-13
- Last updated: 2026-04-13
- Priority: P1
- Ready for Implementation?: No
- Tech handoff owner: Unassigned
- Summary: Show whether a Codex backlog agent was launched successfully and whether it is still running.
- Outcome / user value: Better confidence when using Paula-driven backlog maintenance from the UI.
- Scope notes: In scope, minimal session state or launch feedback. Out of scope, building a full chat interface.
- Acceptance criteria:
  - [ ] The UI indicates whether the latest Paula launch succeeded.
  - [ ] Failure states are clear when `codex` is unavailable or exits early.
- Dependencies: agent launch endpoint, process tracking approach.
- Links: server/index.ts, docs/UX_PRODUCT_OWNER_PROMPT.md
- Implementation notes: Leave blank until the item is `Ready` or in execution

## Ready

### Epic 1, Markdown-first backlog workflow

## BACKLOG-004 - Keep the backlog board synced with markdown file changes
- Status: Ready
- Owner: Paula Product
- Requester: repo-local backlog seed
- Date added: 2026-04-13
- Last updated: 2026-04-13
- Priority: P0
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Update the board automatically when the markdown backlog changes on disk, including edits made outside the UI.
- Outcome / user value: The board stays trustworthy even when agents or editors modify the source file directly.
- Scope notes: In scope, file watching and client refresh on change. Out of scope, collaborative presence or diff visualization.
- Acceptance criteria:
  - [ ] External edits to the markdown file refresh the visible board automatically.
  - [ ] UI edits and external edits converge on the same board state without manual refresh.
- Dependencies: file watcher, client update mechanism.
- Links: server/index.ts, src/App.tsx
- Implementation notes: Server-sent events now broadcast backlog changes from the server-side file watcher so the board refreshes when the markdown source changes.

## In Progress

## Done

### Epic 1, Markdown-first backlog workflow

## BACKLOG-005 - Build a minimal Kanban backlog manager for markdown files
- Status: Done
- Owner: Paula Product
- Requester: repo bootstrap
- Date added: 2026-04-13
- Last updated: 2026-04-13
- Priority: P0
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Create a minimal React backlog manager that reads and writes a markdown backlog file safely through a local API.
- Outcome / user value: Gives the repo a working backlog tool that stays aligned with agent-edited markdown.
- Scope notes: In scope, Kanban lanes, story editing, safe writes, and agent launch controls. Out of scope, multi-user auth and heavyweight project-management features.
- Acceptance criteria:
  - [ ] The app reads a markdown backlog and renders stories by lane and epic.
  - [ ] UI edits are written back safely to the markdown file.
  - [ ] Users can trigger a Paula Product Codex agent from the UI.
- Dependencies: React UI, local API, markdown parser/serializer.
- Links: src/App.tsx, server/backlog.ts, server/index.ts
- Implementation notes: Completed with a React board, safe markdown serialization, a launcher script, epic filtering, and automatic refresh from file changes.
