# Agent Instructions

This repository contains a markdown-first backlog manager. Agents working in this repo must follow the backlog workflow and prompt contract before making backlog-related changes.

## Required prompt

Before doing any backlog grooming, backlog authoring, backlog schema edits, backlog migration work, new backlog creation, or agent-launch workflow changes, read:

- [docs/UX_PRODUCT_OWNER_PROMPT.md](/home/mark/Programs/agent-backlog/docs/UX_PRODUCT_OWNER_PROMPT.md)
- [docs/BACKLOG_STRUCTURE.md](/home/mark/Programs/agent-backlog/docs/BACKLOG_STRUCTURE.md)

Treat the Paula prompt as the canonical product-owner brief, and treat `docs/BACKLOG_STRUCTURE.md` as the canonical backlog template, migration guide, and working-rules document.

## What this means in practice

- If you are asked to groom, rewrite, split, prioritize, or maintain backlog stories, first read the Paula prompt.
- Follow the canonical backlog template, lane structure, required fields, and migration notes in [docs/BACKLOG_STRUCTURE.md](/home/mark/Programs/agent-backlog/docs/BACKLOG_STRUCTURE.md).
- Make frequent formatting passes over the backlog when you work on it. Normalize headings, lane placement, epic placement, field order, and checklist formatting so the file stays canonical and easy to parse.
- If an older backlog file does not match the current template, use the migration guidance in the canonical guide before editing it.
- Changes to the backlog format are not allowed unless the canonical guide is updated first. Do not invent alternate schemas, hidden metadata, new sections, new mandatory fields, tables, YAML frontmatter, or field renames.
- Keep the backlog markdown file as the source of truth.

## Repo-local backlog

The local sample backlog for this repo lives at:

- [backlog/codex-agile-backlog.md](/home/mark/Programs/agent-backlog/backlog/codex-agile-backlog.md)

Use that file for repo-local backlog work unless the user explicitly points the app at a different backlog file.
