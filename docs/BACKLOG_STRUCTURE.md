# Backlog Structure

This app treats the markdown file as the durable source of truth.

## Canonical structure

- The file begins with a free-form preamble that explains workflow, lanes, and the item template.
- Lane sections are top-level `##` headings named exactly `Inbox`, `Grooming`, `Ready`, `In Progress`, and `Done`.
- Epic groupings inside a lane use `### Epic ...` headings.
- Stories are top-level `## BACKLOG-XXX - Title` headings inside a lane section.

## Required fields per story

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
- `Links`
- `Implementation notes`

## Write safety rules

- The UI reads the latest file version before every write.
- Writes are rejected on version mismatch so agent edits and UI edits do not silently clobber each other.
- Successful writes are atomic: write temp file, copy backup, rename into place.
- Serialization stays canonical so agents can edit the file directly without reverse-engineering hidden state.
