import fs from "node:fs/promises";
import path from "node:path";
import {
  BacklogDocument,
  BacklogItem,
  EFFORTS,
  HANDOFF_OWNERS,
  PRIORITIES,
  STATUSES,
  Status,
} from "./types.js";

export const BACKLOG_FILE = process.env.BACKLOG_FILE?.trim() || null;

let currentBacklogFile: string | null = BACKLOG_FILE;

const LANE_HEADINGS = new Set(STATUSES.map((status) => `## ${status}`));

const TEMPLATE_PREAMBLE = `# backlog

This file is the durable repo backlog source of truth.

## Workflow
- Product owns backlog intake, grooming, and prioritization.
- Keep this file as the repo source of truth for backlog state.

## Status lanes

### Inbox
Use for raw ideas, requests, and unresolved feature discussions.

### Grooming
Use for items being clarified, scoped, or prioritized.

### Ready
Use for items scoped well enough for implementation.

### In Progress
Use for items currently being implemented, reviewed, or deployed.

### Done
Use for completed items with outcome notes.

## Item template

\`\`\`md
## BACKLOG-XXX - Title
- Status: Inbox | Grooming | Ready | In Progress | Done
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
- Links: Issue, PR, docs, chat thread, artifacts
- Implementation notes: Leave blank until the item is Ready or in execution
\`\`\`

---`;

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function parseField(line: string): { key: string; value: string } | null {
  const match = line.match(/^- ([^:]+):\s?(.*)$/);
  if (!match) return null;
  return { key: match[1].trim(), value: match[2].trim() };
}

function safeStatus(value: string): Status {
  return (STATUSES.find((status) => status === value) ?? "Inbox") as Status;
}

function safePriority(value: string): BacklogItem["priority"] {
  return (PRIORITIES.find((priority) => priority === value) ?? "P2") as BacklogItem["priority"];
}

function safeEffort(value: string): BacklogItem["effort"] {
  const numeric = Number(value);
  return (EFFORTS.find((effort) => effort === numeric) ?? 2) as BacklogItem["effort"];
}

function safeHandoffOwner(value: string): BacklogItem["techHandoffOwner"] {
  return (
    HANDOFF_OWNERS.find((owner) => owner === value) ?? "Unassigned"
  ) as BacklogItem["techHandoffOwner"];
}

function toItem(blockLines: string[], epic: string): BacklogItem | null {
  const heading = blockLines[0]?.match(/^##\s+(BACKLOG-\d+)\s+-\s+(.+)$/);
  if (!heading) return null;

  const fields = new Map<string, string>();
  const acceptanceCriteria: string[] = [];

  for (let index = 1; index < blockLines.length; index += 1) {
    const line = blockLines[index];
    const parsed = parseField(line);
    if (parsed) {
      fields.set(parsed.key, parsed.value);
      continue;
    }

    if (line.startsWith("  - [ ] ")) {
      acceptanceCriteria.push(line.replace("  - [ ] ", "").trim());
    }
  }

  return {
    id: heading[1],
    title: heading[2].trim(),
    status: safeStatus(fields.get("Status") ?? "Inbox"),
    epic,
    owner: fields.get("Owner") ?? "Paula Product",
    requester: fields.get("Requester") ?? "",
    dateAdded: fields.get("Date added") ?? "",
    lastUpdated: fields.get("Updated") ?? "",
    dueDate: fields.get("Due Date") ?? "",
    priority: safePriority(fields.get("Priority") ?? "P2"),
    effort: safeEffort(fields.get("Effort") ?? "2"),
    sprintAssigned: fields.get("Sprint Assigned") ?? "",
    readyForBen: fields.get("Ready for Implementation?") === "Yes" ? "Yes" : "No",
    techHandoffOwner: safeHandoffOwner(fields.get("Tech handoff owner") ?? "Unassigned"),
    summary: fields.get("Summary") ?? "",
    outcome: fields.get("Outcome / user value") ?? "",
    scopeNotes: fields.get("Scope notes") ?? "",
    acceptanceCriteria,
    dependencies: fields.get("Dependencies") ?? "",
    links: fields.get("Links") ?? "",
    implementationNotes: fields.get("Implementation notes") ?? "",
  };
}

export function parseBacklog(rawInput: string): BacklogDocument {
  const raw = normalizeLineEndings(rawInput);
  const lines = raw.split("\n");
  const firstLaneIndex = lines.findIndex((line) => LANE_HEADINGS.has(line.trim()));
  const preamble =
    firstLaneIndex >= 0
      ? lines.slice(0, firstLaneIndex).join("\n").trim()
      : TEMPLATE_PREAMBLE;

  const items: BacklogItem[] = [];
  let currentLane: Status | null = null;
  let currentEpic = "Unassigned";
  let currentBlock: string[] = [];

  const flushCurrent = () => {
    if (currentBlock.length === 0) return;
    const item = toItem(currentBlock, currentEpic);
    if (item) {
      item.status = currentLane ?? item.status;
      items.push(item);
    }
    currentBlock = [];
  };

  for (const line of lines.slice(firstLaneIndex >= 0 ? firstLaneIndex : 0)) {
    const trimmed = line.trim();
    if (LANE_HEADINGS.has(trimmed)) {
      flushCurrent();
      currentLane = safeStatus(trimmed.replace(/^##\s+/, ""));
      currentEpic = "Unassigned";
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushCurrent();
      currentEpic = trimmed.replace(/^###\s+/, "").trim();
      continue;
    }

    if (trimmed.startsWith("## BACKLOG-")) {
      flushCurrent();
      currentBlock = [trimmed];
      continue;
    }

    if (currentBlock.length > 0) {
      currentBlock.push(line);
    }
  }

  flushCurrent();

  const titleMatch = preamble.match(/^#\s+(.+)$/m);

  return {
    title: titleMatch?.[1]?.trim() ?? "backlog",
    preamble,
    items,
  };
}

export function getBacklogFile() {
  return currentBacklogFile;
}

export function setBacklogFile(nextPath: string | null) {
  currentBacklogFile = nextPath?.trim() || null;
}

function requireBacklogFile() {
  if (!currentBacklogFile) {
    const error = new Error("No backlog file is currently loaded.") as Error & { code?: string };
    error.code = "NO_BACKLOG_LOADED";
    throw error;
  }
  return currentBacklogFile;
}

function slugifyProjectName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

export function backlogDisplayName(document: BacklogDocument, filePath: string) {
  const title = document.title?.trim();
  if (title && title.toLowerCase() !== "backlog") {
    return title;
  }
  return path.basename(filePath);
}

function formatItem(item: BacklogItem): string {
  const acceptance =
    item.acceptanceCriteria.length > 0
      ? item.acceptanceCriteria.map((criterion) => `  - [ ] ${criterion}`).join("\n")
      : "  - [ ] Define acceptance criteria";

  return [
    `## ${item.id} - ${item.title}`,
    `- Status: ${item.status}`,
    `- Owner: ${item.owner}`,
    `- Requester: ${item.requester}`,
    `- Date added: ${item.dateAdded}`,
    `- Updated: ${item.lastUpdated}`,
    `- Due Date: ${item.dueDate}`,
    `- Priority: ${item.priority}`,
    `- Effort: ${item.effort}`,
    `- Sprint Assigned: ${item.sprintAssigned}`,
    `- Ready for Implementation?: ${item.readyForBen}`,
    `- Tech handoff owner: ${item.techHandoffOwner}`,
    `- Summary: ${item.summary}`,
    `- Outcome / user value: ${item.outcome}`,
    `- Scope notes: ${item.scopeNotes}`,
    `- Acceptance criteria:`,
    acceptance,
    `- Dependencies: ${item.dependencies}`,
    `- Links: ${item.links}`,
    `- Implementation notes: ${item.implementationNotes}`,
  ].join("\n");
}

export function serializeBacklog(document: BacklogDocument): string {
  const sections = STATUSES.map((status) => {
    const items = document.items.filter((item) => item.status === status);
    const epicMap = new Map<string, BacklogItem[]>();

    for (const item of items) {
      const key = item.epic.trim() || "Unassigned";
      const bucket = epicMap.get(key) ?? [];
      bucket.push(item);
      epicMap.set(key, bucket);
    }

    const epicBlocks = Array.from(epicMap.entries()).map(([epic, epicItems]) => {
      const header = epic !== "Unassigned" ? `### ${epic}\n\n` : "";
      const body = epicItems
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((item) => formatItem(item))
        .join("\n\n");
      return `${header}${body}`;
    });

    return [`## ${status}`, ...epicBlocks].filter(Boolean).join("\n\n").trim();
  });

  return `${document.preamble.trim()}\n\n${sections.join("\n\n")}\n`;
}

export function createBacklogTemplate(projectName: string) {
  const safeName = projectName.trim() || "backlog";
  return `# ${safeName}

This file is the durable repo backlog for \`${safeName}\`.

## Workflow
- Paula Product owns backlog intake, grooming, and prioritization.
- New feature discussions, backlog requests, and product changes must be captured here before implementation.
- Items in \`Inbox\` or \`Grooming\` are not implementation-ready.
- Once Paula marks an item \`Ready\`, engineering can implement it with clear scope and acceptance criteria.
- Keep this file as the repo source of truth for backlog state.

## Status lanes

### Inbox
Use for raw ideas, requests, and unresolved feature discussions.

### Grooming
Use for items Paula is clarifying, scoping, or prioritizing.

### Ready
Use for items Paula has scoped well enough for implementation. Every \`Ready\` item should have \`Ready for Implementation?: Yes\` plus clear scope notes and acceptance criteria.

### In Progress
Use for items currently being implemented, reviewed, or deployed.

### Done
Use for completed items with outcome notes.

## Item template

\`\`\`md
## BACKLOG-XXX - Title
- Status: Inbox | Grooming | Ready | In Progress | Done
- Owner: Paula Product
- Requester: Name or source thread
- Date added: YYYY-MM-DD
- Updated: YYYY-MM-DD
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
- Implementation notes: Leave blank until the item is \`Ready\` or in execution
\`\`\`

---

## Inbox

## Grooming

## Ready

## In Progress

## Done
`;
}

export async function createBacklogInFolder(folderPath: string) {
  const folderName = path.basename(folderPath);
  const projectName = folderName.replace(/[-_]+/g, " ").trim() || "backlog";
  const fileName = `${slugifyProjectName(folderName || "backlog") || "backlog"}-backlog.md`;
  const filePath = path.join(folderPath, fileName);
  await fs.writeFile(filePath, createBacklogTemplate(projectName), { flag: "wx", encoding: "utf8" });
  return filePath;
}

export async function readBacklogFile() {
  const filePath = requireBacklogFile();
  const raw = await fs.readFile(filePath, "utf8");
  const stat = await fs.stat(filePath);
  const document = parseBacklog(raw);
  return {
    path: filePath,
    displayName: backlogDisplayName(document, filePath),
    version: stat.mtimeMs,
    raw,
    document,
  };
}

export async function writeBacklog(document: BacklogDocument, expectedVersion: number) {
  const current = await readBacklogFile();
  if (Math.trunc(current.version) !== Math.trunc(expectedVersion)) {
    const error = new Error("Version conflict");
    (error as Error & { code?: number; latest?: ReturnType<typeof parseBacklog> }).code = 409;
    (error as Error & { latest?: ReturnType<typeof parseBacklog> }).latest = current.document;
    throw error;
  }

  const serialized = serializeBacklog(document);
  const filePath = requireBacklogFile();
  const directory = path.dirname(filePath);
  const basename = path.basename(filePath);
  const tempPath = path.join(directory, `.${basename}.tmp`);
  const backupPath = path.join(directory, `.${basename}.bak`);

  await fs.writeFile(tempPath, serialized, "utf8");
  await fs.copyFile(filePath, backupPath);
  await fs.rename(tempPath, filePath);

  const stat = await fs.stat(filePath);
  return {
    path: filePath,
    displayName: backlogDisplayName(document, filePath),
    version: stat.mtimeMs,
    document: parseBacklog(serialized),
  };
}

export function nextBacklogId(items: BacklogItem[]): string {
  const highest = items.reduce((max, item) => {
    const numeric = Number(item.id.replace("BACKLOG-", ""));
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  }, 0);
  return `BACKLOG-${String(highest + 1).padStart(3, "0")}`;
}

export async function updateBacklogTitle(nextTitle: string, expectedVersion: number) {
  const current = await readBacklogFile();
  if (Math.trunc(current.version) !== Math.trunc(expectedVersion)) {
    const error = new Error("Version conflict");
    (error as Error & { code?: number }).code = 409;
    throw error;
  }

  const normalizedTitle = nextTitle.trim() || "backlog";
  const raw = current.raw.replace(/^#\s+.*$/m, `# ${normalizedTitle}`);
  const document = parseBacklog(raw);
  return writeBacklog(document, expectedVersion);
}
