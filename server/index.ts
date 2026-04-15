import express from "express";
import http from "node:http";
import fs from "node:fs/promises";
import { FSWatcher, watch } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  CONFIG_PATH,
  DEFAULT_AGENT_COMMAND,
  extractCommandBinary,
  readConfig,
  rememberRecentBacklog,
  removeRecentBacklog,
  updateBacklogSprintSummaries,
  updateConfig,
} from "./config.js";
import { WebSocketServer, WebSocket } from "ws";
import pty, { type IPty } from "node-pty";
import {
  createBacklogInFolder,
  generateSprintGoalSummary,
  getBacklogFile,
  nextBacklogId,
  readBacklogFile,
  restorePreviousBacklogVersion,
  setBacklogFile,
  updateBacklogTitle,
  writeBacklog,
} from "./backlog.js";
import { BacklogItem, BacklogDocument, EFFORTS, STATUSES } from "./types.js";

const app = express();
const port = Number(process.env.PORT ?? 4177);
const sseClients = new Set<express.Response>();
let backlogWatcher: FSWatcher | null = null;
let backlogWatchPoll: NodeJS.Timeout | null = null;
let watchedBacklogPath: string | null = null;
let watchedBacklogDirectory: string | null = null;
let watchedBacklogBaseName: string | null = null;
let watchedBacklogVersion: number | null = null;
const server = http.createServer(app);
const wsServer = new WebSocketServer({ server, path: "/api/agent/terminal" });

interface AgentTerminalSession {
  agentCommand: string;
  backlogPath: string;
  id: string;
  process: IPty;
}

interface AutoSprintTask {
  startedAt: number;
  startedVersion: number | null;
  message: string | null;
  sessionId: string | null;
  sawPaulaReply: boolean;
  sawOutput: boolean;
  scope: "filtered" | "all";
  sprint: string;
  status: "idle" | "running" | "completed" | "failed";
}

interface SprintSummaryTask {
  startedAt: number;
  startedVersion: number | null;
  message: string | null;
  status: "idle" | "running" | "completed" | "failed";
  completedSprints: string[];
  failedSprints: string[];
}

interface SprintSummaryResponse {
  sprint: string;
  state: "ready" | "empty" | "failed";
  summary: string;
  suggestedSummary?: string;
  overridden?: boolean;
  ticketIdHash?: string;
  source?: "config" | "fallback";
}

let activeTerminalSession: AgentTerminalSession | null = null;
const terminalClients = new Set<WebSocket>();
let autoSprintTask: AutoSprintTask = {
  startedAt: 0,
  startedVersion: null,
  message: null,
  sessionId: null,
  sawPaulaReply: false,
  sawOutput: false,
  scope: "filtered",
  sprint: "",
  status: "idle",
};
let sprintSummaryTask: SprintSummaryTask = {
  startedAt: 0,
  startedVersion: null,
  message: null,
  status: "idle",
  completedSprints: [],
  failedSprints: [],
};
let autoSprintIdleTimer: NodeJS.Timeout | null = null;

app.use(express.json({ limit: "1mb" }));

function agentCommandAvailable(command: string) {
  const binary = extractCommandBinary(command);
  if (!binary) return false;
  const result = spawnSync("sh", ["-lc", `command -v ${binary}`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function broadcastBacklogChanged() {
  for (const client of sseClients) {
    client.write(`event: backlog-changed
`);
    client.write(`data: ${JSON.stringify({ changed: true, at: Date.now() })}

`);
  }
}

async function refreshWatchedBacklogVersion(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    watchedBacklogVersion = stat.mtimeMs;
    return stat.mtimeMs;
  } catch {
    watchedBacklogVersion = null;
    return null;
  }
}

async function broadcastBacklogChangedIfNeeded() {
  if (!watchedBacklogPath) {
    return;
  }

  try {
    const stat = await fs.stat(watchedBacklogPath);
    if (watchedBacklogVersion === null || stat.mtimeMs !== watchedBacklogVersion) {
      watchedBacklogVersion = stat.mtimeMs;
      broadcastBacklogChanged();
    }
  } catch {
    if (watchedBacklogVersion !== null) {
      watchedBacklogVersion = null;
      broadcastBacklogChanged();
    }
  }
}

function bindBacklogWatcher(filePath: string | null) {
  backlogWatcher?.close();
  backlogWatcher = null;
  if (backlogWatchPoll) {
    clearInterval(backlogWatchPoll);
    backlogWatchPoll = null;
  }
  watchedBacklogPath = null;
  watchedBacklogDirectory = null;
  watchedBacklogBaseName = null;
  watchedBacklogVersion = null;

  if (!filePath) {
    return;
  }

  watchedBacklogPath = filePath;
  watchedBacklogDirectory = path.dirname(filePath);
  watchedBacklogBaseName = path.basename(filePath);

  void refreshWatchedBacklogVersion(filePath);

  backlogWatcher = watch(watchedBacklogDirectory, { persistent: false }, (_eventType, changedName) => {
    const nextName = changedName ? String(changedName) : null;
    if (!watchedBacklogBaseName || (nextName && nextName !== watchedBacklogBaseName)) {
      return;
    }
    void broadcastBacklogChangedIfNeeded();
  });

  backlogWatchPoll = setInterval(() => {
    void broadcastBacklogChangedIfNeeded();
  }, 1500);
}
bindBacklogWatcher(getBacklogFile());
void readConfig();

function broadcastTerminal(payload: object) {
  const message = JSON.stringify(payload);
  for (const client of terminalClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function closeActiveTerminalSession() {
  if (!activeTerminalSession) return;
  activeTerminalSession.process.kill();
  activeTerminalSession = null;
}

function submitTerminalInput(process: IPty, text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  process.write("\u001b[200~");
  const chunkSize = 1024;
  for (let index = 0; index < normalized.length; index += chunkSize) {
    process.write(normalized.slice(index, index + chunkSize));
  }
  process.write("\u001b[201~");
  globalThis.setTimeout(() => {
    process.write("\r");
  }, 24);
}

function clearAutoSprintIdleTimer() {
  if (autoSprintIdleTimer) {
    clearTimeout(autoSprintIdleTimer);
    autoSprintIdleTimer = null;
  }
}

function setAutoSprintTask(nextTask: Partial<AutoSprintTask>) {
  autoSprintTask = {
    ...autoSprintTask,
    ...nextTask,
  };
}

function resetAutoSprintTask() {
  clearAutoSprintIdleTimer();
  autoSprintTask = {
    startedAt: 0,
    startedVersion: null,
    message: null,
    sessionId: null,
    sawPaulaReply: false,
    sawOutput: false,
    scope: "filtered",
    sprint: "",
    status: "idle",
  };
}

function setSprintSummaryTask(nextTask: Partial<SprintSummaryTask>) {
  sprintSummaryTask = {
    ...sprintSummaryTask,
    ...nextTask,
  };
}

function hashTicketIds(ids: string[]) {
  return createHash("sha1").update(ids.slice().sort().join("\n")).digest("hex");
}

function buildSprintSummaryResponse(
  sprint: string,
  summary: string,
  overrides?: Partial<Omit<SprintSummaryResponse, "sprint" | "summary">>,
): SprintSummaryResponse {
  return {
    sprint,
    summary,
    state: summary.trim() ? "ready" : "empty",
    source: "config",
    ...overrides,
  };
}

function normalizeAgentOutput(value: string) {
  return value
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gi, "")
    .replace(/[\u0000\u0007]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

async function completeAutoSprintTask(status: "completed" | "failed", fallbackMessage: string) {
  clearAutoSprintIdleTimer();
  let message = fallbackMessage;
  let finalStatus = status;
  if (autoSprintTask.startedVersion !== null) {
    try {
      const backlog = await readBacklogFile();
      if (backlog.version !== autoSprintTask.startedVersion) {
        finalStatus = "completed";
        message = `Auto Sprint finished for ${autoSprintTask.sprint}.`;
      } else if (status === "completed") {
        message = `Auto Sprint finished for ${autoSprintTask.sprint}, but no backlog changes were detected.`;
      }
    } catch {
      // Keep fallback when backlog read fails during completion.
    }
  }
  setAutoSprintTask({ message, status: finalStatus });
}

function scheduleAutoSprintCompletionCheck() {
  clearAutoSprintIdleTimer();
  autoSprintIdleTimer = setTimeout(() => {
    if (autoSprintTask.status !== "running") return;
    if (!autoSprintTask.sawOutput) return;
    void completeAutoSprintTask(
      autoSprintTask.sawPaulaReply ? "completed" : "failed",
      autoSprintTask.sawPaulaReply
        ? `Auto Sprint finished for ${autoSprintTask.sprint}.`
        : "Auto Sprint ended before Paula returned a reply.",
    );
  }, 2600);
}

async function agentBootstrapPrompt(backlogPath: string) {
  const prompt = await fs.readFile(path.resolve("docs/UX_PRODUCT_OWNER_PROMPT.md"), "utf8");
  return [
    prompt.trim(),
    `Backlog file to manage: ${backlogPath}`,
    "Start by reading AGENTS.md in this repo if present.",
    "For chat rendering, prefix every user-visible reply line with exactly: PAULA>> ",
    "You have explicit permission in this session to edit the selected backlog file directly.",
    "You have explicit permission in this session to run a timestamp command such as date -u +%Y-%m-%dT%H:%M:%SZ when updating the Updated field.",
    "Stay in this Codex session, but do not take any backlog action until the user gives the first instruction after your short welcome.",
  ].join("\n\n");
}

async function ensureTerminalSession(options?: { restart?: boolean }) {
  const backlog = await readBacklogFile();
  const config = await readConfig();
  const agentCommand = config.agentCommand || DEFAULT_AGENT_COMMAND;
  if (
    activeTerminalSession &&
    activeTerminalSession.backlogPath === backlog.path &&
    activeTerminalSession.agentCommand === agentCommand &&
    !options?.restart
  ) {
    return activeTerminalSession;
  }

  closeActiveTerminalSession();

  const bootstrap = await agentBootstrapPrompt(backlog.path);
  const backlogDirectory = path.dirname(backlog.path);
  const ptyProcess = pty.spawn(
    "sh",
    ["-lc", agentCommand],
    {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: globalThis.process.cwd(),
      env: {
        ...globalThis.process.env,
        BACKLOG_BOOTSTRAP: bootstrap,
        BACKLOG_DIR: backlogDirectory,
        BACKLOG_FILE: backlog.path,
      },
    },
  );

  const session: AgentTerminalSession = {
    id: randomUUID(),
    agentCommand,
    backlogPath: backlog.path,
    process: ptyProcess,
  };
  activeTerminalSession = session;

  broadcastTerminal({
    type: "session",
    sessionId: session.id,
    backlogPath: backlog.path,
    agentCommand,
  });

  const bootstrapsFromCommand = agentCommand.includes('$BACKLOG_BOOTSTRAP');

  if (!bootstrapsFromCommand) {
    // Fallback for agent launchers that do not accept an initial prompt argument.
    globalThis.setTimeout(() => {
      if (activeTerminalSession?.id !== session.id) return;
      submitTerminalInput(ptyProcess, bootstrap);
    }, 900);
  }

  ptyProcess.onData((data) => {
    if (activeTerminalSession?.id !== session.id) return;
    if (autoSprintTask.status === "running" && autoSprintTask.sessionId === session.id) {
      const normalized = normalizeAgentOutput(data);
      setAutoSprintTask({
        sawOutput: true,
        sawPaulaReply: autoSprintTask.sawPaulaReply || /^PAULA>>\s*/m.test(normalized),
      });
      scheduleAutoSprintCompletionCheck();
    }
    broadcastTerminal({ type: "output", sessionId: session.id, data });
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    if (activeTerminalSession?.id !== session.id) return;
    if (autoSprintTask.status === "running" && autoSprintTask.sessionId === session.id) {
      void completeAutoSprintTask(
        exitCode === 0 ? "completed" : "failed",
        exitCode === 0
          ? `Auto Sprint finished for ${autoSprintTask.sprint}.`
          : `Auto Sprint agent exited with code ${exitCode}.`,
      );
    }
    broadcastTerminal({
      type: "exit",
      sessionId: session.id,
      exitCode,
      signal,
    });
    activeTerminalSession = null;
  });

  return session;
}

function commandExists(command: string) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

async function generatePaulaSprintSummaries(backlogPath: string, sprints: Array<{ sprint: string; tickets: BacklogItem[] }>) {
  if (sprints.length === 0) {
    return new Map<string, string>();
  }

  const { agentCommand } = await readConfig();
  if (!agentCommandAvailable(agentCommand)) {
    const binary = extractCommandBinary(agentCommand) || agentCommand;
    throw new Error(`${binary} is not installed or not available in PATH.`);
  }

  const bootstrap = await agentBootstrapPrompt(backlogPath);
  const backlogDirectory = path.dirname(backlogPath);
  const process = pty.spawn("sh", ["-lc", agentCommand], {
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    cwd: globalThis.process.cwd(),
    env: {
      ...globalThis.process.env,
      BACKLOG_BOOTSTRAP: bootstrap,
      BACKLOG_DIR: backlogDirectory,
      BACKLOG_FILE: backlogPath,
    },
  });

  const instruction = [
    "Build one concise sprint summary suggestion for each sprint below.",
    'Reply only with lines in this exact format: PAULA>> SPRINT|<sprint>|<summary>.',
    "Keep each summary to one sentence, plain language, and under 140 characters.",
    ...sprints.map(({ sprint, tickets }) => [
      `Sprint: ${sprint}`,
      ...tickets.map((ticket) => `- ${ticket.id}: ${ticket.title}${ticket.summary ? ` | ${ticket.summary}` : ""}`),
    ].join("\n")),
  ].join("\n\n");

  const summaries = new Map<string, string>();
  let buffer = "";

  return await new Promise<Map<string, string>>((resolve, reject) => {
    let settled = false;
    let idleTimer: NodeJS.Timeout | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        process.kill();
      } catch {
        // ignore
      }
      if (error) reject(error);
      else resolve(summaries);
    };

    const parse = (value: string) => {
      buffer += normalizeAgentOutput(value);
      const matches = buffer.matchAll(/^PAULA>>\s*SPRINT\|([^|]+)\|(.+)$/gm);
      for (const match of matches) {
        const sprint = String(match[1] ?? "").trim();
        const summary = String(match[2] ?? "").trim();
        if (sprint && summary) summaries.set(sprint, summary);
      }
      if (summaries.size >= sprints.length) {
        finish();
        return;
      }
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => finish(), 1800);
    };

    process.onData((data) => {
      parse(data);
    });

    process.onExit(() => {
      finish();
    });

    timeoutTimer = setTimeout(() => finish(new Error("Paula did not finish generating sprint summaries in time.")), 45000);

    const bootstrapsFromCommand = agentCommand.includes('$BACKLOG_BOOTSTRAP');
    if (!bootstrapsFromCommand) {
      submitTerminalInput(process, bootstrap);
      globalThis.setTimeout(() => submitTerminalInput(process, instruction), 900);
      return;
    }
    globalThis.setTimeout(() => submitTerminalInput(process, instruction), 900);
  });
}

async function refreshSprintSummariesInBackground() {
  const current = await readBacklogFile();
  const allSprintItems = new Map<string, BacklogItem[]>();
  for (const item of current.document.items) {
    const sprint = item.sprintAssigned.trim();
    if (!sprint) continue;
    const bucket = allSprintItems.get(sprint) ?? [];
    bucket.push(item);
    allSprintItems.set(sprint, bucket);
  }

  const config = await readConfig();
  const cached = config.sprintSummaries[current.path]?.summaries ?? {};
  const toGenerate: Array<{ sprint: string; tickets: BacklogItem[]; ticketIdHash: string }> = [];
  const completedSprints: string[] = [];

  for (const [sprint, tickets] of allSprintItems.entries()) {
    const ticketIdHash = hashTicketIds(tickets.map((ticket) => ticket.id));
    const existing = cached[sprint];
    if (existing?.overridden) {
      if (existing.ticketIdHash !== ticketIdHash) {
        await updateBacklogSprintSummaries(current.path, (summaries) => ({
          ...summaries,
          [sprint]: {
            ...existing,
            sprint,
            ticketIdHash,
            updatedAt: Date.now(),
          },
        }));
      }
      completedSprints.push(sprint);
      continue;
    }
    if (existing && existing.ticketIdHash === ticketIdHash && existing.summary.trim()) {
      completedSprints.push(sprint);
      continue;
    }
    toGenerate.push({ sprint, tickets, ticketIdHash });
  }

  if (toGenerate.length === 0) {
    setSprintSummaryTask({
      status: "completed",
      message: "Sprint summaries are already current.",
      completedSprints,
      failedSprints: [],
    });
    return;
  }

  const generated = await generatePaulaSprintSummaries(current.path, toGenerate.map(({ sprint, tickets }) => ({ sprint, tickets })));
  const now = Date.now();
  const failedSprints: string[] = [];

  await updateBacklogSprintSummaries(current.path, (summaries) => {
    const next = { ...summaries };
    for (const entry of toGenerate) {
      const summary = generated.get(entry.sprint)?.trim();
      if (!summary) {
        failedSprints.push(entry.sprint);
        continue;
      }
      next[entry.sprint] = {
        sprint: entry.sprint,
        summary,
        suggestedSummary: summary,
        ticketIdHash: entry.ticketIdHash,
        overridden: false,
        updatedAt: now,
      };
      completedSprints.push(entry.sprint);
    }
    return next;
  });

  setSprintSummaryTask({
    status: failedSprints.length ? "failed" : "completed",
    message: failedSprints.length
      ? `Saved ${completedSprints.length} sprint summaries. ${failedSprints.join(", ")} did not return a Paula summary.`
      : `Saved ${completedSprints.length} sprint summaries.`,
    completedSprints,
    failedSprints,
  });
}

function isUnavailableBacklogError(error: unknown) {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "EACCES";
}

async function validateBacklogPath(filePath: string) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error("Selected path is not a file.");
  }
  await fs.access(filePath);
  const raw = await fs.readFile(filePath, "utf8");
  if (!raw.trim()) {
    throw new Error("Selected backlog file is empty.");
  }
}

function chooserStartDirectory() {
  const backlogFile = getBacklogFile();
  return backlogFile ? path.dirname(backlogFile) : globalThis.process.cwd();
}

function chooseBacklogFilePath(): string | null {
  if (commandExists("zenity")) {
    const result = spawnSync(
      "zenity",
      [
        "--file-selection",
        "--title=Choose backlog markdown file",
        "--file-filter=Markdown files | *.md *.markdown backlog",
      ],
      { encoding: "utf8" },
    );
    return result.status === 0 ? result.stdout.trim() : null;
  }

  if (commandExists("kdialog")) {
    const result = spawnSync(
      "kdialog",
      ["--getopenfilename", chooserStartDirectory(), "*.md *.markdown backlog"],
      { encoding: "utf8" },
    );
    return result.status === 0 ? result.stdout.trim() : null;
  }

  return null;
}

function chooseFolderPath(): string | null {
  if (commandExists("zenity")) {
    const result = spawnSync(
      "zenity",
      ["--file-selection", "--directory", "--title=Choose folder for new backlog"],
      { encoding: "utf8" },
    );
    return result.status === 0 ? result.stdout.trim() : null;
  }

  if (commandExists("kdialog")) {
    const result = spawnSync(
      "kdialog",
      ["--getexistingdirectory", chooserStartDirectory()],
      { encoding: "utf8" },
    );
    return result.status === 0 ? result.stdout.trim() : null;
  }

  return null;
}

function normalizeItem(payload: Partial<BacklogItem>, existingIds: string[]): BacklogItem {
  const status = STATUSES.includes(payload.status as BacklogItem["status"])
    ? (payload.status as BacklogItem["status"])
    : "Inbox";

  const lane =
    STATUSES.includes(payload.lane as BacklogItem["lane"]) && payload.lane !== "Blocked"
      ? (payload.lane as BacklogItem["lane"])
      : status === "Blocked"
        ? "In Progress"
        : status;

  const safeId = payload.id && !existingIds.includes(payload.id) ? payload.id : "";
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  return {
    id: safeId,
    title: payload.title?.trim() ?? "Untitled story",
    status,
    lane,
    epic: payload.epic?.trim() || "Unassigned",
    owner: payload.owner?.trim() || "Paula Product",
    requester: payload.requester?.trim() || "",
    dateAdded: payload.dateAdded?.trim() || today,
    lastUpdated: now,
    dueDate: payload.dueDate?.trim() || "",
    priority: (payload.priority as BacklogItem["priority"]) || "P2",
    effort: EFFORTS.includes(Number(payload.effort) as (typeof EFFORTS)[number])
      ? (Number(payload.effort) as BacklogItem["effort"])
      : 2,
    sprintAssigned: payload.sprintAssigned?.trim() || "",
    readyForBen: payload.readyForBen === "Yes" ? "Yes" : "No",
    techHandoffOwner:
      payload.techHandoffOwner === "Ben" ||
      payload.techHandoffOwner === "Tess" ||
      payload.techHandoffOwner === "Dave"
        ? payload.techHandoffOwner
        : "Unassigned",
    summary: payload.summary?.trim() || "",
    outcome: payload.outcome?.trim() || "",
    scopeNotes: payload.scopeNotes?.trim() || "",
    acceptanceCriteria: (payload.acceptanceCriteria ?? []).map((item) => item.trim()).filter(Boolean),
    dependencies: payload.dependencies?.trim() || "",
    blocked: payload.blocked?.trim() || "",
    gitCommit: payload.gitCommit?.trim() || "",
    gitPrUrl: payload.gitPrUrl?.trim() || "",
    links: payload.links?.trim() || "",
    implementationNotes: payload.implementationNotes?.trim() || "",
  };
}

app.get("/api/backlog", async (_request, response) => {
  try {
    const backlog = await readBacklogFile();
    response.json({
      path: backlog.path,
      displayName: backlog.displayName,
      version: backlog.version,
      document: backlog.document,
    });
  } catch (error) {
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(404).json({ message: "No backlog file is loaded." });
      return;
    }
    if (isUnavailableBacklogError(error)) {
      setBacklogFile(null);
      bindBacklogWatcher(null);
      closeActiveTerminalSession();
      response.status(404).json({
        message: "The selected backlog file cannot be opened because the saved path is no longer valid.",
      });
      return;
    }
    response.status(500).json({ message: (error as Error).message });
  }
});

app.post("/api/backlog/choose", async (_request, response) => {
  const selectedPath = chooseBacklogFilePath();
  if (!selectedPath) {
    response.status(204).end();
    return;
  }

  try {
    await validateBacklogPath(selectedPath);
    closeActiveTerminalSession();
    setBacklogFile(selectedPath);
    bindBacklogWatcher(selectedPath);
    const backlog = await readBacklogFile();
    await rememberRecentBacklog(backlog.path, backlog.displayName);
    broadcastBacklogChanged();
    response.json({
      path: backlog.path,
      displayName: backlog.displayName,
      version: backlog.version,
      document: backlog.document,
    });
  } catch (error) {
    response.status(400).json({ message: (error as Error).message });
  }
});

app.post("/api/backlog/select", async (request, response) => {
  const selectedPath = String(request.body?.path ?? "").trim();
  if (!selectedPath) {
    response.status(400).json({ message: "Backlog path is required." });
    return;
  }

  try {
    await validateBacklogPath(selectedPath);
    closeActiveTerminalSession();
    setBacklogFile(selectedPath);
    bindBacklogWatcher(selectedPath);
    const backlog = await readBacklogFile();
    await rememberRecentBacklog(backlog.path, backlog.displayName);
    broadcastBacklogChanged();
    response.json({
      path: backlog.path,
      displayName: backlog.displayName,
      version: backlog.version,
      document: backlog.document,
    });
  } catch (error) {
    response.status(400).json({ message: (error as Error).message });
  }
});

app.post("/api/backlog/new", async (_request, response) => {
  const selectedFolder = chooseFolderPath();
  if (!selectedFolder) {
    response.status(204).end();
    return;
  }

  try {
    const newBacklogPath = await createBacklogInFolder(selectedFolder);
    closeActiveTerminalSession();
    setBacklogFile(newBacklogPath);
    bindBacklogWatcher(newBacklogPath);
    const backlog = await readBacklogFile();
    await rememberRecentBacklog(backlog.path, backlog.displayName);
    broadcastBacklogChanged();
    response.json({
      path: backlog.path,
      displayName: backlog.displayName,
      version: backlog.version,
      document: backlog.document,
    });
  } catch (error) {
    response.status(400).json({ message: (error as Error).message });
  }
});

app.post("/api/backlog/unload", async (_request, response) => {
  try {
    setBacklogFile(null);
    bindBacklogWatcher(null);
    closeActiveTerminalSession();
    broadcastBacklogChanged();
    response.json({ ok: true });
  } catch (error) {
    response.status(500).json({ message: (error as Error).message });
  }
});

app.put("/api/backlog/items/:id", async (request, response) => {
  try {
    const current = await readBacklogFile();
    const payload = request.body as { version: number; item: Partial<BacklogItem> };
    const existingItem = current.document.items.find((item) => item.id === request.params.id);
    if (!existingItem) {
      response.status(404).json({ message: "Story not found." });
      return;
    }
    if (existingItem.status === "Done" && existingItem.sprintAssigned && !(payload.item.sprintAssigned ?? existingItem.sprintAssigned).trim()) {
      response.status(400).json({ message: "Done stories stay locked to their sprint." });
      return;
    }
    const nextStatus = STATUSES.includes(payload.item.status as BacklogItem["status"])
      ? (payload.item.status as BacklogItem["status"])
      : existingItem.status;
    const normalizedPayload =
      nextStatus !== existingItem.status
        ? {
            ...payload.item,
            lane: nextStatus === "Blocked" ? (existingItem.lane ?? existingItem.status) : nextStatus,
          }
        : payload.item;
    const items = current.document.items.map((item) =>
      item.id === request.params.id
        ? {
            ...normalizeItem(normalizedPayload, current.document.items.map((existing) => existing.id)),
            id: request.params.id,
            dateAdded: item.dateAdded,
          }
        : item,
    );
    const updated = await writeBacklog(
      { ...current.document, items },
      Number(payload.version),
    );
    response.json(updated);
  } catch (error) {
    if ((error as Error & { code?: number }).code === 409) {
      response.status(409).json({
        message: "The backlog changed on disk. Refresh and retry.",
        latest: (error as Error & { latest?: BacklogDocument }).latest,
      });
      return;
    }
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(400).json({ message: "Open a backlog file before editing stories." });
      return;
    }
    response.status(500).json({ message: (error as Error).message });
  }
});

app.post("/api/backlog/items", async (request, response) => {
  try {
    const current = await readBacklogFile();
    const payload = request.body as { version: number; item: Partial<BacklogItem> };
    const nextId = nextBacklogId(current.document.items);
    const item = {
      ...normalizeItem(payload.item, current.document.items.map((existing) => existing.id)),
      id: nextId,
    };
    const updated = await writeBacklog(
      { ...current.document, items: [...current.document.items, item] },
      Number(payload.version),
    );
    response.json(updated);
  } catch (error) {
    if ((error as Error & { code?: number }).code === 409) {
      response.status(409).json({
        message: "The backlog changed on disk. Refresh and retry.",
        latest: (error as Error & { latest?: BacklogDocument }).latest,
      });
      return;
    }
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(400).json({ message: "Open a backlog file before editing stories." });
      return;
    }
    response.status(500).json({ message: (error as Error).message });
  }
});

app.delete("/api/backlog/items/:id", async (request, response) => {
  try {
    const current = await readBacklogFile();
    const payload = request.body as { version: number };
    const items = current.document.items.filter((item) => item.id !== request.params.id);

    if (items.length === current.document.items.length) {
      response.status(404).json({ message: "Story not found." });
      return;
    }

    const updated = await writeBacklog(
      { ...current.document, items },
      Number(payload.version),
    );
    response.json(updated);
  } catch (error) {
    if ((error as Error & { code?: number }).code === 409) {
      response.status(409).json({
        message: "The backlog changed on disk. Refresh and retry.",
        latest: (error as Error & { latest?: BacklogDocument }).latest,
      });
      return;
    }
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(400).json({ message: "Open a backlog file before editing stories." });
      return;
    }
    response.status(500).json({ message: (error as Error).message });
  }
});

app.post("/api/backlog/sprints/clear", async (request, response) => {
  try {
    const current = await readBacklogFile();
    const payload = request.body as { version: number; sprint: string };
    const sprint = String(payload.sprint ?? "").trim();
    if (!sprint) {
      response.status(400).json({ message: "Sprint is required." });
      return;
    }

    const now = new Date().toISOString();
    const items = current.document.items.map((item) =>
      item.sprintAssigned === sprint && item.status !== "Done"
        ? {
            ...item,
            sprintAssigned: "",
            lastUpdated: now,
          }
        : item,
    );

    const updated = await writeBacklog(
      { ...current.document, items },
      Number(payload.version),
    );
    response.json(updated);
  } catch (error) {
    if ((error as Error & { code?: number }).code === 409) {
      response.status(409).json({
        message: "The backlog changed on disk. Refresh and retry.",
        latest: (error as Error & { latest?: BacklogDocument }).latest,
      });
      return;
    }
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(400).json({ message: "Open a backlog file before editing stories." });
      return;
    }
    response.status(500).json({ message: (error as Error).message });
  }
});

app.get("/api/backlog/sprints/summary", async (request, response) => {
  try {
    const current = await readBacklogFile();
    const sprint = String(request.query.sprint ?? "").trim();
    if (!sprint) {
      response.status(400).json({ message: "Sprint is required." });
      return;
    }

    const items = current.document.items.filter((item) => item.sprintAssigned === sprint);
    const ticketIdHash = hashTicketIds(items.map((item) => item.id));
    const config = await readConfig();
    const cached = config.sprintSummaries[current.path]?.summaries?.[sprint];
    if (cached?.summary?.trim()) {
      response.json(buildSprintSummaryResponse(sprint, cached.summary, {
        suggestedSummary: cached.suggestedSummary,
        overridden: cached.overridden,
        ticketIdHash: cached.ticketIdHash,
        source: "config",
        state: cached.summary.trim() ? "ready" : "empty",
      }));
      return;
    }

    const summary = generateSprintGoalSummary(sprint, items);
    response.json({
      sprint,
      ticketIdHash,
      source: "fallback",
      ...summary,
    });
  } catch (error) {
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(400).json({ message: "Open a backlog file before viewing sprint summaries." });
      return;
    }
    response.status(500).json({ message: (error as Error).message || "Paula could not generate this sprint summary." });
  }
});

app.get("/api/backlog/sprints/summaries/status", (_request, response) => {
  response.json(sprintSummaryTask);
});

app.post("/api/backlog/sprints/summaries/refresh", async (_request, response) => {
  try {
    if (sprintSummaryTask.status === "running") {
      response.status(409).json({ message: "Sprint summaries are already being refreshed." });
      return;
    }
    const current = await readBacklogFile();
    setSprintSummaryTask({
      startedAt: Date.now(),
      startedVersion: current.version,
      message: "Paula is building sprint summaries.",
      status: "running",
      completedSprints: [],
      failedSprints: [],
    });
    void refreshSprintSummariesInBackground().catch((error) => {
      setSprintSummaryTask({
        status: "failed",
        message: (error as Error).message || "Paula could not refresh sprint summaries.",
      });
    });
    response.status(202).json({ message: "Paula is building sprint summaries in the background." });
  } catch (error) {
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(400).json({ message: "Open a backlog file before refreshing sprint summaries." });
      return;
    }
    response.status(500).json({ message: (error as Error).message || "Paula could not refresh sprint summaries." });
  }
});

app.put("/api/backlog/sprints/summary", async (request, response) => {
  try {
    const current = await readBacklogFile();
    const sprint = String(request.body?.sprint ?? "").trim();
    const summary = String(request.body?.summary ?? "").trim();
    if (!sprint) {
      response.status(400).json({ message: "Sprint is required." });
      return;
    }

    const items = current.document.items.filter((item) => item.sprintAssigned === sprint);
    const ticketIdHash = hashTicketIds(items.map((item) => item.id));
    const config = await readConfig();
    const existing = config.sprintSummaries[current.path]?.summaries?.[sprint];
    const suggestedSummary = existing?.suggestedSummary?.trim() || existing?.summary?.trim() || summary;
    const overridden = summary !== suggestedSummary;

    await updateBacklogSprintSummaries(current.path, (summaries) => ({
      ...summaries,
      [sprint]: {
        sprint,
        summary,
        suggestedSummary,
        ticketIdHash,
        overridden,
        updatedAt: Date.now(),
      },
    }));

    response.json(buildSprintSummaryResponse(sprint, summary, {
      suggestedSummary,
      overridden,
      ticketIdHash,
      source: "config",
      state: summary ? "ready" : "empty",
    }));
  } catch (error) {
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(400).json({ message: "Open a backlog file before editing sprint summaries." });
      return;
    }
    response.status(500).json({ message: (error as Error).message || "Sprint summary could not be saved." });
  }
});

app.get("/api/backlog/sprints/auto/status", (_request, response) => {
  response.json({
    message: autoSprintTask.message,
    scope: autoSprintTask.scope,
    sprint: autoSprintTask.sprint,
    startedAt: autoSprintTask.startedAt,
    status: autoSprintTask.status,
  });
});

app.post("/api/backlog/sprints/auto", async (request, response) => {
  try {
    const current = await readBacklogFile();
    const payload = request.body as {
      sprint: string;
      effortCap: number;
      scope: "filtered" | "all";
      filters?: { epic?: string; owner?: string; sprint?: string; text?: string };
    };

    const sprint = String(payload.sprint ?? "").trim();
    const effortCap = Number(payload.effortCap);
    const scope = payload.scope === "filtered" ? "filtered" : "all";
    const filters = payload.filters ?? {};

    if (!sprint) {
      response.status(400).json({ message: "Sprint is required." });
      return;
    }
    if (!Number.isInteger(effortCap) || effortCap < 1) {
      response.status(400).json({ message: "Effort cap must be a positive integer." });
      return;
    }
    if (autoSprintTask.status === "running") {
      response.status(409).json({ message: "Auto Sprint is already running." });
      return;
    }

    const { agentCommand } = await readConfig();
    if (!agentCommandAvailable(agentCommand)) {
      const binary = extractCommandBinary(agentCommand) || agentCommand;
      response.status(404).json({ message: `${binary} is not installed or not available in PATH.` });
      return;
    }

    const scopeParts = [
      scope === "filtered" && filters.epic && filters.epic !== "All epics" ? `epic: ${filters.epic}` : null,
      scope === "filtered" && filters.owner && filters.owner !== "All owners" ? `owner: ${filters.owner}` : null,
      scope === "filtered" && filters.sprint && filters.sprint !== "All sprints" ? `sprint: ${filters.sprint}` : null,
      scope === "filtered" && filters.text?.trim() ? `text filter: "${filters.text.trim()}"` : null,
    ].filter(Boolean);

    const contextMessage = scopeParts.length
      ? `Context update: current UI filters are ${scopeParts.join(", ")}. Treat these as strong scope guidance for this Auto Sprint request.`
      : "Context update: no narrowing UI filters are active. Treat the whole backlog as in scope for this Auto Sprint request.";

    const instruction = [
      `Auto Sprint request: prepare ${sprint} using a maximum effort of ${effortCap}.`,
      "Use reasonable product-priority assumptions when deciding what belongs in the sprint.",
      scope === "filtered"
        ? "Prioritize stories that match the current UI filters first, unless a strong backlog reason makes that clearly incorrect."
        : "Use the whole backlog as the candidate pool.",
      "Edit the selected backlog file directly. Reprioritize the sprint assignment fields so the sprint reflects your chosen plan.",
      "Favor stories that are implementation-ready, coherent together, and fit within the stated effort budget.",
      "When you finish, send a short summary of what you selected and why.",
    ].join(" ");

    const session = await ensureTerminalSession();
    setAutoSprintTask({
      message: `Auto Sprint started for ${sprint}.`,
      scope,
      sawOutput: false,
      sawPaulaReply: false,
      sessionId: session.id,
      sprint,
      startedAt: Date.now(),
      startedVersion: current.version,
      status: "running",
    });

    submitTerminalInput(session.process, contextMessage);
    globalThis.setTimeout(() => {
      if (autoSprintTask.status === "running" && autoSprintTask.sessionId === session.id) {
        submitTerminalInput(session.process, instruction);
      }
    }, 120);

    response.json({
      message: `Auto Sprint started for ${sprint}.`,
      sprint,
      status: "running",
    });
  } catch (error) {
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(400).json({ message: "Open a backlog file before editing stories." });
      return;
    }
    setAutoSprintTask({
      message: (error as Error).message,
      status: "failed",
    });
    response.status(500).json({ message: (error as Error).message });
  }
});

app.put("/api/backlog/title", async (request, response) => {
  try {
    const payload = request.body as { version: number; title: string };
    const updated = await updateBacklogTitle(String(payload.title ?? ""), Number(payload.version));
    await rememberRecentBacklog(updated.path, updated.displayName);
    response.json(updated);
  } catch (error) {
    if ((error as Error & { code?: number }).code === 409) {
      response.status(409).json({
        message: "The backlog changed on disk. Refresh and retry.",
      });
      return;
    }
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(400).json({ message: "Open a backlog file before editing stories." });
      return;
    }
    response.status(500).json({ message: (error as Error).message });
  }
});

app.get("/api/backlog/undo/status", async (_request, response) => {
  try {
    await readBacklogFile();
    response.json({ available: true, message: "Undo will restore the saved pre-Paula backlog version for this file only." });
  } catch (error) {
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(400).json({ available: false, message: "Open a backlog file before using Undo." });
      return;
    }
    response.status(500).json({ available: false, message: (error as Error).message });
  }
});

app.post("/api/backlog/undo", async (_request, response) => {
  try {
    const updated = await restorePreviousBacklogVersion();
    await rememberRecentBacklog(updated.path, updated.displayName);
    response.json(updated);
  } catch (error) {
    if ((error as Error & { code?: string }).code === "NO_BACKUP_AVAILABLE") {
      response.status(400).json({ message: (error as Error).message });
      return;
    }
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(400).json({ message: "Open a backlog file before using Undo." });
      return;
    }
    response.status(500).json({ message: (error as Error).message });
  }
});

app.get("/api/backlog/events", (request, response) => {
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
  response.write(`event: ready\ndata: ${JSON.stringify({ ready: true })}\n\n`);
  sseClients.add(response);

  request.on("close", () => {
    sseClients.delete(response);
  });
});

app.get("/api/config", async (_request, response) => {
  try {
    const config = await readConfig();
    response.json({ ...config, configPath: CONFIG_PATH });
  } catch (error) {
    response.status(500).json({ message: (error as Error).message });
  }
});

app.put("/api/config", async (request, response) => {
  try {
    const agentCommand = String(request.body?.agentCommand ?? "").trim() || DEFAULT_AGENT_COMMAND;
    const config = await updateConfig({ agentCommand });
    closeActiveTerminalSession();
    response.json({ ...config, configPath: CONFIG_PATH });
  } catch (error) {
    response.status(500).json({ message: (error as Error).message });
  }
});

app.post("/api/config/recent/open", async (request, response) => {
  try {
    const pathValue = String(request.body?.path ?? "").trim();
    const displayName = String(request.body?.displayName ?? "").trim();
    if (!pathValue || !displayName) {
      response.status(400).json({ message: "Path and display name are required." });
      return;
    }
    const config = await rememberRecentBacklog(pathValue, displayName);
    response.json({ ...config, configPath: CONFIG_PATH });
  } catch (error) {
    response.status(500).json({ message: (error as Error).message });
  }
});

app.post("/api/config/recent/remove", async (request, response) => {
  try {
    const pathValue = String(request.body?.path ?? "").trim();
    if (!pathValue) {
      response.status(400).json({ message: "Path is required." });
      return;
    }
    const config = await removeRecentBacklog(pathValue);
    response.json({ ...config, configPath: CONFIG_PATH });
  } catch (error) {
    response.status(500).json({ message: (error as Error).message });
  }
});

app.get("/api/agent-prompt", (_request, response) => {
  response.sendFile(path.resolve("docs/UX_PRODUCT_OWNER_PROMPT.md"));
});

app.post("/api/agent/session", async (request, response) => {
  const { agentCommand } = await readConfig();
  if (!agentCommandAvailable(agentCommand)) {
    const binary = extractCommandBinary(agentCommand) || agentCommand;
    response.status(404).json({ message: `${binary} is not installed or not available in PATH.` });
    return;
  }

  try {
    const session = await ensureTerminalSession({
      restart: Boolean(request.body?.restart),
    });
    response.json({
      sessionId: session.id,
      backlogPath: session.backlogPath,
      agentCommand: session.agentCommand,
    });
  } catch (error) {
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(400).json({ message: "Open a backlog file before starting Paula." });
      return;
    }
    response.status(500).json({ message: (error as Error).message });
  }
});

app.post("/api/agent/context", async (request, response) => {
  const { agentCommand } = await readConfig();
  if (!agentCommandAvailable(agentCommand)) {
    const binary = extractCommandBinary(agentCommand) || agentCommand;
    response.status(404).json({ message: `${binary} is not installed or not available in PATH.` });
    return;
  }

  try {
    const session = await ensureTerminalSession();
    const selectedEpic = String(request.body?.selectedEpic ?? "").trim();
    const selectedOwner = String(request.body?.selectedOwner ?? "").trim();
    const selectedSprint = String(request.body?.selectedSprint ?? "").trim();
    const textFilter = String(request.body?.textFilter ?? "").trim();

    const scopeParts = [
      selectedEpic && selectedEpic !== "All epics" ? `epic: ${selectedEpic}` : null,
      selectedOwner && selectedOwner !== "All owners" ? `owner: ${selectedOwner}` : null,
      selectedSprint && selectedSprint !== "All sprints" ? `sprint: ${selectedSprint}` : null,
      textFilter ? `text filter: "${textFilter}"` : null,
    ].filter(Boolean);

    const message = scopeParts.length
      ? `Context update: current UI filters are ${scopeParts.join(", ")}. Treat these only as scope guidance and prioritization hints. You may still inspect or update other tickets in the same backlog when the user's request plausibly requires broader context or cross-ticket coordination.`
      : "Context update: no narrowing UI filters are active. Treat the whole backlog as in scope unless the user says otherwise.";

    submitTerminalInput(session.process, message);

    response.json({
      message: scopeParts.length
        ? `Agent context updated for ${scopeParts.join(", ")}.`
        : "Agent context updated for the full backlog.",
      sessionId: session.id,
    });
  } catch (error) {
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(400).json({ message: "Open a backlog file before starting Paula." });
      return;
    }
    response.status(500).json({ message: (error as Error).message });
  }
});

app.post("/api/agent/run", async (request, response) => {
  const instruction = String(request.body?.instruction ?? "").trim();
  if (!instruction) {
    response.status(400).json({ message: "Instruction is required." });
    return;
  }

  const { agentCommand } = await readConfig();
  if (!agentCommandAvailable(agentCommand)) {
    const binary = extractCommandBinary(agentCommand) || agentCommand;
    response.status(404).json({ message: `${binary} is not installed or not available in PATH.` });
    return;
  }

  try {
    const session = await ensureTerminalSession();
    submitTerminalInput(session.process, instruction);
    response.json({
      message: "Instruction sent to the configured agent.",
      sessionId: session.id,
    });
  } catch (error) {
    if ((error as Error & { code?: string }).code === "NO_BACKLOG_LOADED") {
      response.status(400).json({ message: "Open a backlog file before starting Paula." });
      return;
    }
    response.status(500).json({ message: (error as Error).message });
  }
});

wsServer.on("connection", (socket: WebSocket) => {
  terminalClients.add(socket);

  if (activeTerminalSession) {
    socket.send(
      JSON.stringify({
        type: "session",
        sessionId: activeTerminalSession.id,
        backlogPath: activeTerminalSession.backlogPath,
        agentCommand: activeTerminalSession.agentCommand,
      }),
    );
  }

  socket.on("message", (raw: Buffer) => {
    if (!activeTerminalSession) return;

    try {
      const message = JSON.parse(String(raw)) as
        | { type: "input"; data: string }
        | { type: "submit"; data: string }
        | { type: "resize"; cols: number; rows: number };

      if (message.type === "input") {
        activeTerminalSession.process.write(message.data);
      }

      if (message.type === "submit") {
        submitTerminalInput(activeTerminalSession.process, message.data);
      }

      if (message.type === "resize") {
        activeTerminalSession.process.resize(
          Math.max(20, Math.trunc(message.cols)),
          Math.max(10, Math.trunc(message.rows)),
        );
      }
    } catch {
      // Ignore malformed websocket messages.
    }
  });

  socket.on("close", () => {
    terminalClients.delete(socket);
  });
});

server.listen(port, () => {
  console.log(`Backlog API listening on http://localhost:${port}`);
});
