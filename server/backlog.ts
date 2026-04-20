import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Storage } from "@google-cloud/storage";
import {
  BacklogDocument,
  BacklogItem,
  EFFORTS,
  HANDOFF_OWNERS,
  PRIORITIES,
  STATUSES,
  Status,
} from "./types.js";
import { hostingConfig } from "./hosting.js";

export const BACKLOG_FILE = process.env.BACKLOG_FILE?.trim() || null;

let currentBacklogFile: string | null = hostingConfig.hostedMode ? hostingConfig.backlogObjectPath : BACKLOG_FILE;
const gcsStorage = hostingConfig.hostedMode ? new Storage() : null;

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
Use for items currently being implemented.

### Testing
Use for items under active test or verification.

### Review
Use for items waiting on review or sign-off.

### Done
Use for completed items with outcome notes.

## Item template

\`\`\`md
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
- Implementation notes: Leave blank until the item is Ready or in execution
\`\`\`

---`;

const CANONICAL_TEMPLATE_DOC_PATH = path.resolve(process.cwd(), "docs/BACKLOG_STRUCTURE.md");

function loadCanonicalTemplateBlock() {
  try {
    const guide = readFileSync(CANONICAL_TEMPLATE_DOC_PATH, "utf8");
    const match = guide.match(/<!-- CANONICAL_BACKLOG_TEMPLATE_START -->\s*(?:```|~~~)md\n([\s\S]*?)\n(?:```|~~~)\s*<!-- CANONICAL_BACKLOG_TEMPLATE_END -->/);
    return match?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

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

function getGitRemoteUrl() {
  const result = spawnSync("git", ["config", "--get", "remote.origin.url"], { encoding: "utf8" });
  const raw = result.status === 0 ? result.stdout.trim() : "";
  if (!raw) return "";
  if (raw.startsWith("git@")) {
    const match = raw.match(/^git@([^:]+):(.+)$/);
    if (!match) return raw;
    return `https://${match[1]}/${match[2].replace(/\.git$/, "")}`;
  }
  return raw.replace(/\.git$/, "");
}

function resolveGitUrl(reference: string, source: "branch" | "commit" | "unknown") {
  const remote = getGitRemoteUrl();
  if (!remote || !reference) return "";
  if (source === "commit") return `${remote}/commit/${encodeURIComponent(reference)}`;
  if (source === "branch") return `${remote}/tree/${encodeURIComponent(reference)}`;
  return remote;
}

function parseTraceability(rawLinks: string, gitCommit = "") {
  const explicitCommit = gitCommit.trim();
  if (explicitCommit) {
    if (/^https?:\/\/\S+$/i.test(explicitCommit)) {
      return {
        gitUrl: explicitCommit,
        status: "linked" as const,
        source: "commit" as const,
        reference: explicitCommit,
      };
    }
    const source = (/^[0-9a-f]{7,40}$/i.test(explicitCommit) ? "commit" : "branch") as "commit" | "branch";
    const gitUrl = resolveGitUrl(explicitCommit, source);
    return { gitUrl, status: gitUrl ? ("linked" as const) : ("pending" as const), source, reference: explicitCommit };
  }
  const lines = rawLinks.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*(git|branch|commit)\s*[:=-]\s*(\S.*)$/i);
    if (!match) continue;
    const label = match[1].toLowerCase();
    const reference = match[2].trim();
    const source = (label === "commit" ? "commit" : label === "branch" ? "branch" : "unknown") as
      | "branch"
      | "commit"
      | "unknown";
    const gitUrl = resolveGitUrl(reference, source);
    return { gitUrl, status: gitUrl ? ("linked" as const) : ("pending" as const), source, reference };
  }
  return { gitUrl: "", status: "pending" as const, source: "unknown" as const, reference: "" };
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
  const links = fields.get("Links") ?? "";
  const gitCommit = fields.get("Git commit") ?? fields.get("Git Commit") ?? "";
  return {
    id: heading[1],
    title: heading[2].trim(),
    status: safeStatus(fields.get("Status") ?? "Inbox"),
    lane:
      safeStatus(fields.get("Status") ?? "Inbox") === "Blocked"
        ? "In Progress"
        : safeStatus(fields.get("Status") ?? "Inbox"),
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
    blocked: fields.get("Blocked") ?? "",
    gitCommit,
    gitPrUrl: fields.get("Git PR URL") ?? "",
    links,
    implementationNotes: fields.get("Implementation notes") ?? "",
    traceability: parseTraceability(links, gitCommit),
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
      // Trust the explicit story field when it is present; lane placement may be stale.
      item.status = item.status ?? currentLane ?? "Inbox";
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
  const normalized = nextPath?.trim() || null;
  if (hostingConfig.hostedMode) {
    currentBacklogFile = normalized || hostingConfig.backlogObjectPath;
    return;
  }
  currentBacklogFile = normalized;
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
    `- Blocked: ${item.blocked}`,
    `- Git commit: ${item.gitCommit}`,
    `- Git PR URL: ${item.gitPrUrl}`,
    `- Links: ${item.links}`,
    `- Implementation notes: ${item.implementationNotes}`,
  ].join("\n");
}

export function serializeBacklog(document: BacklogDocument): string {
  const laneStatuses = STATUSES.filter((status) => status !== "Blocked");
  const sections = laneStatuses.map((status) => {
    const items = document.items.filter((item) => (item.lane ?? item.status) === status);
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
  const canonicalTemplate = loadCanonicalTemplateBlock();
  if (canonicalTemplate) {
    return canonicalTemplate.replaceAll("{{PROJECT_NAME}}", safeName);
  }

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
Use for items currently being implemented.

### Testing
Use for items under active test or verification.

### Review
Use for items waiting on review or sign-off.

### Done
Use for completed items with outcome notes.

## Item template

\`\`\`md
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
- Implementation notes: Leave blank until the item is \`Ready\` or in execution
\`\`\`

---

## Inbox

## Grooming

## Ready

## In Progress

## Testing

## Review

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
  const source = await readBacklogSource(filePath);
  const document = parseBacklog(source.raw);
  return {
    path: source.path,
    displayName: backlogDisplayName(document, source.path),
    version: source.version,
    raw: source.raw,
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
  const version = await writeBacklogSource(filePath, serialized, Math.trunc(expectedVersion));
  return {
    path: filePath,
    displayName: backlogDisplayName(document, filePath),
    version,
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

export async function restorePreviousBacklogVersion() {
  const filePath = requireBacklogFile();
  if (isGcsPath(filePath)) {
    const [bucketName, objectName] = splitGcsPath(filePath);
    const backupFile = requireGcsStorage().bucket(bucketName).file(`${objectName}.bak`);

    const [exists] = await backupFile.exists();
    if (!exists) {
      const error = new Error("No reversible Paula backlog edit exists yet.") as Error & { code?: string };
      error.code = "NO_BACKUP_AVAILABLE";
      throw error;
    }

    const [backupRawBuffer] = await backupFile.download();
    const backupRaw = backupRawBuffer.toString("utf8");
    if (!backupRaw.trim()) {
      const error = new Error("The saved backup is empty and cannot be restored.") as Error & { code?: string };
      error.code = "NO_BACKUP_AVAILABLE";
      throw error;
    }

    const targetFile = requireGcsStorage().bucket(bucketName).file(objectName);
    await backupFile.copy(targetFile);
    const [metadata] = await targetFile.getMetadata();

    return {
      path: filePath,
      displayName: path.basename(filePath),
      version: Number(metadata.generation ?? Date.parse(String(metadata.updated ?? "")) ?? Date.now()),
      document: parseBacklog(backupRaw),
    };
  }

  const directory = path.dirname(filePath);
  const basename = path.basename(filePath);
  const backupPath = path.join(directory, `.${basename}.bak`);

  try {
    await fs.access(backupPath);
  } catch {
    const error = new Error("No reversible Paula backlog edit exists yet.") as Error & { code?: string };
    error.code = "NO_BACKUP_AVAILABLE";
    throw error;
  }

  const backupRaw = await fs.readFile(backupPath, "utf8");
  if (!backupRaw.trim()) {
    const error = new Error("The saved backup is empty and cannot be restored.") as Error & { code?: string };
    error.code = "NO_BACKUP_AVAILABLE";
    throw error;
  }

  const tempPath = path.join(directory, `.${basename}.undo.tmp`);
  await fs.writeFile(tempPath, backupRaw, "utf8");
  await fs.rename(tempPath, filePath);

  const stat = await fs.stat(filePath);
  return {
    path: filePath,
    displayName: path.basename(filePath),
    version: stat.mtimeMs,
    document: parseBacklog(backupRaw),
  };
}

const SPRINT_SUMMARY_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "beside", "by", "for", "from", "if", "in", "into", "is", "it", "its",
  "of", "on", "or", "so", "that", "the", "their", "this", "to", "up", "with", "when", "while", "without",
  "story", "stories", "ticket", "tickets", "backlog", "sprint", "paula", "user", "users", "current", "selected",
  "selector", "summary", "line", "plain", "language", "show", "shows", "showing", "add", "adds", "added", "make",
  "makes", "making", "keep", "keeps", "keeping", "fix", "fixes", "fixed", "support", "supports", "supporting",
  "update", "updates", "updating", "visible", "calm", "clear", "meaningful",
]);

function requireGcsStorage() {
  if (!gcsStorage) {
    throw new Error("Google Cloud Storage is not configured.");
  }
  return gcsStorage;
}

function isGcsPath(filePath: string) {
  return filePath.startsWith("gs://");
}

function splitGcsPath(filePath: string) {
  const normalized = filePath.replace(/^gs:\/\//, "");
  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0) {
    throw new Error("Hosted backlog storage is missing a bucket or object path.");
  }
  return [normalized.slice(0, slashIndex), normalized.slice(slashIndex + 1)] as const;
}

function defaultHostedBacklogName(objectName: string) {
  const baseName = path.basename(objectName).replace(/\.md$/i, "");
  const label = baseName.replace(/[-_]+/g, " ").trim();
  return label || "Hosted backlog";
}

async function ensureHostedBacklogExists(filePath: string) {
  const [bucketName, objectName] = splitGcsPath(filePath);
  const file = requireGcsStorage().bucket(bucketName).file(objectName);
  const [exists] = await file.exists();
  if (exists) {
    return file;
  }

  try {
    await file.save(createBacklogTemplate(defaultHostedBacklogName(objectName)), {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      contentType: "text/markdown; charset=utf-8",
    });
  } catch (error) {
    if ((error as Error & { code?: number }).code !== 412) {
      throw error;
    }
  }

  return file;
}

async function readBacklogSource(filePath: string) {
  if (!isGcsPath(filePath)) {
    const raw = await fs.readFile(filePath, "utf8");
    const stat = await fs.stat(filePath);
    return {
      path: filePath,
      raw,
      version: stat.mtimeMs,
    };
  }

  const file = await ensureHostedBacklogExists(filePath);
  const [rawBuffer] = await file.download();
  const [metadata] = await file.getMetadata();
  return {
    path: filePath,
    raw: rawBuffer.toString("utf8"),
    version: Number(metadata.generation ?? Date.parse(String(metadata.updated ?? "")) ?? Date.now()),
  };
}

async function writeBacklogSource(filePath: string, serialized: string, expectedVersion: number) {
  if (!isGcsPath(filePath)) {
    const directory = path.dirname(filePath);
    const basename = path.basename(filePath);
    const tempPath = path.join(directory, `.${basename}.tmp`);
    const backupPath = path.join(directory, `.${basename}.bak`);

    await fs.writeFile(tempPath, serialized, "utf8");
    await fs.copyFile(filePath, backupPath);
    await fs.rename(tempPath, filePath);

    const stat = await fs.stat(filePath);
    return stat.mtimeMs;
  }

  const [bucketName, objectName] = splitGcsPath(filePath);
  const bucket = requireGcsStorage().bucket(bucketName);
  const liveFile = await ensureHostedBacklogExists(filePath);
  const backupFile = bucket.file(`${objectName}.bak`);
  const [currentContents] = await liveFile.download();

  await backupFile.save(currentContents, {
    resumable: false,
    contentType: "text/markdown; charset=utf-8",
  });
  await liveFile.save(serialized, {
    resumable: false,
    preconditionOpts: { ifGenerationMatch: expectedVersion },
    contentType: "text/markdown; charset=utf-8",
  });

  const [metadata] = await liveFile.getMetadata();
  return Number(metadata.generation ?? Date.parse(String(metadata.updated ?? "")) ?? Date.now());
}

function sentenceCase(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function normaliseSprintPhrase(value: string) {
  return value
    .replace(/BACKLOG-\d+/gi, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(add|build|create|display|explain|fix|improve|keep|make|render|show|support|update)\b/gi, " ")
    .replace(/[^a-z0-9\s/-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseKeywords(value: string) {
  return normaliseSprintPhrase(value)
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.replace(/^[-/]+|[-/]+$/g, ""))
    .filter((part) => part.length >= 3 && !SPRINT_SUMMARY_STOP_WORDS.has(part));
}

function topSprintThemes(items: BacklogItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const weightedTexts: Array<[string, number]> = [
      [item.title, 3],
      [item.summary, 3],
      [item.outcome, 2],
      [item.scopeNotes, 1],
      [item.epic, 1],
    ];

    for (const [text, weight] of weightedTexts) {
      for (const keyword of phraseKeywords(text)) {
        counts.set(keyword, (counts.get(keyword) ?? 0) + weight);
      }
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([keyword]) => keyword.replace(/-/g, " "));
}

function compactItemPhrase(item: BacklogItem) {
  const source = item.summary.trim() || item.outcome.trim() || item.title.trim();
  const normalised = normaliseSprintPhrase(source);
  if (!normalised) return "";
  const words = normalised.split(/\s+/).slice(0, 8);
  return words.join(" ").trim();
}

export function generateSprintGoalSummary(sprint: string, items: BacklogItem[]) {
  const sprintName = sprint.trim();
  if (!sprintName) {
    return {
      state: "empty" as const,
      summary: "Pick a sprint to see its goal summary.",
    };
  }

  if (items.length === 0) {
    return {
      state: "empty" as const,
      summary: "No work is assigned to this sprint yet.",
    };
  }

  const nonDoneItems = items.filter((item) => item.status !== "Done");
  const activeItems = nonDoneItems.length > 0 ? nonDoneItems : items;
  const themes = topSprintThemes(activeItems);
  const leadPhrase = compactItemPhrase(activeItems[0]);

  if (!leadPhrase && themes.length === 0) {
    return {
      state: "empty" as const,
      summary: "This sprint has work assigned, but its goal is not clear enough to summarise yet.",
    };
  }

  if (activeItems.length === 1) {
    return {
      state: "ready" as const,
      summary: sentenceCase(`Focus: ${leadPhrase || themes[0]}.`),
    };
  }

  if (themes.length >= 2) {
    const themeList = themes.length >= 3
      ? `${themes[0]}, ${themes[1]}, and ${themes[2]}`
      : `${themes[0]} and ${themes[1]}`;
    return {
      state: "ready" as const,
      summary: sentenceCase(`Focus: ${themeList}${activeItems.length > 3 ? ` across ${activeItems.length} stories` : ""}.`),
    };
  }

  return {
    state: "ready" as const,
    summary: sentenceCase(`Focus: ${leadPhrase}.`),
  };
}
