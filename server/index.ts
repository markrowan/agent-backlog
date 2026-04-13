import express from "express";
import http from "node:http";
import fs from "node:fs/promises";
import { FSWatcher, watch } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { WebSocketServer, WebSocket } from "ws";
import pty, { type IPty } from "node-pty";
import {
  createBacklogInFolder,
  getBacklogFile,
  nextBacklogId,
  readBacklogFile,
  setBacklogFile,
  updateBacklogTitle,
  writeBacklog,
} from "./backlog.js";
import { BacklogItem, BacklogDocument, STATUSES } from "./types.js";

const app = express();
const port = Number(process.env.PORT ?? 4177);
const sseClients = new Set<express.Response>();
let backlogWatcher: FSWatcher | null = null;
const server = http.createServer(app);
const wsServer = new WebSocketServer({ server, path: "/api/agent/terminal" });

interface AgentTerminalSession {
  backlogPath: string;
  id: string;
  process: IPty;
}

let activeTerminalSession: AgentTerminalSession | null = null;
const terminalClients = new Set<WebSocket>();

app.use(express.json({ limit: "1mb" }));

function codexAvailable() {
  const result = spawnSync("sh", ["-lc", "command -v codex"], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function broadcastBacklogChanged() {
  for (const client of sseClients) {
    client.write(`event: backlog-changed\n`);
    client.write(`data: ${JSON.stringify({ changed: true, at: Date.now() })}\n\n`);
  }
}

function bindBacklogWatcher(filePath: string) {
  backlogWatcher?.close();
  backlogWatcher = watch(filePath, { persistent: false }, () => {
    broadcastBacklogChanged();
  });
}

bindBacklogWatcher(getBacklogFile());

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

async function agentBootstrapPrompt(backlogPath: string) {
  const prompt = await fs.readFile(path.resolve("docs/UX_PRODUCT_OWNER_PROMPT.md"), "utf8");
  return [
    prompt.trim(),
    `Backlog file to manage: ${backlogPath}`,
    "Start by reading AGENTS.md in this repo if present.",
    "Stay in this Codex session and maintain the backlog continuously until redirected.",
  ].join("\n\n");
}

async function ensureTerminalSession(options?: { restart?: boolean }) {
  const backlog = await readBacklogFile();
  if (
    activeTerminalSession &&
    activeTerminalSession.backlogPath === backlog.path &&
    !options?.restart
  ) {
    return activeTerminalSession;
  }

  closeActiveTerminalSession();

  const bootstrap = await agentBootstrapPrompt(backlog.path);
  const backlogDirectory = path.dirname(backlog.path);
  const ptyProcess = pty.spawn(
    "codex",
    ["--no-alt-screen", "--add-dir", backlogDirectory, bootstrap],
    {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: globalThis.process.cwd(),
      env: { ...globalThis.process.env, BACKLOG_FILE: backlog.path },
    },
  );

  const session: AgentTerminalSession = {
    id: randomUUID(),
    backlogPath: backlog.path,
    process: ptyProcess,
  };
  activeTerminalSession = session;

  ptyProcess.onData((data) => {
    if (activeTerminalSession?.id !== session.id) return;
    broadcastTerminal({ type: "output", sessionId: session.id, data });
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    if (activeTerminalSession?.id !== session.id) return;
    broadcastTerminal({
      type: "exit",
      sessionId: session.id,
      exitCode,
      signal,
    });
    activeTerminalSession = null;
  });

  broadcastTerminal({
    type: "session",
    sessionId: session.id,
    backlogPath: backlog.path,
  });

  return session;
}

function commandExists(command: string) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    stdio: "ignore",
  });
  return result.status === 0;
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
      ["--getopenfilename", path.dirname(getBacklogFile()), "*.md *.markdown backlog"],
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
      ["--getexistingdirectory", path.dirname(getBacklogFile())],
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

  const safeId = payload.id && !existingIds.includes(payload.id) ? payload.id : "";
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  return {
    id: safeId,
    title: payload.title?.trim() ?? "Untitled story",
    status,
    epic: payload.epic?.trim() || "Unassigned",
    owner: payload.owner?.trim() || "Paula Product",
    requester: payload.requester?.trim() || "",
    dateAdded: payload.dateAdded?.trim() || today,
    lastUpdated: now,
    dueDate: payload.dueDate?.trim() || "",
    priority: (payload.priority as BacklogItem["priority"]) || "P2",
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
    links: payload.links?.trim() || "",
    implementationNotes: payload.implementationNotes?.trim() || "",
  };
}

app.get("/api/backlog", async (_request, response) => {
  const backlog = await readBacklogFile();
  response.json({
    path: backlog.path,
    displayName: backlog.displayName,
    version: backlog.version,
    document: backlog.document,
  });
});

app.post("/api/backlog/choose", async (_request, response) => {
  const selectedPath = chooseBacklogFilePath();
  if (!selectedPath) {
    response.status(404).json({
      message: "No Linux file chooser is available, or no file was selected.",
    });
    return;
  }

  try {
    await validateBacklogPath(selectedPath);
    setBacklogFile(selectedPath);
    bindBacklogWatcher(selectedPath);
    const backlog = await readBacklogFile();
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
    setBacklogFile(selectedPath);
    bindBacklogWatcher(selectedPath);
    const backlog = await readBacklogFile();
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
    response.status(404).json({
      message: "No Linux folder chooser is available, or no folder was selected.",
    });
    return;
  }

  try {
    const newBacklogPath = await createBacklogInFolder(selectedFolder);
    setBacklogFile(newBacklogPath);
    bindBacklogWatcher(newBacklogPath);
    const backlog = await readBacklogFile();
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

app.put("/api/backlog/items/:id", async (request, response) => {
  try {
    const current = await readBacklogFile();
    const payload = request.body as { version: number; item: Partial<BacklogItem> };
    const items = current.document.items.map((item) =>
      item.id === request.params.id
        ? {
            ...normalizeItem(payload.item, current.document.items.map((existing) => existing.id)),
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
    response.status(500).json({ message: (error as Error).message });
  }
});

app.put("/api/backlog/title", async (request, response) => {
  try {
    const payload = request.body as { version: number; title: string };
    const updated = await updateBacklogTitle(String(payload.title ?? ""), Number(payload.version));
    response.json(updated);
  } catch (error) {
    if ((error as Error & { code?: number }).code === 409) {
      response.status(409).json({
        message: "The backlog changed on disk. Refresh and retry.",
      });
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

app.get("/api/agent-prompt", (_request, response) => {
  response.sendFile(path.resolve("docs/UX_PRODUCT_OWNER_PROMPT.md"));
});

app.post("/api/agent/session", async (request, response) => {
  if (!codexAvailable()) {
    response.status(404).json({ message: "codex is not installed or not available in PATH." });
    return;
  }

  try {
    const session = await ensureTerminalSession({
      restart: Boolean(request.body?.restart),
    });
    response.json({
      sessionId: session.id,
      backlogPath: session.backlogPath,
    });
  } catch (error) {
    response.status(500).json({ message: (error as Error).message });
  }
});

app.post("/api/agent/context", async (request, response) => {
  if (!codexAvailable()) {
    response.status(404).json({ message: "codex is not installed or not available in PATH." });
    return;
  }

  try {
    const session = await ensureTerminalSession();
    const selectedEpic = String(request.body?.selectedEpic ?? "").trim();

    if (!selectedEpic || selectedEpic === "All epics") {
      session.process.write(
        "Context update: the user is viewing all epics on the board. Work across the backlog unless a narrower instruction follows.\r",
      );
      response.json({ message: "Codex context updated for all epics.", sessionId: session.id });
      return;
    }

    session.process.write(
      `Context update: the user is currently viewing the epic "${selectedEpic}". Prioritize stories in this epic unless redirected.\r`,
    );
    response.json({
      message: `Codex context updated for ${selectedEpic}.`,
      sessionId: session.id,
    });
  } catch (error) {
    response.status(500).json({ message: (error as Error).message });
  }
});

app.post("/api/agent/run", async (request, response) => {
  const instruction = String(request.body?.instruction ?? "").trim();
  if (!instruction) {
    response.status(400).json({ message: "Instruction is required." });
    return;
  }

  if (!codexAvailable()) {
    response.status(404).json({ message: "codex is not installed or not available in PATH." });
    return;
  }

  try {
    const session = await ensureTerminalSession();
    session.process.write(`${instruction}\r`);
    response.json({
      message: "Instruction sent to Codex.",
      sessionId: session.id,
    });
  } catch (error) {
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
      }),
    );
  }

  socket.on("message", (raw: Buffer) => {
    if (!activeTerminalSession) return;

    try {
      const message = JSON.parse(String(raw)) as
        | { type: "input"; data: string }
        | { type: "resize"; cols: number; rows: number };

      if (message.type === "input") {
        activeTerminalSession.process.write(message.data);
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
