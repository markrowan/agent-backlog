# Canonical Backlog Template and Working Rules

This document is the single source of truth for the markdown backlog format used by this repo.

Agents must follow this guide when they:

- groom or rewrite backlog stories
- create a new backlog file
- change backlog workflow wording
- consider any template or schema change

The markdown backlog file stays the durable source of truth. Do not introduce hidden metadata, alternate schemas, YAML frontmatter, tables, renamed required fields, or silent format forks.

## Canonical structure

- The backlog begins with a short workflow preamble.
- Lane sections are top-level `##` headings named exactly:
  - `Inbox`
  - `Grooming`
  - `Ready`
  - `In Progress`
  - `Testing`
  - `Review`
  - `Done`
- Epic groupings inside a lane use `### Epic ...` headings.
- Stories use `## BACKLOG-XXX - Title` headings.
- Every story keeps the required fields in the canonical order shown below.

## Required fields per story

Every story must include these fields exactly:

- `Status`
- `Owner`
- `Requester`
- `Date added`
- `Updated`
- `Due Date`
- `Priority`
- `Effort`
- `Sprint Assigned`
- `Ready for Implementation?`
- `Tech handoff owner`
- `Summary`
- `Outcome / user value`
- `Scope notes`
- `Acceptance criteria`
- `Dependencies`
- `Blocked`
- `Git commit`
- `Git PR URL`
- `Links`
- `Implementation notes`

## Working rules for agents

- Keep the backlog markdown file as the source of truth.
- Preserve field names, field order, lane names, and story heading format.
- Keep `Updated` in full ISO UTC format, for example `2026-04-15T17:04:25.482Z`.
- Leave `Due Date` present even when blank.
- Use `Ready for Implementation?: Yes` only when scope and acceptance criteria are implementation-ready.
- Do not invent unsupported statuses, sections, or schema variants for older files.
- If a backlog file is older than the current template, follow the migration notes below before editing it.

## Canonical starter template

New backlog creation must use this exact starter, with only the title and output filename adapted for the project.

<!-- CANONICAL_BACKLOG_TEMPLATE_START -->
~~~md
# {{PROJECT_NAME}}

This file is the durable repo backlog for `{{PROJECT_NAME}}`.

## Workflow
- Paula Product owns backlog intake, grooming, and prioritization.
- New feature discussions, backlog requests, and product changes must be captured here before implementation.
- Items in `Inbox` or `Grooming` are not implementation-ready.
- Once Paula marks an item `Ready`, engineering can implement it with clear scope and acceptance criteria.
- Keep this file as the repo source of truth for backlog state.

## Status lanes

### Inbox
Use for raw ideas, requests, and unresolved feature discussions.

### Grooming
Use for items Paula is clarifying, scoping, or prioritizing.

### Ready
Use for items Paula has scoped well enough for implementation. Every `Ready` item should have `Ready for Implementation?: Yes` plus clear scope notes and acceptance criteria.

### In Progress
Use for items currently being implemented.

### Testing
Use for items under active test or verification.

### Review
Use for items waiting on review or sign-off.

### Done
Use for completed items with outcome notes.

## Item template

```md
## BACKLOG-XXX - Title
- Status: Inbox | Grooming | Ready | In Progress | Testing | Review | Done
- Owner: Paula Product
- Requester: Name or source thread
- Date added: YYYY-MM-DD
- Updated: YYYY-MM-DDTHH:MM:SS.sssZ
- Due Date: YYYY-MM-DD
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
- Blocked: Current blocker in plain language, otherwise blank
- Git commit: Commit SHA, ref, or commit URL when delivery exists, otherwise blank
- Git PR URL: Pull request URL when one exists, otherwise blank
- Links: Issue, PR, docs, chat thread, artifacts
- Implementation notes: Leave blank until the item is `Ready` or in execution
```

---

## Inbox

## Grooming

## Ready

## In Progress

## Testing

## Review

## Done
~~~
<!-- CANONICAL_BACKLOG_TEMPLATE_END -->

## Migration notes

### Current template baseline

The current canonical template includes these workflow lanes:

- `Inbox`
- `Grooming`
- `Ready`
- `In Progress`
- `Testing`
- `Review`
- `Done`

It also requires the `Due Date` field and the full required field list above.

### Which older backlogs are affected

Older backlog files are affected when they do any of the following:

- omit `Testing` or `Review` from the lane scaffold
- omit `Due Date`
- use older preambles or starter text that do not match the canonical template
- contain hand-edited structure drift that changes lane headings, required fields, or field order

### Safe adoption steps for older backlog files

Before editing an older backlog file:

1. Read this guide first.
2. Inspect the target backlog for missing lanes or missing required fields.
3. Add only the canonical missing pieces from this guide.
4. Preserve existing story IDs, history, and meaning while normalizing structure.
5. Do not reinterpret old fields into new custom schema variants.
6. Do not silently reshuffle active work into new statuses without an explicit migration decision.
7. If the file needs structural normalization, do that first, then make the requested story edits.

### Rules when the template changes again

Whenever the canonical template changes in future:

1. Update this document first.
2. Add a short migration note that says what changed.
3. Name which older backlog files are affected.
4. Describe the exact safe adoption steps agents must follow before editing those files.
5. Update the new-project bootstrap path to keep using the same canonical starter.

If those steps are not done, agents should treat the template change as incomplete and avoid inventing local fixes.
