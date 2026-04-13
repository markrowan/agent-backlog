import { useEffect, useMemo, useRef, useState } from "react";
import AgentTerminal from "./AgentTerminal";
import {
  BacklogItem,
  BacklogResponse,
  HANDOFF_OWNERS,
  PRIORITIES,
  STATUSES,
  Status,
} from "./types";

const EMPTY_ITEM: BacklogItem = {
  id: "",
  title: "",
  status: "Inbox",
  epic: "",
  owner: "Paula Product",
  requester: "",
  dateAdded: "",
  lastUpdated: "",
  dueDate: "",
  priority: "P2",
  readyForBen: "No",
  techHandoffOwner: "Unassigned",
  summary: "",
  outcome: "",
  scopeNotes: "",
  acceptanceCriteria: [""],
  dependencies: "",
  links: "",
  implementationNotes: "",
};

const DEFAULT_EDITOR_WIDTH = 820;
const DEFAULT_EDITOR_HEIGHT = 812;
const DEFAULT_EDITOR_POSITION = { x: 120, y: 140 };
const DEFAULT_PAULA_PANEL_SIZE = { width: 540, height: 420 };
const DEFAULT_SORT_ORDER = ["epic", "priority", "status", "owner", "due", "lastUpdated"] as const;
type SortKey = (typeof DEFAULT_SORT_ORDER)[number];
type SortDirection = "asc" | "desc";

const PRIORITY_ORDER: Record<BacklogItem["priority"], number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const STATUS_ORDER: Record<BacklogItem["status"], number> = {
  Inbox: 0,
  Grooming: 1,
  Ready: 2,
  "In Progress": 3,
  Done: 4,
};

const SORT_LABELS: Record<SortKey, string> = {
  epic: "Epic",
  priority: "Priority",
  status: "Status",
  owner: "Owner",
  due: "Due",
  lastUpdated: "Updated",
};


const DEFAULT_SORT_DIRECTIONS: Record<SortKey, SortDirection> = {
  epic: "asc",
  priority: "asc",
  status: "asc",
  owner: "asc",
  due: "asc",
  lastUpdated: "desc",
};

const RECENT_BACKLOGS_KEY = "codex-agile-recent-backlogs";

interface RecentBacklog {
  path: string;
  displayName: string;
  lastOpenedAt: number;
}

interface MissingBacklogNotice {
  path: string;
  displayName: string;
  message: string;
}

function themeVars(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }

  const baseRed = (hash >> 16) & 255;
  const baseGreen = (hash >> 8) & 255;
  const baseBlue = hash & 255;

  const pastel = {
    r: Math.round(baseRed * 0.3 + 255 * 0.7),
    g: Math.round(baseGreen * 0.3 + 255 * 0.7),
    b: Math.round(baseBlue * 0.3 + 255 * 0.7),
  };

  const accent = {
    r: Math.round(baseRed * 0.7 + 255 * 0.12),
    g: Math.round(baseGreen * 0.7 + 255 * 0.12),
    b: Math.round(baseBlue * 0.7 + 255 * 0.12),
  };

  const accentDeep = {
    r: Math.max(Math.round(accent.r * 0.72), 28),
    g: Math.max(Math.round(accent.g * 0.72), 28),
    b: Math.max(Math.round(accent.b * 0.72), 28),
  };

  return {
    "--bg-start": `rgb(${Math.min(pastel.r + 8, 255)}, ${Math.min(pastel.g + 8, 255)}, ${Math.min(pastel.b + 8, 255)})`,
    "--bg-end": `rgb(${Math.max(pastel.r - 10, 0)}, ${Math.max(pastel.g - 8, 0)}, ${Math.max(pastel.b - 6, 0)})`,
    "--panel-tint": `rgba(${pastel.r}, ${pastel.g}, ${pastel.b}, 0.24)`,
    "--accent-soft": `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.18)`,
    "--accent": `rgb(${accent.r}, ${accent.g}, ${accent.b})`,
    "--accent-deep": `rgb(${accentDeep.r}, ${accentDeep.g}, ${accentDeep.b})`,
    "--line-strong": `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.28)`,
    "--chip-ring": `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.22)`,
  } as React.CSSProperties;
}

function applyThemeToDocument(theme: React.CSSProperties) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme)) {
    if (typeof value === "string") {
      root.style.setProperty(key, value);
    }
  }
}

function loadRecentBacklogs(): RecentBacklog[] {
  try {
    const raw = window.localStorage.getItem(RECENT_BACKLOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentBacklog[];
    return parsed.filter((entry) => entry.path && entry.displayName);
  } catch {
    return [];
  }
}

function saveRecentBacklogs(entries: RecentBacklog[]) {
  window.localStorage.setItem(RECENT_BACKLOGS_KEY, JSON.stringify(entries.slice(0, 8)));
}

function removeRecentBacklog(pathToRemove: string) {
  const next = loadRecentBacklogs().filter((entry) => entry.path !== pathToRemove);
  saveRecentBacklogs(next);
  return next;
}

function rememberBacklog(current: BacklogResponse) {
  const existing = loadRecentBacklogs().filter((entry) => entry.path !== current.path);
  const next = [
    {
      path: current.path,
      displayName: current.displayName,
      lastOpenedAt: Date.now(),
    },
    ...existing,
  ].sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);
  saveRecentBacklogs(next);
  return next;
}

function hashToPastel(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }

  const red = (hash >> 16) & 255;
  const green = (hash >> 8) & 255;
  const blue = hash & 255;

  const pastel = {
    r: Math.round(red * 0.35 + 255 * 0.65),
    g: Math.round(green * 0.35 + 255 * 0.65),
    b: Math.round(blue * 0.35 + 255 * 0.65),
  };

  return {
    backgroundColor: `rgb(${pastel.r}, ${pastel.g}, ${pastel.b})`,
    borderColor: `rgba(${Math.max(pastel.r - 30, 0)}, ${Math.max(pastel.g - 30, 0)}, ${Math.max(pastel.b - 30, 0)}, 0.35)`,
    color: `rgb(${Math.max(pastel.r - 120, 40)}, ${Math.max(pastel.g - 120, 40)}, ${Math.max(pastel.b - 120, 40)})`,
  };
}

function defaultPaulaPanelPosition() {
  const x = Math.max(16, window.innerWidth - DEFAULT_PAULA_PANEL_SIZE.width - 28);
  const y = Math.max(16, window.innerHeight - DEFAULT_PAULA_PANEL_SIZE.height - 172);
  return { x, y };
}

function centeredEditorPosition() {
  const maxX = Math.max(window.innerWidth - DEFAULT_EDITOR_WIDTH, 32);
  const maxY = Math.max(window.innerHeight - DEFAULT_EDITOR_HEIGHT, 32);
  return {
    x: Math.max(16, Math.round(maxX / 2)),
    y: Math.max(16, Math.round(maxY / 2)),
  };
}

function normalizeEditorItem(item: BacklogItem) {
  return JSON.stringify({
    ...item,
    acceptanceCriteria: item.acceptanceCriteria.map((criterion) => criterion.trimEnd()),
  });
}

function toTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function compareDueDates(left: string, right: string) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

function formatLastUpdated(value: string) {
  if (!value) return "Updated recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return `Updated ${value}`;
  }
  return `Updated ${date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatDueDate(value: string) {
  if (!value) return "";
  const match = value.match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? value : value.slice(0, 10);
}

function saveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3v10.17l3.59-3.58L17 11l-5 5-5-5 1.41-1.41L11 13.17V3h1ZM5 18h14v2H5v-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function closeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function trashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v8h-2v-8Zm4 0h2v8h-2v-8ZM7 10h2v8H7v-8Zm-1 11h12l1-13H5l1 13Z"
        fill="currentColor"
      />
    </svg>
  );
}

function discardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7.5 5H20v2H10.33l3.38 3.38-1.42 1.42L6.5 6l5.79-5.79 1.42 1.42L10.33 5H7.5ZM4 12h2v6h12v-6h2v8H4v-8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function App() {
  const [data, setData] = useState<BacklogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<BacklogItem | null>(null);
  const [editorBaseline, setEditorBaseline] = useState<BacklogItem | null>(null);
  const [editorPosition, setEditorPosition] = useState(DEFAULT_EDITOR_POSITION);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedEpic, setSelectedEpic] = useState("All epics");
  const [selectedOwner, setSelectedOwner] = useState("All owners");
  const [sortOrder, setSortOrder] = useState<SortKey[]>([...DEFAULT_SORT_ORDER]);
  const [sortDirections, setSortDirections] = useState<Record<SortKey, SortDirection>>({ ...DEFAULT_SORT_DIRECTIONS });
  const [draggingSortKey, setDraggingSortKey] = useState<SortKey | null>(null);
  const [dragOverSortKey, setDragOverSortKey] = useState<SortKey | null>(null);
  const [recentBacklogs, setRecentBacklogs] = useState<RecentBacklog[]>([]);
  const [missingBacklogNotice, setMissingBacklogNotice] = useState<MissingBacklogNotice | null>(null);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [choosingFile, setChoosingFile] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);
  const [showEpicCreator, setShowEpicCreator] = useState(false);
  const [newEpicDraft, setNewEpicDraft] = useState("");
  const [showUnsavedChangesNotice, setShowUnsavedChangesNotice] = useState(false);
  const [showPaulaPanel, setShowPaulaPanel] = useState(false);
  const [paulaPanelPosition, setPaulaPanelPosition] = useState(defaultPaulaPanelPosition);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const latestVersionRef = useRef<number | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const draggingEditorRef = useRef(false);
  const paulaDragOffsetRef = useRef({ x: 0, y: 0 });
  const draggingPaulaRef = useRef(false);

  async function loadBacklog(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const backlogResponse = await fetch("/api/backlog");

      if (!backlogResponse.ok) {
        throw new Error("Failed to load backlog");
      }

      const backlog = (await backlogResponse.json()) as BacklogResponse;
      setData(backlog);
      setTitleDraft(backlog.document.title);
      latestVersionRef.current = backlog.version;
      setRecentBacklogs(rememberBacklog(backlog));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    setRecentBacklogs(loadRecentBacklogs());
    void loadBacklog();
  }, []);

  useEffect(() => {
    applyThemeToDocument(themeVars(data?.displayName ?? data?.document.title ?? "backlog"));
  }, [data?.displayName, data?.document.title]);

  useEffect(() => {
    if (!data?.path) return;

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/agent/context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedEpic }),
        });
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;

        if (!response.ok || cancelled) return;
        if (payload?.message) {
          setAgentStatus(payload.message);
        }
      } catch {
        // Ignore transient context-sync failures.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data?.path, selectedEpic]);

  useEffect(() => {
    const events = new EventSource("/api/backlog/events");

    const refreshFromDisk = async () => {
      try {
        const backlogResponse = await fetch("/api/backlog");
        if (!backlogResponse.ok) return;
        const backlog = (await backlogResponse.json()) as BacklogResponse;
        if (
          latestVersionRef.current === null ||
          Math.trunc(backlog.version) !== Math.trunc(latestVersionRef.current)
        ) {
          setData(backlog);
          setTitleDraft(backlog.document.title);
          latestVersionRef.current = backlog.version;
          setRecentBacklogs(rememberBacklog(backlog));
          setAgentStatus("Backlog refreshed from file changes.");
        }
      } catch {
        // Ignore transient watcher reconnect issues.
      }
    };

    events.addEventListener("backlog-changed", () => {
      void refreshFromDisk();
    });

    return () => {
      events.close();
    };
  }, []);

  const grouped = useMemo(() => {
    if (!data) return new Map<Status, Map<string, BacklogItem[]>>();
    const statuses = new Map<Status, Map<string, BacklogItem[]>>();

    const compareItems = (left: BacklogItem, right: BacklogItem) => {
      for (const key of sortOrder) {
        const direction = sortDirections[key] === "desc" ? -1 : 1;

        if (key === "epic") {
          const result = (left.epic || "Unassigned").localeCompare(right.epic || "Unassigned") * direction;
          if (result !== 0) return result;
        }

        if (key === "priority") {
          const result = (PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]) * direction;
          if (result !== 0) return result;
        }

        if (key === "status") {
          const result = (STATUS_ORDER[left.status] - STATUS_ORDER[right.status]) * direction;
          if (result !== 0) return result;
        }

        if (key === "owner") {
          const result = left.owner.localeCompare(right.owner) * direction;
          if (result !== 0) return result;
        }

        if (key === "due") {
          const result = compareDueDates(left.dueDate, right.dueDate) * direction;
          if (result !== 0) return result;
        }

        if (key === "lastUpdated") {
          const result = (toTimestamp(right.lastUpdated) - toTimestamp(left.lastUpdated)) * direction;
          if (result !== 0) return result;
        }
      }

      const leftNumber = Number(left.id.replace(/^BACKLOG-/, ""));
      const rightNumber = Number(right.id.replace(/^BACKLOG-/, ""));
      if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber) && leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }

      return left.id.localeCompare(right.id);
    };

    for (const status of STATUSES) {
      statuses.set(status, new Map());
    }

    const filteredItems = data.document.items
      .filter((item) => selectedEpic === "All epics" || item.epic === selectedEpic)
      .filter((item) => selectedOwner === "All owners" || item.owner === selectedOwner)
      .sort(compareItems);

    for (const item of filteredItems) {
      if (selectedEpic !== "All epics" && item.epic !== selectedEpic) {
        continue;
      }
      if (selectedOwner !== "All owners" && item.owner !== selectedOwner) {
        continue;
      }
      const lane = statuses.get(item.status)!;
      const epic = item.epic || "Unassigned";
      const bucket = lane.get(epic) ?? [];
      bucket.push(item);
      lane.set(epic, bucket);
    }

    return statuses;
  }, [data, selectedEpic, selectedOwner, sortDirections, sortOrder]);

  const ownerOptions = useMemo(() => {
    if (!data) return ["All owners"];
    return [
      "All owners",
      ...Array.from(new Set(data.document.items.map((item) => item.owner || "Unassigned"))).sort(),
    ];
  }, [data]);

  const epicOptions = useMemo(() => {
    if (!data) return ["All epics"];
    return [
      "All epics",
      ...Array.from(new Set(data.document.items.map((item) => item.epic || "Unassigned"))).sort(),
    ];
  }, [data]);

  const epicOptionLabels = useMemo(() => {
    const labels = new Map<string, string>();
    labels.set("All epics", "All epics");

    for (const epic of epicOptions) {
      if (epic === "All epics") continue;
      const hasActiveItems = (data?.document.items ?? []).some(
        (item) => (item.epic || "Unassigned") === epic && item.status !== "Done",
      );
      labels.set(epic, `${hasActiveItems ? "[    ]" : "[DONE]"} ${epic}`);
    }

    return labels;
  }, [data, epicOptions]);

  const editorEpicOptions = useMemo(() => {
    const epics = new Set(
      (data?.document.items ?? [])
        .map((item) => item.epic)
        .filter((epic): epic is string => Boolean(epic?.trim())),
    );

    if (editor?.epic.trim()) {
      epics.add(editor.epic.trim());
    }

    return Array.from(epics).sort((left, right) => left.localeCompare(right));
  }, [data, editor?.epic]);

  const nextEpicStub = useMemo(() => {
    const maxEpicNumber = (data?.document.items ?? []).reduce((highest, item) => {
      const match = item.epic.match(/\bEpic\s+(\d+)\b/i);
      if (!match) return highest;
      return Math.max(highest, Number(match[1]));
    }, 0);

    return `Epic ${maxEpicNumber + 1}: `;
  }, [data]);

  const editorIsDirty = useMemo(() => {
    if (!editor || !editorBaseline) return false;
    return normalizeEditorItem(editor) !== normalizeEditorItem(editorBaseline);
  }, [editor, editorBaseline]);

  async function saveItem(item: BacklogItem) {
    if (!data) return;

    const isNew = !item.id;
    const endpoint = isNew ? "/api/backlog/items" : `/api/backlog/items/${item.id}`;
    const method = isNew ? "POST" : "PUT";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: data.version,
        item: {
          ...item,
          acceptanceCriteria: item.acceptanceCriteria.filter(Boolean),
        },
      }),
    });

    if (response.status === 409) {
      setError("The file changed on disk. I reloaded the latest backlog state.");
      await loadBacklog();
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Failed to save item");
    }

    const updated = (await response.json()) as BacklogResponse;
    setData({ ...data, version: updated.version, document: updated.document });
    latestVersionRef.current = updated.version;
    closeEditorImmediate();
    setError(null);
  }

  async function moveItem(item: BacklogItem, status: Status) {
    const readyForBen = status === "Ready" ? "Yes" : item.readyForBen;
    await saveItem({ ...item, status, readyForBen });
  }

  async function deleteItem(itemId: string) {
    if (!data) return;

    const response = await fetch(`/api/backlog/items/${itemId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: data.version }),
    });

    if (response.status === 409) {
      setError("The file changed on disk. I reloaded the latest backlog state.");
      await loadBacklog();
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Failed to delete item");
    }

    const updated = (await response.json()) as BacklogResponse;
    setData({ ...data, version: updated.version, document: updated.document });
    latestVersionRef.current = updated.version;
    closeEditorImmediate();
    setError(null);
  }

  function openEditor(item: BacklogItem) {
    const snapshot = { ...item };
    setEditor(snapshot);
    setEditorBaseline(snapshot);
    setShowEpicCreator(false);
    setNewEpicDraft("");
    setShowUnsavedChangesNotice(false);
    setEditorPosition(centeredEditorPosition());
  }

  function closeEditorImmediate() {
    setEditor(null);
    setEditorBaseline(null);
    setShowEpicCreator(false);
    setNewEpicDraft("");
    setShowUnsavedChangesNotice(false);
  }

  function closeEditor() {
    if (editorIsDirty) {
      setShowUnsavedChangesNotice(true);
      return;
    }
    closeEditorImmediate();
  }

  async function saveCurrentEditor() {
    if (!editor) return;
    await saveItem(editor);
  }

  function discardEditorChanges() {
    if (!editorBaseline) return;
    setEditor({ ...editorBaseline });
    setShowEpicCreator(false);
    setNewEpicDraft("");
    setShowUnsavedChangesNotice(false);
  }

  async function handleSaveAndClose() {
    try {
      await saveCurrentEditor();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  function createEpicForEditor() {
    if (!editor) return;
    const epicName = newEpicDraft.trim();
    if (!epicName) return;
    setEditor({ ...editor, epic: epicName });
    setShowEpicCreator(false);
    setNewEpicDraft("");
  }

  async function chooseBacklogFile() {
    setChoosingFile(true);
    setError(null);

    try {
      const response = await fetch("/api/backlog/choose", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | BacklogResponse
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error((payload as { message?: string } | null)?.message ?? "Failed to choose backlog file.");
      }

      const backlog = payload as BacklogResponse;
      setData(backlog);
      setTitleDraft(backlog.document.title);
      latestVersionRef.current = backlog.version;
      setRecentBacklogs(rememberBacklog(backlog));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setChoosingFile(false);
    }
  }

  async function selectBacklogFile(filePath: string) {
    setError(null);

    try {
      const response = await fetch("/api/backlog/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath }),
      });
      const payload = (await response.json().catch(() => null)) as
        | BacklogResponse
        | { message?: string }
        | null;

      if (!response.ok) {
        const message =
          (payload as { message?: string } | null)?.message ?? "Failed to switch backlog file.";
        setMissingBacklogNotice({
          path: filePath,
          displayName:
            recentBacklogs.find((entry) => entry.path === filePath)?.displayName ?? filePath,
          message,
        });
        throw new Error(message);
      }

      const backlog = payload as BacklogResponse;
      setData(backlog);
      setTitleDraft(backlog.document.title);
      latestVersionRef.current = backlog.version;
      setRecentBacklogs(rememberBacklog(backlog));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function createBacklogFile() {
    setCreatingFile(true);
    setError(null);

    try {
      const response = await fetch("/api/backlog/new", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | BacklogResponse
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error((payload as { message?: string } | null)?.message ?? "Failed to create backlog file.");
      }

      const backlog = payload as BacklogResponse;
      setData(backlog);
      setTitleDraft(backlog.document.title);
      latestVersionRef.current = backlog.version;
      setRecentBacklogs(rememberBacklog(backlog));
      setAgentStatus(`Created ${backlog.displayName}.`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setCreatingFile(false);
    }
  }

  async function saveTitle() {
    if (!data) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle || nextTitle === data.document.title) return;

    setSavingTitle(true);
    try {
      const response = await fetch("/api/backlog/title", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: data.version, title: nextTitle }),
      });
      const payload = (await response.json().catch(() => null)) as
        | BacklogResponse
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error((payload as { message?: string } | null)?.message ?? "Failed to save title.");
      }

      const backlog = payload as BacklogResponse;
      setData(backlog);
      setTitleDraft(backlog.document.title);
      latestVersionRef.current = backlog.version;
      setRecentBacklogs(rememberBacklog(backlog));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSavingTitle(false);
    }
  }



  function onEditorPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    draggingEditorRef.current = true;
    dragOffsetRef.current = {
      x: event.clientX - editorPosition.x,
      y: event.clientY - editorPosition.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onEditorPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingEditorRef.current) return;
    const nextX = Math.max(16, Math.min(window.innerWidth - 420, event.clientX - dragOffsetRef.current.x));
    const nextY = Math.max(16, Math.min(window.innerHeight - 180, event.clientY - dragOffsetRef.current.y));
    setEditorPosition({ x: nextX, y: nextY });
  }

  function onEditorPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    draggingEditorRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onPaulaPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    draggingPaulaRef.current = true;
    paulaDragOffsetRef.current = {
      x: event.clientX - paulaPanelPosition.x,
      y: event.clientY - paulaPanelPosition.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPaulaPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingPaulaRef.current) return;
    const nextX = Math.max(16, Math.min(window.innerWidth - DEFAULT_PAULA_PANEL_SIZE.width, event.clientX - paulaDragOffsetRef.current.x));
    const nextY = Math.max(16, Math.min(window.innerHeight - 220, event.clientY - paulaDragOffsetRef.current.y));
    setPaulaPanelPosition({ x: nextX, y: nextY });
  }

  function onPaulaPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    draggingPaulaRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function openPaulaPanel() {
    setPaulaPanelPosition((current) => {
      const maxX = Math.max(16, window.innerWidth - DEFAULT_PAULA_PANEL_SIZE.width);
      const maxY = Math.max(16, window.innerHeight - 220);
      const nextX = Math.max(16, Math.min(maxX, current.x));
      const nextY = Math.max(16, Math.min(maxY, current.y));
      return { x: nextX, y: nextY };
    });
    setShowPaulaPanel(true);
  }

  function reorderSortKeys(source: SortKey, target: SortKey) {
    if (source === target) return;
    setSortOrder((current) => {
      const next = [...current];
      const sourceIndex = next.indexOf(source);
      const targetIndex = next.indexOf(target);
      if (sourceIndex === -1 || targetIndex === -1) return current;
      next.splice(sourceIndex, 1);
      const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      next.splice(insertIndex, 0, source);
      return next;
    });
  }

  function toggleSortDirection(key: SortKey) {
    setSortDirections((current) => ({
      ...current,
      [key]: current[key] === "asc" ? "desc" : "asc",
    }));
  }

  function sortChipClass(key: SortKey) {
    if (!draggingSortKey || !dragOverSortKey || draggingSortKey === dragOverSortKey) {
      return "";
    }

    const sourceIndex = sortOrder.indexOf(draggingSortKey);
    const targetIndex = sortOrder.indexOf(dragOverSortKey);
    const effectiveInsertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const currentIndex = sortOrder.indexOf(key);

    if (effectiveInsertIndex === sourceIndex) {
      return key === draggingSortKey ? "is-dragging" : "";
    }

    if (key === draggingSortKey) {
      return "is-dragging";
    }

    if (key === dragOverSortKey) {
      return "is-target";
    }

    if (sourceIndex < targetIndex && currentIndex > sourceIndex && currentIndex <= targetIndex) {
      return "shifts-left";
    }

    if (sourceIndex > targetIndex && currentIndex >= targetIndex && currentIndex < sourceIndex) {
      return "shifts-right";
    }

    return "";
  }

  if (loading) {
    return <div className="screen-state">Loading backlog…</div>;
  }

  if (error && !data) {
    return (
      <div className="screen-state">
        <p>{error}</p>
        <button onClick={() => void loadBacklog()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="app-shell" style={themeVars(data?.displayName ?? data?.document.title ?? "backlog")}>
      <header className="hero">
        <div>
          <p className="eyebrow">Backlog Manager</p>
          <div className="hero-title-row">
            <input
              className="hero-title-input"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveTitle();
                }
              }}
              aria-label="Project name"
            />
            <div className="shortcut-chip-row hero-chip-row">
              <button
                type="button"
                className="source-picker"
                onClick={() => void createBacklogFile()}
                disabled={creatingFile}
              >
                <span className="source-picker-title">{creatingFile ? "Creating…" : "New"}</span>
              </button>
              <button
                type="button"
                className="source-picker"
                onClick={() => void chooseBacklogFile()}
                disabled={choosingFile}
              >
                <span className="source-picker-title">
                  {choosingFile ? "Opening…" : "Open"}
                </span>
              </button>
              {recentBacklogs.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className={`shortcut-chip ${data?.path === entry.path ? "is-active" : ""}`}
                  style={hashToPastel(entry.displayName)}
                  onClick={() => void selectBacklogFile(entry.path)}
                  title={entry.path}
                >
                  <span className="shortcut-chip-label">{entry.displayName}</span>
                </button>
              ))}
            </div>
            <div className="metrics-row hero-metrics-row">
              <div className="meta-card metric-card metric-card--plain">
                <span className="meta-label">Stories</span>
                <div className="metric-value">{data?.document.items.length ?? 0}</div>
              </div>
              <div className="meta-card metric-card metric-card--plain">
                <span className="meta-label">Epics</span>
                <div className="metric-value">
                  {new Set(data?.document.items.map((item) => item.epic)).size}
                </div>
              </div>
            </div>
          </div>
          {savingTitle ? <span className="agent-status">Saving title…</span> : null}
        </div>
      </header>

      {error ? <div className="banner-error">{error}</div> : null}

      <section className="epic-filter-strip">
        <div className="board-controls">
          <div className="sort-switcher">
            <span className="meta-label">Sort</span>
            <div className="sort-pill-row">
              {sortOrder.map((key) => (
                <div key={key} className={`sort-pill-group ${sortChipClass(key)}`}>
                  <button
                    type="button"
                    className={`sort-pill sort-pill--${key}`}
                    draggable
                    onDragStart={() => setDraggingSortKey(key)}
                    onDragEnd={() => {
                      setDraggingSortKey(null);
                      setDragOverSortKey(null);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (draggingSortKey && draggingSortKey !== key) {
                        setDragOverSortKey(key);
                      }
                    }}
                    onDrop={() => {
                      if (draggingSortKey && draggingSortKey !== key) {
                        reorderSortKeys(draggingSortKey, key);
                      }
                      setDraggingSortKey(null);
                      setDragOverSortKey(null);
                    }}
                    title="Drag to reorder sort priority"
                  >
                    <span className="sort-pill-handle">::</span>
                    {SORT_LABELS[key]}
                  </button>
                  <button
                    type="button"
                    className={`sort-direction-button sort-direction-button--${key}`}
                    onClick={() => toggleSortDirection(key)}
                    aria-label={`Sort ${SORT_LABELS[key]} ${sortDirections[key] === "asc" ? "descending" : "ascending"}`}
                    title={`Currently ${sortDirections[key] === "asc" ? "ascending" : "descending"}`}
                  >
                    <span aria-hidden="true">{sortDirections[key] === "asc" ? "↑" : "↓"}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="filter-switchers">
            <label className="epic-switcher">
              <span className="meta-label">Epic</span>
              <select
                value={selectedEpic}
                onChange={(event) => setSelectedEpic(event.target.value)}
              >
                {epicOptions.map((epic) => (
                  <option key={epic} value={epic}>
                    {epicOptionLabels.get(epic) ?? epic}
                  </option>
                ))}
              </select>
            </label>
            <label className="epic-switcher owner-switcher">
              <span className="meta-label">Owner</span>
              <select
                value={selectedOwner}
                onChange={(event) => setSelectedOwner(event.target.value)}
              >
                {ownerOptions.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <main className="board">
        {STATUSES.map((status) => {
          const epicMap = grouped.get(status) ?? new Map<string, BacklogItem[]>();
          const epicEntries = Array.from(epicMap.entries());
          return (
            <section
              key={status}
              className="lane"
              onDragOver={(event) => event.preventDefault()}
              onDrop={async () => {
                if (!draggingId || !data) return;
                const item = data.document.items.find((candidate) => candidate.id === draggingId);
                if (!item || item.status === status) return;
                try {
                  await moveItem(item, status);
                } catch (caught) {
                  setError((caught as Error).message);
                } finally {
                  setDraggingId(null);
                }
              }}
            >
              <div className="lane-header">
                <h2>{status}</h2>
                <span>{epicEntries.reduce((sum, [, items]) => sum + items.length, 0)}</span>
              </div>

              <div className="lane-scroll">
                {epicEntries.length === 0 ? (
                  <div className="lane-empty">No stories in this lane.</div>
                ) : (
                  epicEntries.map(([epic, items], index) => (
                    <div key={`${status}-${epic}`} className="epic-block">
                      {selectedEpic === "All epics" && index > 0 ? (
                        <div className="epic-divider" aria-hidden="true" />
                      ) : null}
                      <div className="epic-title">{epic}</div>
                      {items.map((item) => (
                        <article
                          key={item.id}
                          className="story-card"
                          draggable
                          onDragStart={() => setDraggingId(item.id)}
                          onClick={() => openEditor(item)}
                        >
                          <div className="story-topline">
                            <span className={`priority-chip ${item.priority.toLowerCase()}`}>
                              {item.priority}
                            </span>
                            <span className="story-id">{item.id}</span>
                          </div>
                          <h3>{item.title}</h3>
                          <p>{item.summary}</p>
                          <div className="story-meta-line">
                            <span className="story-pill story-pill--owner">{item.owner}</span>
                            <span className="story-pill story-pill--status">{item.status}</span>
                            {item.dueDate ? (
                              <span className="story-pill story-pill--due">Due {formatDueDate(item.dueDate)}</span>
                            ) : null}
                          </div>
                          <div className="story-last-updated">{formatLastUpdated(item.lastUpdated)}</div>
                        </article>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </main>

      {editor ? (
        <div className="editor-layer">
          <div className="editor-scrim" onClick={closeEditor} />
          {showUnsavedChangesNotice ? (
            <div
              className="editor-confirmation"
              style={{
                left: `${Math.max(16, editorPosition.x + Math.round(DEFAULT_EDITOR_WIDTH / 2) - 170)}px`,
                top: `${Math.max(24, editorPosition.y + 92)}px`,
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="editor-confirmation-actions">
                <button
                  type="button"
                  className="icon-button icon-button--save"
                  aria-label="Save changes"
                  title="Save"
                  onClick={() => void handleSaveAndClose()}
                >
                  {saveIcon()}
                </button>
                <button
                  type="button"
                  className="icon-button icon-button--danger"
                  aria-label="Discard changes"
                  title="Discard"
                  onClick={closeEditorImmediate}
                >
                  {discardIcon()}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Cancel"
                  title="Cancel"
                  onClick={() => setShowUnsavedChangesNotice(false)}
                >
                  {closeIcon()}
                </button>
              </div>
            </div>
          ) : null}
          {showEpicCreator ? (
            <div
              className="epic-overlay"
              style={{
                left: `${Math.min(editorPosition.x + 36, window.innerWidth - 360)}px`,
                top: `${Math.max(editorPosition.y - 132, 20)}px`,
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <p className="eyebrow">New Epic</p>
              <input
                value={newEpicDraft}
                placeholder="New epic name"
                onChange={(event) => setNewEpicDraft(event.target.value)}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    createEpicForEditor();
                  }
                  if (event.key === "Escape") {
                    setShowEpicCreator(false);
                    setNewEpicDraft("");
                  }
                }}
              />
              <div className="epic-overlay-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setShowEpicCreator(false);
                    setNewEpicDraft("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={newEpicDraft.trim().length === 0}
                  onClick={createEpicForEditor}
                >
                  Add epic
                </button>
              </div>
            </div>
          ) : null}
          <form
            className="editor-form"
            style={{
              left: `${editorPosition.x}px`,
              top: `${editorPosition.y}px`,
            }}
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await saveCurrentEditor();
              } catch (caught) {
                setError((caught as Error).message);
              }
            }}
          >
            <div className="editor-header">
              <div>
                <div className="editor-topline">
                  <p className="eyebrow">{editor.id || "New backlog story"}</p>
                  <div
                    className="editor-drag-handle"
                    onPointerDown={onEditorPointerDown}
                    onPointerMove={onEditorPointerMove}
                    onPointerUp={onEditorPointerUp}
                    aria-hidden="true"
                  />
                </div>
                <input
                  className="editor-title-input"
                  value={editor.title}
                  placeholder="Untitled story"
                  onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                  onPointerDown={(event) => event.stopPropagation()}
                  required
                  aria-label="Story title"
                />
              </div>
              <div className="editor-actions">
                <button
                  type="submit"
                  className="icon-button icon-button--save"
                  aria-label="Save story"
                  title="Save"
                  disabled={!editorIsDirty}
                >
                  {saveIcon()}
                </button>
                <button
                  type="button"
                  className="icon-button icon-button--discard"
                  aria-label="Discard edits"
                  title="Discard edits"
                  disabled={!editorIsDirty}
                  onClick={discardEditorChanges}
                >
                  {discardIcon()}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close editor"
                  title="Close"
                  onClick={closeEditor}
                >
                  {closeIcon()}
                </button>
              </div>
            </div>

            <div className="form-grid">
              <label>
                Epic
                <div className="epic-select-row">
                  <select
                    value={editor.epic}
                    onChange={(event) => setEditor({ ...editor, epic: event.target.value })}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <option value="">Unassigned</option>
                    {editorEpicOptions.map((epic) => (
                      <option key={epic} value={epic}>
                        {epic}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="epic-add-button"
                    onClick={() => {
                      setShowEpicCreator((current) => !current);
                      setNewEpicDraft(nextEpicStub);
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    aria-label="Create epic"
                  >
                    +
                  </button>
                </div>
              </label>
              <label>
                Status
                <select
                  value={editor.status}
                  onChange={(event) =>
                    setEditor({ ...editor, status: event.target.value as BacklogItem["status"] })
                  }
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  value={editor.priority}
                  onChange={(event) =>
                    setEditor({ ...editor, priority: event.target.value as BacklogItem["priority"] })
                  }
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Owner
                <input
                  value={editor.owner}
                  onChange={(event) => setEditor({ ...editor, owner: event.target.value })}
                />
              </label>
              <label>
                Requester
                <input
                  value={editor.requester}
                  onChange={(event) => setEditor({ ...editor, requester: event.target.value })}
                />
              </label>
              <label>
                Due Date
                <input
                  type="date"
                  value={editor.dueDate}
                  onChange={(event) => setEditor({ ...editor, dueDate: event.target.value })}
                />
              </label>
              <label>
                Ready for Implementation?
                <select
                  value={editor.readyForBen}
                  onChange={(event) =>
                    setEditor({ ...editor, readyForBen: event.target.value as "Yes" | "No" })
                  }
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </label>
              <label>
                Tech handoff owner
                <select
                  value={editor.techHandoffOwner}
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      techHandoffOwner: event.target.value as BacklogItem["techHandoffOwner"],
                    })
                  }
                >
                  {HANDOFF_OWNERS.map((owner) => (
                    <option key={owner} value={owner}>
                      {owner}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Summary
              <textarea
                rows={2}
                value={editor.summary}
                onChange={(event) => setEditor({ ...editor, summary: event.target.value })}
              />
            </label>
            <label>
              Outcome / user value
              <textarea
                rows={2}
                value={editor.outcome}
                onChange={(event) => setEditor({ ...editor, outcome: event.target.value })}
              />
            </label>
            <label>
              Scope notes
              <textarea
                rows={3}
                value={editor.scopeNotes}
                onChange={(event) => setEditor({ ...editor, scopeNotes: event.target.value })}
              />
            </label>
            <label>
              Acceptance criteria
              <textarea
                rows={4}
                value={editor.acceptanceCriteria.join("\n")}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    acceptanceCriteria: event.target.value.split("\n"),
                  })
                }
              />
            </label>
            <label>
              Dependencies
              <textarea
                rows={2}
                value={editor.dependencies}
                onChange={(event) => setEditor({ ...editor, dependencies: event.target.value })}
              />
            </label>
            <label>
              Links
              <textarea
                rows={2}
                value={editor.links}
                onChange={(event) => setEditor({ ...editor, links: event.target.value })}
              />
            </label>
            <label>
              Implementation notes
              <textarea
                rows={3}
                value={editor.implementationNotes}
                onChange={(event) =>
                  setEditor({ ...editor, implementationNotes: event.target.value })
                }
              />
            </label>

            {editor.id ? (
              <div className="editor-delete-row">
                <button
                  type="button"
                  className="ghost-button editor-delete-button"
                  onClick={async () => {
                    if (!window.confirm(`Delete ${editor.id} from the backlog?`)) return;
                    try {
                      await deleteItem(editor.id);
                    } catch (caught) {
                      setError((caught as Error).message);
                    }
                  }}
                >
                  {trashIcon()}
                  <span>Delete story</span>
                </button>
              </div>
            ) : null}

          </form>
        </div>
      ) : null}

      {missingBacklogNotice ? (
        <div className="notice-layer">
          <div className="notice-popover">
            <p className="eyebrow">Backlog Unavailable</p>
            <h2>{missingBacklogNotice.displayName}</h2>
            <p className="notice-copy">{missingBacklogNotice.message}</p>
            <div className="notice-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setMissingBacklogNotice(null)}
              >
                Dismiss
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setRecentBacklogs(removeRecentBacklog(missingBacklogNotice.path));
                  setMissingBacklogNotice(null);
                }}
              >
                Remove chip
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPaulaPanel ? (
        <div
          className="floating-paula-panel"
          style={{ left: `${paulaPanelPosition.x}px`, top: `${paulaPanelPosition.y}px` }}
        >
          <div
            className="floating-paula-header"
            onPointerDown={onPaulaPointerDown}
            onPointerMove={onPaulaPointerMove}
            onPointerUp={onPaulaPointerUp}
          >
            <span className="meta-label">Tell Paula What To Do</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Close Paula panel"
              title="Close"
              onClick={() => setShowPaulaPanel(false)}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {closeIcon()}
            </button>
          </div>
          <AgentTerminal backlogPath={data?.path} onStatusChange={setAgentStatus} />
          {agentStatus ? <span className="agent-status">{agentStatus}</span> : null}
        </div>
      ) : null}

      <button
        type="button"
        className="floating-paula-button"
        onClick={() => {
          if (showPaulaPanel) {
            setShowPaulaPanel(false);
            return;
          }
          openPaulaPanel();
        }}
        aria-label="Tell Paula what to do"
        title="Tell Paula what to do"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4.5 3.5A.75.75 0 0 1 3.5 20V17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2.5 5.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm4.5 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm4.5 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <button
        type="button"
        className="floating-add-button"
        onClick={() => openEditor({ ...EMPTY_ITEM })}
        aria-label="New story"
        title="New story"
      >
        +
      </button>
    </div>
  );
}

export default App;
