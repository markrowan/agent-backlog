# agent-backlog

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
- Effort: 1 | 2 | 3
- Sprint Assigned: Sprint name
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

## BACKLOG-025 - Reverse sprint order in sprint selectors
- Status: Inbox
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:34:48.000Z
- Due Date: 
- Priority: P2
- Effort: 1
- Sprint Assigned: 
- Ready for Implementation?: No
- Tech handoff owner: Unassigned
- Summary: Reverse the displayed sprint order in the filter bar Sprint selector and the current sprint chooser so the newest sprint appears first.
- Outcome / user value: Users can reach the most recent sprint faster and scan sprint choices in a more natural current-to-past order.
- Scope notes: In scope, reversing the visible option order in both sprint-selection controls and keeping the two controls consistent. Out of scope, renaming sprints, changing sprint-assignment behavior, or redefining how sprint values are stored.
- Acceptance criteria:
  - [ ] The Sprint selector in the filter bar lists available sprints in reverse of the current order.
  - [ ] The current sprint chooser uses the same reversed sprint order as the filter bar selector.
  - [ ] The reversed ordering places the newest or highest-numbered sprint first when sprint names follow the existing sequential naming pattern.
  - [ ] Reversing the option order does not change which sprint is currently assigned to any story.
- Dependencies: sprint selector rendering, current sprint chooser rendering, sprint ordering rule.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## Grooming

### Epic 2, Agent-driven backlog maintenance

## BACKLOG-002 - Surface Codex agent session status in the UI
- Status: Grooming
- Owner: Paula Product
- Requester: repo-local backlog seed
- Date added: 2026-04-13
- Updated: 
- Due Date: 
- Priority: P1
- Effort: 1
- Sprint Assigned: 
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

## BACKLOG-006 - Add auto Sprint planning button
- Status: Grooming
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T20:43:59.000Z
- Due Date: 
- Priority: P1
- Effort: 2
- Sprint Assigned: 
- Ready for Implementation?: No
- Tech handoff owner: Unassigned
- Summary: Define the end-to-end Auto Sprint flow so it can be implemented as smaller, sequenced stories with automatic application behavior.
- Outcome / user value: Keeps the sprint-planning request coherent while breaking delivery into smaller slices with less implementation risk and no ambiguity about whether the plan is only suggestive or immediately applied.
- Scope notes: In scope, the product definition for Auto Sprint, the implementation sequence, the automatic-apply behavior, and dependencies between child stories. Out of scope, shipping the entire experience in one ticket.
- Acceptance criteria:
  - [ ] The Auto Sprint request is split into smaller stories with one primary outcome each.
  - [ ] The child stories cover UI entry, planning logic, and post-apply feedback.
  - [ ] The sequencing makes it clear what should be built before the feature can be marked complete.
- Dependencies: BACKLOG-007, BACKLOG-008, BACKLOG-009.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## BACKLOG-011 - Launch grooming chat from new request intake
- Status: Grooming
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T20:45:01.000Z
- Due Date: 
- Priority: P1
- Effort: 2
- Sprint Assigned: 
- Ready for Implementation?: No
- Tech handoff owner: Unassigned
- Summary: Kick off a Paula grooming conversation after a new plain-text request is submitted and automatically open the chat window when needed.
- Outcome / user value: Moves users directly from rough idea capture into guided backlog grooming without forcing manual setup steps.
- Scope notes: In scope, starting the grooming flow from intake submission, opening the chat window automatically if it is closed, and passing the captured request into the Paula conversation context. Out of scope, building a general-purpose chat product beyond the intake-triggered grooming flow.
- Acceptance criteria:
  - [ ] After a new request is submitted, Paula grooming starts automatically from that request text.
  - [ ] If the chat window is closed, it opens automatically so the user can see the grooming process.
  - [ ] The first grooming context clearly reflects the submitted plain-text request.
  - [ ] The flow does not require the user to manually copy the request into chat after using quick-add intake.
- Dependencies: BACKLOG-010, Paula agent launch flow, chat window state handling.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## BACKLOG-012 - Accept feedback-widget text as backlog intake
- Status: Grooming
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T20:45:01.000Z
- Due Date: 
- Priority: P2
- Effort: 2
- Sprint Assigned: 
- Ready for Implementation?: No
- Tech handoff owner: Unassigned
- Summary: Let incoming feedback-widget messages feed the same plain-text intake and grooming path as manually entered requests.
- Outcome / user value: Reduces duplicate triage work by turning raw user feedback into backlog intake without re-entry.
- Scope notes: In scope, routing incoming feedback-widget text into the same intake structure, preserving the original wording as source context, and triggering the same grooming path used for manual entry. Out of scope, advanced feedback deduplication or analytics dashboards.
- Acceptance criteria:
  - [ ] Feedback-widget messages can populate the same intake path used by the Inbox quick-add flow.
  - [ ] The backlog preserves enough source context that Paula can distinguish direct user feedback from manually entered requests.
  - [ ] Feedback-originated intake can trigger the same grooming chat flow without extra manual steps.
  - [ ] The intake path remains consistent so manual and feedback-driven requests behave predictably.
- Dependencies: BACKLOG-010, BACKLOG-011, feedback widget message source.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## BACKLOG-019 - Define ticket-to-branch traceability without changing backlog schema
- Status: Grooming
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:21:40.000Z
- Due Date: 
- Priority: P1
- Effort: 2
- Sprint Assigned: Sprint 3
- Ready for Implementation?: No
- Tech handoff owner: Unassigned
- Summary: Define the overall ticket traceability approach and split the work into smaller stories that preserve the fixed markdown backlog schema.
- Outcome / user value: Product and tech teams get a coherent plan for ticket-to-branch traceability without turning one broad request into an ambiguous implementation ticket.
- Scope notes: In scope, the parent product definition, sequencing, and smaller child stories for storage, UI behavior, workflow expectations, and legacy backlog handling. Out of scope, changing the canonical backlog template by adding new mandatory fields.
- Acceptance criteria:
  - [ ] The traceability request is split into smaller stories with one primary outcome each.
  - [ ] The child stories cover storage or derivation, ticket UI behavior, team workflow, and existing backlog handling.
  - [ ] The sequence makes it clear which decisions must be made before implementation work can be marked ready.
- Dependencies: BACKLOG-020, BACKLOG-021, BACKLOG-022, BACKLOG-023.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## BACKLOG-020 - Define where PR URLs and commit hashes live
- Status: Grooming
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:28:28.000Z
- Due Date: 
- Priority: P1
- Effort: 2
- Sprint Assigned: Sprint 3
- Ready for Implementation?: No
- Tech handoff owner: Unassigned
- Summary: Decide where remote branch or commit links and PR URLs should be stored or derived so ticket traceability works without changing the fixed markdown backlog schema.
- Outcome / user value: Engineers and product owners can rely on one consistent source for clickable remote git links and PR destinations instead of ad hoc conventions.
- Scope notes: In scope, choosing whether traceability should live in existing markdown fields, external metadata, or derived integration data while preserving the current backlog schema, and clarifying support for remote providers such as GitHub, GitLab, or similar hosts. Out of scope, adding new mandatory backlog fields.
- Acceptance criteria:
  - [ ] The chosen approach identifies where each ticket's remote branch or commit link comes from.
  - [ ] The chosen approach identifies where each ticket's PR URL comes from.
  - [ ] The approach preserves the current markdown backlog schema without adding new required fields.
  - [ ] The approach defines what happens when a ticket has no remote branch or commit link yet and when it has no PR URL yet.
- Dependencies: backlog schema constraints, implementation workflow agreement.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## BACKLOG-021 - Show ticket branch links when traceability exists
- Status: Grooming
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:28:28.000Z
- Due Date: 
- Priority: P1
- Effort: 1
- Sprint Assigned: Sprint 3
- Ready for Implementation?: No
- Tech handoff owner: Unassigned
- Summary: Show clickable remote git branch or commit links on a ticket when traceability data exists and expose the PR URL as a separate destination.
- Outcome / user value: Users can jump directly from a backlog ticket to the relevant remote branch or commit and also open the related PR without hunting through external tools.
- Scope notes: In scope, visibility rules, click behavior, and empty-state behavior for remote git links and PR links across providers such as GitHub, GitLab, or similar hosts. Out of scope, changing the full ticket layout or exposing raw developer metadata by default.
- Acceptance criteria:
  - [ ] Tickets show a clickable git affordance only when a remote branch or commit link is available.
  - [ ] Activating the git affordance opens the configured remote branch or commit URL for that ticket.
  - [ ] The related PR URL is available as a separate clickable destination when a PR exists.
  - [ ] Tickets without traceability data do not show misleading inactive git or PR affordances.
- Dependencies: BACKLOG-020, ticket detail UI.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## BACKLOG-022 - Define team workflow for ticket-to-branch traceability
- Status: Grooming
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:28:28.000Z
- Due Date: 
- Priority: P1
- Effort: 2
- Sprint Assigned: Sprint 3
- Ready for Implementation?: No
- Tech handoff owner: Unassigned
- Summary: Define how product and tech teams keep each ticket tied to a remote branch or commit link and to the PR URL during delivery.
- Outcome / user value: Traceability stays current in real work instead of depending on cleanup after the fact.
- Scope notes: In scope, ownership, timing, and minimum expectations for linking tickets to implementation work during active delivery. Out of scope, full release-process redesign.
- Acceptance criteria:
  - [ ] The workflow defines who is responsible for creating or associating the remote branch or commit link for a ticket.
  - [ ] The workflow defines who is responsible for associating the PR URL for a ticket.
  - [ ] The workflow defines when the remote git link and PR URL should be added or updated during implementation.
  - [ ] The workflow defines what should happen when implementation starts without an available remote branch or commit link yet and before a PR exists.
- Dependencies: BACKLOG-020, cross-team workflow agreement.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## BACKLOG-023 - Handle existing backlogs for ticket traceability
- Status: Grooming
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:21:40.000Z
- Due Date: 
- Priority: P2
- Effort: 2
- Sprint Assigned: Sprint 3
- Ready for Implementation?: No
- Tech handoff owner: Unassigned
- Summary: Define how existing backlog files should behave on first load when ticket traceability support is introduced without requiring forbidden schema migration.
- Outcome / user value: Older backlogs remain usable and predictable instead of breaking or mutating unexpectedly when traceability support is added.
- Scope notes: In scope, first-load behavior for older backlogs, missing-data defaults, and any non-destructive enrichment approach that preserves the current markdown schema. Out of scope, forced markdown migrations that add new required fields to old files.
- Acceptance criteria:
  - [ ] The product definition explains what users see on first load for existing backlogs that lack traceability data.
  - [ ] Existing backlog files remain valid without forced schema migration.
  - [ ] Any enrichment or derivation behavior is non-destructive to the original backlog markdown.
- Dependencies: BACKLOG-020, legacy backlog compatibility rules.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## Ready

### Epic 3, Future UX and workflow polish

## BACKLOG-003 - Add saved board views for common backlog review modes
- Status: Ready
- Owner: Paula Product
- Requester: repo-local backlog seed
- Date added: 2026-04-13
- Updated: 2026-04-13T21:10:23.430Z
- Due Date: 
- Priority: P3
- Effort: 1
- Sprint Assigned: 
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Let each user save and switch between common personal board views like all epics, single epic, and ready-only review.
- Outcome / user value: Faster backlog triage without reconfiguring the board each time, without forcing one user’s preferred views onto others.
- Scope notes: In scope, lightweight named views saved per user, switching between saved views, and preserving the currently selected filter set inside a saved view. Out of scope, shared team views, custom dashboards, or markdown mutations.
- Acceptance criteria:
  - [ ] A user can save and switch between at least three personal backlog review views.
  - [ ] Selecting a saved view changes the visible story set without mutating the markdown source.
  - [ ] Saved views created by one user do not appear automatically for other users.
- Dependencies: Board filtering model, per-user preference storage, UX validation.
- Links: local UX backlog
- Implementation notes: Leave blank until the item is `Ready` or in execution

### Epic 2, Agent-driven backlog maintenance

## BACKLOG-007 - Add Auto Sprint controls to the Sprint panel
- Status: Ready
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:08:59.000Z
- Due Date: 
- Priority: P1
- Effort: 1
- Sprint Assigned: Sprint 2
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Add a visible Auto Sprint entry point in the current Sprint panel with a simple total-effort input and backlog-scope choice.
- Outcome / user value: Gives users a fast, understandable way to trigger automatic sprint population without leaving the current planning context.
- Scope notes: In scope, action placement, label clarity, integer effort input, and a clear choice between current filtered context and broader backlog scope before running Auto Sprint. Out of scope, the selection algorithm and applied-results rendering details.
- Acceptance criteria:
  - [ ] The current Sprint panel shows an Auto Sprint action in a place users can discover during sprint planning.
  - [ ] Users can enter a simple integer total-effort cap before running Auto Sprint.
  - [ ] Users can choose whether Auto Sprint should use the current filtered backlog context or the broader backlog.
  - [ ] The UI prevents obviously invalid input such as empty, non-numeric, or zero effort values.
- Dependencies: Current Sprint panel UX, backlog filtering context.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## BACKLOG-008 - Generate dependency-aware Auto Sprint proposals
- Status: Ready
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:08:59.000Z
- Due Date: 
- Priority: P1
- Effort: 2
- Sprint Assigned: Sprint 2
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Have Paula select the highest-priority eligible backlog items up to a user-set total effort cap while respecting dependencies and automatically applying the result to the sprint.
- Outcome / user value: Produces a realistic sprint selection faster than manual triage, reduces the chance that blocked work is chosen, and removes the extra step of manually applying the chosen set.
- Scope notes: In scope, priority-based selection, effort-cap enforcement, optional use of current filters, automatic sprint application for selected items, and exclusion or explanation of blocked items. Out of scope, sophisticated capacity planning beyond the single effort cap.
- Acceptance criteria:
  - [ ] Auto Sprint evaluates either the current filtered backlog set or the broader backlog based on the user’s selection.
  - [ ] Auto Sprint selects the highest-priority eligible items without exceeding the entered total effort cap.
  - [ ] Items with unresolved dependencies are excluded from selection or returned with a clear blocking reason.
  - [ ] When Auto Sprint completes successfully, the selected stories are assigned to the target sprint automatically rather than waiting for a separate manual apply step.
  - [ ] The selection rules are consistent enough that the same input context yields the same proposal.
- Dependencies: BACKLOG-007, backlog filtering context, Paula agent invocation, dependency interpretation rules.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## BACKLOG-009 - Show ordered Auto Sprint apply results
- Status: Ready
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:11:17.240Z
- Due Date: 
- Priority: P2
- Effort: 1
- Sprint Assigned: Sprint 2
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Present Auto Sprint results as an ordered summary of what was applied so users can see which stories were added to the sprint and why others were excluded.
- Outcome / user value: Helps users trust the automatic action by showing what changed, what order makes sense for execution, and which items stayed out of the sprint.
- Scope notes: In scope, ordered applied items, visible total effort used, and clear explanation for unselected blocked or over-cap items after Auto Sprint runs. Out of scope, a separate approval gate before sprint assignment.
- Acceptance criteria:
  - [ ] After Auto Sprint runs, the UI shows the applied stories in a clear implementation order rather than an unordered list.
  - [ ] The result view shows the total effort used against the entered cap.
  - [ ] Users can see which high-priority items were not selected because of dependencies or effort limits.
  - [ ] The result clearly distinguishes items that were assigned to the sprint from items that were excluded.
- Dependencies: BACKLOG-008.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## BACKLOG-010 - Add quick-add story intake to the Inbox lane
- Status: Done
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:35:15Z
- Due Date: 
- Priority: P1
- Effort: 1
- Sprint Assigned: Sprint 1
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Add a plus icon at the top of the Inbox lane that opens the existing Paula chat window for quick story intake.
- Outcome / user value: Lets users capture ideas quickly without leaving the board, using the current Paula chat flow instead of a separate manual edit form.
- Scope notes: In scope, Inbox-lane plus icon placement and opening the existing Paula chat window for story intake. Out of scope, a new free-text edit window or detailed story grooming inside the intake control itself.
- Acceptance criteria:
  - [ ] The top of the Inbox lane shows a visible plus icon for adding a new request.
  - [ ] Activating the control opens the existing Paula chat window.
  - [ ] The intake flow is clear enough that a first-time user can understand how to capture a request without extra instruction.
  - [ ] The control does not open the manual story edit window.
- Dependencies: Inbox lane UI, Paula chat window.
- Links: current session request
- Implementation notes: Inbox plus now opens the existing Paula chat panel instead of the manual story editor.

## BACKLOG-013 - Strengthen Paula prompt for feedback synthesis
- Status: Done
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:27:04Z
- Due Date: 
- Priority: P1
- Effort: 1
- Sprint Assigned: Sprint 1
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Update Paula guidance so she combines related feedback into coherent larger stories when appropriate and applies a sharper UX-product lens.
- Outcome / user value: Produces cleaner backlog structure and better story framing from messy incoming feedback, with stronger focus on the details that materially shape user experience.
- Scope notes: In scope, prompt guidance for combining related feedback into coherent stories or epics when that improves backlog quality, and clearer instruction that Paula should act as a UX-focused product owner with exceptional attention to meaningful user-experience details. Out of scope, changing the backlog schema or turning Paula into a coding agent.
- Acceptance criteria:
  - [ ] Paula guidance explicitly allows combining related feedback into larger coherent stories when that is the better backlog shape.
  - [ ] Paula guidance reinforces that she should prioritize UX-critical details rather than superficial polish.
  - [ ] The prompt update preserves Paula’s backlog-only role boundaries and existing markdown-structure rules.
  - [ ] The revised guidance is specific enough to improve backlog grooming quality from raw plain-text feedback.
- Dependencies: Paula prompt maintenance approach, docs/UX_PRODUCT_OWNER_PROMPT.md.
- Links: current session request, docs/UX_PRODUCT_OWNER_PROMPT.md
- Implementation notes: Added explicit guidance to merge related feedback into coherent stories or epics, and to focus on UX-critical details.

## BACKLOG-014 - Add chat undo for the last backlog edit
- Status: Ready
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:09:44.544Z
- Due Date: 
- Priority: P1
- Effort: 2
- Sprint Assigned: 
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Add an Undo action in the chat window that restores the backlog file to the version from before Paula’s most recent backlog edit.
- Outcome / user value: Gives users a fast recovery path when the latest agent-driven backlog edit corrupts the file or makes an obviously bad change.
- Scope notes: In scope, a visible Undo control in the chat window, rollback to the last pre-Paula-edit backlog version, and clear confirmation of what version will be restored. Out of scope, undoing arbitrary user edits, multi-step undo stacks beyond Paula’s most recent edit, and recovery for non-backlog files.
- Acceptance criteria:
  - [ ] The chat window shows an Undo action after Paula changes the backlog file.
  - [ ] Triggering Undo restores the backlog file to the version from before Paula’s most recent backlog edit.
  - [ ] The UI makes it clear that Undo affects the selected backlog file only.
  - [ ] Users receive a clear success or failure result after the rollback attempt.
  - [ ] If no reversible Paula backlog edit exists, the UI explains why Undo is unavailable.
- Dependencies: Chat window state, backlog file versioning or backup strategy, message-to-write tracking.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## BACKLOG-015 - Render Paula chat output as clean Paula-only messages
- Status: Done
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:26:00.000Z
- Due Date: 
- Priority: P0
- Effort: 2
- Sprint Assigned: Sprint 1
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Show only properly formatted Paula responses in the chat stream instead of leaking raw Codex output lines or mixing in the user’s own prompt text.
- Outcome / user value: Keeps the grooming chat readable and trustworthy so users see one clean Paula voice instead of noisy agent internals.
- Scope notes: In scope, filtering or parsing chat output so only intended Paula-visible lines render as Paula bubbles, preserving the `PAULA>>` contract, and preventing echoed user prompt text from appearing as Paula output. Out of scope, redesigning the entire chat UI or changing Paula’s backlog-only role.
- Acceptance criteria:
  - [x] Chat bubbles for Paula render only content intended for the user-facing Paula response.
  - [x] Raw Codex output lines that do not begin with `PAULA>>` do not appear as Paula chat bubbles.
  - [x] The user’s own submitted prompt text is not mixed into Paula response bubbles.
  - [x] If malformed agent output is received, the UI fails in a way that is clearly non-destructive and does not corrupt the visible conversation.
- Dependencies: Chat transcript parsing, Paula output contract enforcement, agent message transport.
- Links: current session request
- Implementation notes: AgentTerminal now ignores non-`PAULA>>` lines, drops echoed user request variants, and suppresses malformed output fragments before rendering chat bubbles.

### Epic 1, Markdown-first backlog workflow

## BACKLOG-004 - Keep the backlog board synced with markdown file changes
- Status: Ready
- Owner: Paula Product
- Requester: repo-local backlog seed
- Date added: 2026-04-13
- Updated: 2026-04-13T21:08:59.000Z
- Due Date: 
- Priority: P0
- Effort: 2
- Sprint Assigned: Sprint 2
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Update the board automatically when the markdown backlog changes on disk, including edits made outside the UI.
- Outcome / user value: The board stays trustworthy even when agents or editors modify the source file directly.
- Scope notes: In scope, file watching and full client refresh of all visible board regions when the backlog file changes on disk, including Kanban lanes and the current Sprint pane. Out of scope, collaborative presence or diff visualization.
- Acceptance criteria:
  - [ ] External edits to the markdown file refresh the visible board automatically.
  - [ ] UI edits and external edits converge on the same board state without manual refresh.
  - [ ] Story counts, lane contents, and the current Sprint pane all update from the changed backlog file without requiring a filter toggle or other manual nudge.
  - [ ] Changes made by Paula or other external processes appear in the same rendered board state users would see after a forced refresh.
- Dependencies: file watcher, client update mechanism.
- Links: server/index.ts, src/App.tsx
- Implementation notes: Server-sent events now broadcast backlog changes from the server-side file watcher so the board refreshes when the markdown source changes.

## BACKLOG-016 - Show a file-open error notice instead of a blank page
- Status: Done
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:37:00Z
- Due Date: 
- Priority: P0
- Effort: 1
- Sprint Assigned: Sprint 1
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Replace the blank white failure state shown for an invalid backlog path with a clear notification that the file cannot be opened.
- Outcome / user value: Users understand immediately why the backlog did not load and are not stranded in an empty-looking screen with an unhelpful retry action.
- Scope notes: In scope, handling the file-open failure state for previously valid paths that now return `ENOENT`, showing clear explanatory copy, and avoiding a blank white page presentation. Out of scope, building a full file-picker recovery flow or automatic path repair.
- Acceptance criteria:
  - [x] When the selected backlog file path no longer exists, the UI shows a visible notification or error state that clearly says the file cannot be opened.
  - [x] The failure state does not present as a blank white page.
  - [x] The message gives users enough context to understand that the stored file path is now invalid.
  - [x] Any recovery action shown is more informative than a generic Retry-only button.
  - [ ] Any recovery action shown is more informative than a generic Retry-only button.
- Dependencies: backlog file open flow, error-state UI.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## BACKLOG-017 - Show open or done story counts in epic selector
- Status: Done
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:43:00Z
- Due Date: 
- Priority: P1
- Effort: 1
- Sprint Assigned: Sprint 1
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Add per-epic story counts to the epic selector so users can see whether each epic still has open work or is fully done.
- Outcome / user value: Users can scan epic progress directly in the selector and avoid opening each epic just to understand whether work remains.
- Scope notes: In scope, appending `Open (N)` when an epic still has non-done stories and `Done (N)` when every story in that epic is done. Out of scope, adding separate progress bars, percentages, or filtering changes.
- Acceptance criteria:
  - [x] Each epic option in the selector shows a count label.
  - [x] If an epic has one or more non-done stories, the label uses the form `Open (N)` where `N` is the number of non-done stories in that epic.
  - [x] If all stories in an epic are in `Done`, the label uses the form `Done (N)` where `N` is the number of done stories in that epic.
  - [x] The counts update when backlog story statuses change.
- Dependencies: epic selector rendering, backlog status aggregation.
- Links: current session request
- Implementation notes: Implemented in selector labels with live item-status aggregation.

## BACKLOG-018 - Keep selected sprint visible when it becomes empty
- Status: Ready
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:12:54.000Z
- Due Date: 
- Priority: P1
- Effort: 2
- Sprint Assigned: 
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Preserve the currently selected sprint in the sprint selector when its last ticket is removed so the UI does not jump to a different sprint and leave stale assignment context on screen.
- Outcome / user value: Users can intentionally manage an empty sprint without losing context or seeing contradictory sprint state between the selector and the drop-to-assign panel.
- Scope notes: In scope, retaining the selected sprint value after its final ticket is removed when the UI can still represent that empty sprint, refreshing the selector state, and keeping the drop-to-assign panel aligned with the same sprint context. Out of scope, redesigning the sprint model or inventing automatic sprint cleanup rules.
- Acceptance criteria:
  - [ ] When the last ticket is removed from the currently selected sprint, the sprint selector keeps that sprint selected if the UI can represent it.
  - [ ] The UI does not silently jump to the next sprint in the list just because the selected sprint became empty.
  - [ ] After the sprint becomes empty, the sprint selector and the drop-to-assign panel stay in sync about which sprint is currently selected.
  - [ ] The sprint selector refreshes to reflect the current state instead of showing stale sprint options or stale selected value behavior.
- Dependencies: sprint selector state management, sprint assignment panel state.
- Links: current session request
- Implementation notes: Leave blank until the item is `Ready` or in execution

## BACKLOG-024 - Show epic name above story title in Current Sprint
- Status: Done
- Owner: Paula Product
- Requester: current session
- Date added: 2026-04-13
- Updated: 2026-04-13T21:43:00.000Z
- Due Date: 
- Priority: P2
- Effort: 1
- Sprint Assigned: Sprint 1
- Ready for Implementation?: Yes
- Tech handoff owner: Ben
- Summary: Show each story’s epic name as a muted label above the story title in the Current Sprint view.
- Outcome / user value: Users can scan sprint context faster and understand related work grouping without opening each ticket.
- Scope notes: In scope, rendering the epic name above the story title in the Current Sprint area with subdued visual treatment such as grey text. Out of scope, changing story grouping logic or adding new epic filters.
- Acceptance criteria:
  - [x] Each story card in the Current Sprint view shows its epic name above the main story title.
  - [x] The epic name uses a visually subdued style so the story title remains the primary label.
  - [x] Stories without an epic do not render misleading placeholder text in the epic-label position.
  - [x] Adding the epic label does not make the story title harder to read or identify.
- Dependencies: Current Sprint card rendering, epic metadata availability.
- Links: current session request
- Implementation notes: Implemented as a muted epic label above the title in Current Sprint; blank epics are omitted.

## In Progress

## Done

### Epic 1, Markdown-first backlog workflow

## BACKLOG-005 - Build a minimal Kanban backlog manager for markdown files
- Status: Done
- Owner: Paula Product
- Requester: repo bootstrap
- Date added: 2026-04-13
- Updated: 
- Due Date: 
- Priority: P0
- Effort: 3
- Sprint Assigned: 
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
