import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, FolderOpen, Maximize2, Minimize2, PlusSquare, Settings2, Trash2, Undo2, X } from "lucide-react";
import AgentTerminal from "./AgentTerminal";
import {
  BacklogItem,
  BacklogResponse,
  Effort,
  EFFORTS,
  HANDOFF_OWNERS,
  PRIORITIES,
  Priority,
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
  effort: 2,
  sprintAssigned: "",
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
const EXPANDED_PAULA_PANEL_RATIO = { width: 2 / 3, height: 2 / 3 };
const DEFAULT_SORT_ORDER = ["epic", "priority", "effort", "status", "owner", "due", "lastUpdated"] as const;
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
  Testing: 4,
  Review: 5,
  Done: 6,
};

const SORT_LABELS: Record<SortKey, string> = {
  epic: "Epic",
  priority: "Priority",
  effort: "Effort",
  status: "Status",
  owner: "Owner",
  due: "Due",
  lastUpdated: "Updated",
};


const ALL_SPRINTS = "All sprints";
const UNASSIGNED_SPRINT = "Unassigned";
const ALL_STATUSES = "All statuses";

const DEFAULT_SORT_DIRECTIONS: Record<SortKey, SortDirection> = {
  epic: "asc",
  priority: "asc",
  effort: "asc",
  status: "asc",
  owner: "asc",
  due: "asc",
  lastUpdated: "desc",
};

const NO_BACKLOG_LOADED_MESSAGE = "No backlog file is loaded.";

const compareSprintLabelsDescending = (left: string, right: string) => {
  const leftMatch = left.match(/(\d+)(?!.*\d)/);
  const rightMatch = right.match(/(\d+)(?!.*\d)/);
  if (leftMatch && rightMatch) {
    const difference = Number(rightMatch[1]) - Number(leftMatch[1]);
    if (difference !== 0) return difference;
  }
  return right.localeCompare(left);
};

interface RecentBacklog {
  path: string;
  displayName: string;
  lastOpenedAt: number;
}

interface AppConfig {
  agentCommand: string;
  configPath: string;
  recentBacklogs: RecentBacklog[];
}

interface MissingBacklogNotice {
  path: string;
  displayName: string;
  message: string;
}

interface AutoSprintTaskStatus {
  message: string | null;
  scope: "filtered" | "all";
  sprint: string;
  startedAt: number;
  status: "idle" | "running" | "completed" | "failed";
}

type DragSource = "board" | "sprint";
type QuickEditField = "title" | "summary" | "priority" | "effort" | "owner" | "status" | "sprintAssigned" | "dueDate";

type AgentPresetId = "codex" | "claude-code" | "aider" | "gemini-cli" | "custom";
type FilterCreatorKind = "epic" | "owner" | "sprint";

interface QuickEditState {
  itemId: string;
  field: QuickEditField;
  value: string;
  x: number;
  y: number;
}

interface FilterCreatorState {
  kind: FilterCreatorKind;
  x: number;
  y: number;
  assignSprintItemId?: string;
}

interface ConfigPopoverState {
  x: number;
  y: number;
}

interface SavedLayout {
  currentSprintTarget: string | null;
  selectedEpic: string;
  selectedOwner: string;
  selectedSprint: string;
  selectedStatus: string;
  textFilter: string;
  sortOrder: SortKey[];
  sortDirections: Record<SortKey, SortDirection>;
}

const SAVED_LAYOUT_STORAGE_PREFIX = "agent-backlog:saved-layout:";

const AGENT_PRESETS: Array<{ id: AgentPresetId; label: string; command: string }> = [
  {
    id: "codex",
    label: "Codex",
    command: 'codex --no-alt-screen --add-dir "$BACKLOG_DIR" "$BACKLOG_BOOTSTRAP"',
  },
  {
    id: "claude-code",
    label: "Claude Code",
    command: 'claude',
  },
  {
    id: "aider",
    label: "Aider",
    command: 'aider --yes "$BACKLOG_FILE"',
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    command: 'gemini',
  },
];

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

function paulaPanelSize(expanded: boolean) {
  if (!expanded) {
    return DEFAULT_PAULA_PANEL_SIZE;
  }

  return {
    width: Math.round(window.innerWidth * EXPANDED_PAULA_PANEL_RATIO.width),
    height: Math.round(window.innerHeight * EXPANDED_PAULA_PANEL_RATIO.height),
  };
}

function clampPaulaPanelPosition(position: { x: number; y: number }, expanded: boolean) {
  const size = paulaPanelSize(expanded);
  const maxX = Math.max(16, window.innerWidth - size.width - 16);
  const maxY = Math.max(16, window.innerHeight - size.height - 16);
  return {
    x: Math.max(16, Math.min(maxX, position.x)),
    y: Math.max(16, Math.min(maxY, position.y)),
  };
}

function defaultPaulaPanelPosition(expanded = false) {
  const size = paulaPanelSize(expanded);
  const x = Math.max(16, window.innerWidth - size.width - 28);
  const y = Math.max(16, window.innerHeight - size.height - 172);
  return { x, y };
}

function backlogUnavailableMessage(payload: { message?: string } | null) {
  const message = payload?.message?.trim();
  if (!message || message === NO_BACKLOG_LOADED_MESSAGE) {
    return null;
  }
  return message;
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

function formatSprintLabel(value: string) {
  if (!value.trim()) return "No sprint";
  const match = value.match(/(\d+)(?!.*\d)/);
  return match ? `Sprint ${match[1]}` : value;
}

function quickEditValue(item: BacklogItem, field: QuickEditField) {
  if (field === "title") return item.title;
  if (field === "summary") return item.summary;
  if (field === "priority") return item.priority;
  if (field === "effort") return String(item.effort);
  if (field === "owner") return item.owner;
  if (field === "status") return item.status;
  if (field === "sprintAssigned") return item.sprintAssigned;
  return item.dueDate;
}

function saveIcon() {
  return <Download aria-hidden="true" strokeWidth={1.9} />;
}

function closeIcon() {
  return <X aria-hidden="true" strokeWidth={1.9} />;
}

function trashIcon() {
  return <Trash2 aria-hidden="true" strokeWidth={1.9} />;
}

function discardIcon() {
  return <Undo2 aria-hidden="true" strokeWidth={1.9} />;
}

function chipRemoveIcon() {
  return <X aria-hidden="true" strokeWidth={1.9} />;
}

function settingsIcon() {
  return <Settings2 aria-hidden="true" strokeWidth={1.85} />;
}

function maximizeIcon() {
  return <Maximize2 aria-hidden="true" strokeWidth={1.9} />;
}

function minimizeIcon() {
  return <Minimize2 aria-hidden="true" strokeWidth={1.9} />;
}

function newBacklogIcon() {
  return <PlusSquare aria-hidden="true" strokeWidth={1.9} />;
}

function openBacklogIcon() {
  return <FolderOpen aria-hidden="true" strokeWidth={1.9} />;
}

function itemMatchesTextFilter(item: BacklogItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    item.id,
    item.title,
    item.status,
    item.epic,
    item.owner,
    item.requester,
    item.dateAdded,
    item.lastUpdated,
    item.dueDate,
    item.priority,
    String(item.effort),
    item.sprintAssigned,
    item.readyForBen,
    item.techHandoffOwner,
    item.summary,
    item.outcome,
    item.scopeNotes,
    ...item.acceptanceCriteria,
    item.dependencies,
    item.links,
    item.implementationNotes,
  ]
    .join("\n")
    .toLowerCase();

  return haystack.includes(normalized);
}

function App() {
  const [data, setData] = useState<BacklogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<BacklogItem | null>(null);
  const [editorBaseline, setEditorBaseline] = useState<BacklogItem | null>(null);
  const [editorPosition, setEditorPosition] = useState(DEFAULT_EDITOR_POSITION);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<DragSource>("board");
  const [quickEdit, setQuickEdit] = useState<QuickEditState | null>(null);
  const [selectedEpic, setSelectedEpic] = useState("All epics");
  const [selectedOwner, setSelectedOwner] = useState("All owners");
  const [selectedSprint, setSelectedSprint] = useState(UNASSIGNED_SPRINT);
  const [selectedStatus, setSelectedStatus] = useState(ALL_STATUSES);
  const [textFilter, setTextFilter] = useState("");
  const [currentSprintTarget, setCurrentSprintTarget] = useState<string | null>(null);
  const [currentSprintCollapsed, setCurrentSprintCollapsed] = useState(false);
  const [autoSprintEffortCap, setAutoSprintEffortCap] = useState("7");
  const [autoSprintScope, setAutoSprintScope] = useState<"filtered" | "all">("filtered");
  const [autoSprintProposal, setAutoSprintProposal] = useState<null | { selected: string[]; excluded: Array<{ id: string; reason: string }>; used: number; cap: number; sprint: string }>(null);
  const [autoSprintTaskStatus, setAutoSprintTaskStatus] = useState<AutoSprintTaskStatus | null>(null);
  const [autoSprintDotCount, setAutoSprintDotCount] = useState(0);
  const [sortOrder, setSortOrder] = useState<SortKey[]>([...DEFAULT_SORT_ORDER]);
  const [sortDirections, setSortDirections] = useState<Record<SortKey, SortDirection>>({ ...DEFAULT_SORT_DIRECTIONS });
  const [draggingSortKey, setDraggingSortKey] = useState<SortKey | null>(null);
  const [dragOverSortKey, setDragOverSortKey] = useState<SortKey | null>(null);
  const [expandedLane, setExpandedLane] = useState<Status | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [recentBacklogs, setRecentBacklogs] = useState<RecentBacklog[]>([]);
  const [missingBacklogNotice, setMissingBacklogNotice] = useState<MissingBacklogNotice | null>(null);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [agentSessionBacklogPath, setAgentSessionBacklogPath] = useState<string | null>(null);
  const [showConfigPanel, setShowConfigPanel] = useState<ConfigPopoverState | null>(null);
  const [selectedAgentPreset, setSelectedAgentPreset] = useState<AgentPresetId>("codex");
  const [customAgentCommand, setCustomAgentCommand] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [agentConfigVersion, setAgentConfigVersion] = useState(0);
  const [choosingFile, setChoosingFile] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);
  const [showEpicCreator, setShowEpicCreator] = useState(false);
  const [newEpicDraft, setNewEpicDraft] = useState("");
  const [customEpicOptions, setCustomEpicOptions] = useState<string[]>([]);
  const [customOwnerOptions, setCustomOwnerOptions] = useState<string[]>([]);
  const [customSprintOptions, setCustomSprintOptions] = useState<string[]>([]);
  const [showFilterCreator, setShowFilterCreator] = useState<FilterCreatorState | null>(null);
  const [newFilterDraft, setNewFilterDraft] = useState("");
  const [pendingSprintAssignmentItemId, setPendingSprintAssignmentItemId] = useState<string | null>(null);
  const [showUnsavedChangesNotice, setShowUnsavedChangesNotice] = useState(false);
  const [showPaulaPanel, setShowPaulaPanel] = useState(false);
  const [paulaPanelExpanded, setPaulaPanelExpanded] = useState(false);
  const [paulaPanelPosition, setPaulaPanelPosition] = useState(defaultPaulaPanelPosition);
  const paulaCompactPositionRef = useRef(defaultPaulaPanelPosition(false));
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const latestVersionRef = useRef<number | null>(null);
  const lastVisibleSprintRef = useRef<string>(UNASSIGNED_SPRINT);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const draggingEditorRef = useRef(false);
  const paulaDragOffsetRef = useRef({ x: 0, y: 0 });
  const draggingPaulaRef = useRef(false);
  const savedLayoutAppliedForPathRef = useRef<string | null>(null);

  async function loadConfig() {
    const response = await fetch("/api/config");
    const payload = (await response.json().catch(() => null)) as AppConfig | { message?: string } | null;
    if (!response.ok) {
      throw new Error((payload as { message?: string } | null)?.message ?? "Failed to load config.");
    }
    const config = payload as AppConfig;
    setAppConfig(config);
    setRecentBacklogs(config.recentBacklogs ?? []);
    const matchingPreset = AGENT_PRESETS.find((preset) => preset.command === config.agentCommand);
    setSelectedAgentPreset(matchingPreset?.id ?? "custom");
    setCustomAgentCommand(matchingPreset ? "" : config.agentCommand);
    return config;
  }

  async function rememberBacklogConfig(current: BacklogResponse) {
    const response = await fetch("/api/config/recent/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: current.path, displayName: current.displayName }),
    });
    const payload = (await response.json().catch(() => null)) as AppConfig | { message?: string } | null;
    if (!response.ok) {
      throw new Error((payload as { message?: string } | null)?.message ?? "Failed to update recent backlogs.");
    }
    const config = payload as AppConfig;
    setAppConfig(config);
    setRecentBacklogs(config.recentBacklogs ?? []);
    return config.recentBacklogs ?? [];
  }

  async function removeRecentBacklogConfig(pathToRemove: string) {
    const isCurrentBacklog = data?.path === pathToRemove;

    const response = await fetch("/api/config/recent/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathToRemove }),
    });
    const payload = (await response.json().catch(() => null)) as AppConfig | { message?: string } | null;
    if (!response.ok) {
      throw new Error((payload as { message?: string } | null)?.message ?? "Failed to remove recent backlog.");
    }
    const config = payload as AppConfig;
    setAppConfig(config);
    setRecentBacklogs(config.recentBacklogs ?? []);

    if (isCurrentBacklog) {
      const unloadResponse = await fetch("/api/backlog/unload", { method: "POST" });
      const unloadPayload = (await unloadResponse.json().catch(() => null)) as { message?: string } | null;
      if (!unloadResponse.ok) {
        throw new Error(unloadPayload?.message ?? "Failed to unload backlog.");
      }
      closeEditorImmediate();
      setQuickEdit(null);
      setShowPaulaPanel(false);
      setData(null);
      setTitleDraft("");
      latestVersionRef.current = null;
      setAgentStatus(null);
      setAgentSessionBacklogPath(null);
      setError(null);
    }

    return config.recentBacklogs ?? [];
  }

  async function saveAgentCommandConfig(nextCommand: string) {
    setSavingConfig(true);
    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentCommand: nextCommand }),
      });
      const payload = (await response.json().catch(() => null)) as AppConfig | { message?: string } | null;
      if (!response.ok) {
        throw new Error((payload as { message?: string } | null)?.message ?? "Failed to save agent config.");
      }
      const config = payload as AppConfig;
      setAppConfig(config);
      setRecentBacklogs(config.recentBacklogs ?? []);
      const matchingPreset = AGENT_PRESETS.find((preset) => preset.command === config.agentCommand);
      setSelectedAgentPreset(matchingPreset?.id ?? "custom");
      setCustomAgentCommand(matchingPreset ? "" : config.agentCommand);
      setAgentConfigVersion((current) => current + 1);
      setAgentStatus("Agent launch command updated.");
    } finally {
      setSavingConfig(false);
    }
  }

  function savedLayoutStorageKey(path: string) {
    return `${SAVED_LAYOUT_STORAGE_PREFIX}${path}`;
  }

  function saveCurrentLayout() {
    if (!data?.path) return;

    const layout: SavedLayout = {
      currentSprintTarget,
      selectedEpic,
      selectedOwner,
      selectedSprint,
      selectedStatus,
      textFilter,
      sortOrder,
      sortDirections,
    };

    localStorage.setItem(savedLayoutStorageKey(data.path), JSON.stringify(layout));
  }

  function applySavedLayout(path: string) {
    const raw = localStorage.getItem(savedLayoutStorageKey(path));
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Partial<SavedLayout>;
      if (Array.isArray(parsed.sortOrder) && parsed.sortOrder.every((key) => DEFAULT_SORT_ORDER.includes(key))) {
        setSortOrder(parsed.sortOrder as SortKey[]);
      }
      if (parsed.sortDirections) {
        setSortDirections((current) => ({ ...current, ...parsed.sortDirections }));
      }
      if (typeof parsed.currentSprintTarget === "string" || parsed.currentSprintTarget === null) {
        setCurrentSprintTarget(parsed.currentSprintTarget ?? null);
      }
      if (typeof parsed.selectedEpic === "string") setSelectedEpic(parsed.selectedEpic);
      if (typeof parsed.selectedOwner === "string") setSelectedOwner(parsed.selectedOwner);
      if (typeof parsed.selectedSprint === "string") setSelectedSprint(parsed.selectedSprint);
      if (typeof parsed.selectedStatus === "string") setSelectedStatus(parsed.selectedStatus);
      if (typeof parsed.textFilter === "string") setTextFilter(parsed.textFilter);
    } catch {
      localStorage.removeItem(savedLayoutStorageKey(path));
    }
  }

  async function loadBacklog(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const backlogResponse = await fetch("/api/backlog");
      const payload = (await backlogResponse.json().catch(() => null)) as { message?: string } | null;

      if (backlogResponse.status === 404) {
        setData(null);
        setTitleDraft("");
        latestVersionRef.current = null;
        setAgentStatus(null);
        setAgentSessionBacklogPath(null);
        setError(backlogUnavailableMessage(payload));
        return;
      }

      if (!backlogResponse.ok) {
        throw new Error(payload?.message ?? "Failed to load backlog");
      }

      const backlog = payload as BacklogResponse;
      setData(backlog);
      setTitleDraft(backlog.document.title);
      latestVersionRef.current = backlog.version;
      await rememberBacklogConfig(backlog);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadConfig();
      } catch (caught) {
        setError((caught as Error).message);
      }
      await loadBacklog();
    })();
  }, []);

  useEffect(() => {
    applyThemeToDocument(themeVars(data?.displayName ?? data?.document.title ?? "backlog"));
  }, [data?.displayName, data?.document.title]);

  useEffect(() => {
    if (!data?.path) return;
    if (savedLayoutAppliedForPathRef.current === data.path) return;
    savedLayoutAppliedForPathRef.current = data.path;
    applySavedLayout(data.path);
  }, [data?.path]);

  useEffect(() => {
    if (!data?.path) return;

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/agent/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restart: true }),
        });
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;

        if (!response.ok || cancelled) {
          if (!cancelled && payload?.message) {
            setAgentStatus(payload.message);
          }
          return;
        }
      } catch {
        // Ignore transient warm-start failures.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data?.path, agentConfigVersion]);

  useEffect(() => {
    const events = new EventSource("/api/backlog/events");

    const refreshFromDisk = async () => {
      try {
        const backlogResponse = await fetch("/api/backlog");
        const payload = (await backlogResponse.json().catch(() => null)) as { message?: string } | null;
        if (backlogResponse.status === 404) {
          setData(null);
          setTitleDraft("");
          latestVersionRef.current = null;
          setAgentStatus(null);
          setAgentSessionBacklogPath(null);
          setError(backlogUnavailableMessage(payload));
          return;
        }
        if (!backlogResponse.ok) return;
        const backlog = payload as BacklogResponse;
        if (latestVersionRef.current === null || backlog.version !== latestVersionRef.current) {
          setData(backlog);
          setTitleDraft(backlog.document.title);
          latestVersionRef.current = backlog.version;
          await rememberBacklogConfig(backlog);
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

  const currentSprintSelection = useMemo(() => {
    if (currentSprintTarget && currentSprintTarget.trim()) {
      return currentSprintTarget;
    }

    const sprints = new Set<string>(customSprintOptions);
    for (const item of data?.document.items ?? []) {
      if (item.sprintAssigned.trim()) {
        sprints.add(item.sprintAssigned);
      }
    }

    const sorted = Array.from(sprints).sort(compareSprintLabelsDescending);

    return sorted[0] ?? "Sprint 1";
  }, [currentSprintTarget, customSprintOptions, data]);

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

        if (key === "effort") {
          const result = (left.effort - right.effort) * direction;
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
      .filter((item) => {
        if (selectedStatus !== ALL_STATUSES && item.status !== selectedStatus) return false;
        if (selectedSprint === ALL_SPRINTS) return true;
        if (selectedSprint === UNASSIGNED_SPRINT) {
          return item.sprintAssigned.trim().length === 0 && item.status !== "Done";
        }
        return item.sprintAssigned === selectedSprint;
      })
      .filter((item) => itemMatchesTextFilter(item, textFilter))
      .sort(compareItems);

    for (const item of filteredItems) {
      if (selectedEpic !== "All epics" && item.epic !== selectedEpic) {
        continue;
      }
      if (selectedOwner !== "All owners" && item.owner !== selectedOwner) {
        continue;
      }
      if (selectedSprint !== ALL_SPRINTS) {
        if (selectedSprint === UNASSIGNED_SPRINT && item.sprintAssigned.trim().length !== 0) {
          continue;
        }
        if (selectedSprint !== UNASSIGNED_SPRINT && item.sprintAssigned !== selectedSprint) {
          continue;
        }
      }
      const lane = statuses.get(item.status)!;
      const epic = item.epic || "Unassigned";
      const bucket = lane.get(epic) ?? [];
      bucket.push(item);
      lane.set(epic, bucket);
    }

    return statuses;
  }, [currentSprintSelection, data, selectedEpic, selectedOwner, selectedSprint, sortDirections, sortOrder, textFilter]);

  const ownerOptions = useMemo(() => {
    const owners = new Set<string>(customOwnerOptions);
    for (const item of data?.document.items ?? []) {
      owners.add(item.owner || "Unassigned");
    }
    return ["All owners", ...Array.from(owners).sort()];
  }, [customOwnerOptions, data]);

  const deferredAgentContext = useMemo(() => {
    const scopeParts = [
      selectedEpic && selectedEpic !== "All epics" ? `epic: ${selectedEpic}` : null,
      selectedOwner && selectedOwner !== "All owners" ? `owner: ${selectedOwner}` : null,
      selectedSprint && selectedSprint !== ALL_SPRINTS ? `sprint: ${selectedSprint}` : null,
      textFilter.trim() ? `text filter: "${textFilter.trim()}"` : null,
    ].filter(Boolean);

    return scopeParts.length
      ? `Context update: current UI filters are ${scopeParts.join(", ")}. Treat these only as scope guidance and prioritization hints. You may still inspect or update other tickets in the same backlog when the user's request plausibly requires broader context or cross-ticket coordination.`
      : "Context update: no narrowing UI filters are active. Treat the whole backlog as in scope unless the user says otherwise.";
  }, [selectedEpic, selectedOwner, selectedSprint, textFilter]);

  const sprintOptions = useMemo(() => {
    const sprints = new Set<string>(customSprintOptions);
    for (const item of data?.document.items ?? []) {
      if (item.sprintAssigned.trim()) {
        sprints.add(item.sprintAssigned);
      }
    }

    return [ALL_SPRINTS, UNASSIGNED_SPRINT, ...Array.from(sprints).sort(compareSprintLabelsDescending)];
  }, [customSprintOptions, data]);

  useEffect(() => {
    setCurrentSprintTarget(null);
  }, [data?.path]);

  const availableSprintTargets = useMemo(() => sprintOptions.filter((sprint) => sprint !== ALL_SPRINTS && sprint !== UNASSIGNED_SPRINT), [sprintOptions]);

  const currentSprintItems = useMemo(() => {
    if (!data) return [];
    if (!currentSprintSelection.trim()) return [];
    return data.document.items
      .filter((item) => item.sprintAssigned === currentSprintSelection)
      .filter((item) => itemMatchesTextFilter(item, textFilter));
  }, [currentSprintSelection, data, textFilter]);

  const autoSprintSelectedItems = useMemo(() => {
    if (!data || !autoSprintProposal) return [] as BacklogItem[];
    const byId = new Map(data.document.items.map((item) => [item.id, item] as const));
    return autoSprintProposal.selected.map((id) => byId.get(id)).filter((item): item is BacklogItem => Boolean(item));
  }, [data, autoSprintProposal]);

  const autoSprintExcludedItems = useMemo(() => {
    if (!data || !autoSprintProposal) return [] as Array<{ item: BacklogItem | null; id: string; reason: string }>;
    const byId = new Map(data.document.items.map((item) => [item.id, item] as const));
    return autoSprintProposal.excluded.map((entry) => ({ item: byId.get(entry.id) ?? null, id: entry.id, reason: entry.reason }));
  }, [data, autoSprintProposal]);

  const isAutoSprintRunning = autoSprintTaskStatus?.status === "running";

  useEffect(() => {
    if (currentSprintItems.length > 0) {
      lastVisibleSprintRef.current = currentSprintSelection;
      return;
    }

    if (!data || !currentSprintSelection.trim()) return;

    const previousSprint = lastVisibleSprintRef.current;
    if (!previousSprint || previousSprint === currentSprintSelection) return;

    const previousSprintStillExists = data.document.items.some((item) => item.sprintAssigned === previousSprint);
    if (previousSprintStillExists) return;

    setCurrentSprintTarget(previousSprint);
    setCustomSprintOptions((current) => (current.includes(previousSprint) ? current : [...current, previousSprint]));
  }, [currentSprintItems.length, currentSprintSelection, data]);

  useEffect(() => {
    if (!isAutoSprintRunning) {
      setAutoSprintDotCount(0);
      return;
    }

    const timer = window.setInterval(() => {
      setAutoSprintDotCount((current) => (current + 1) % 4);
    }, 420);

    return () => window.clearInterval(timer);
  }, [isAutoSprintRunning]);

  useEffect(() => {
    if (!isAutoSprintRunning) {
      return;
    }

    let cancelled = false;
    const poll = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch("/api/backlog/sprints/auto/status");
          const payload = (await response.json().catch(() => null)) as AutoSprintTaskStatus | null;
          if (!response.ok || cancelled || !payload) {
            return;
          }

          setAutoSprintTaskStatus(payload);

          if (payload.status === "completed") {
            setAgentStatus(payload.message ?? `Auto Sprint finished for ${payload.sprint}.`);
            await loadBacklog({ silent: true });
          } else if (payload.status === "failed") {
            setError(payload.message ?? "Auto Sprint failed.");
          }
        } catch {
          // Ignore transient polling failures while Auto Sprint is running.
        }
      })();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [isAutoSprintRunning]);

  const currentSprintEffort = useMemo(() => currentSprintItems.reduce((sum, item) => sum + item.effort, 0), [currentSprintItems]);
  const autoSprintEffortCapNumber = useMemo(() => Number.parseInt(autoSprintEffortCap, 10), [autoSprintEffortCap]);
  const isCurrentSprintOverCapacity = Number.isInteger(autoSprintEffortCapNumber) && currentSprintEffort > autoSprintEffortCapNumber;

  const epicOptions = useMemo(() => {
    const epics = new Set<string>(customEpicOptions);
    for (const item of data?.document.items ?? []) {
      epics.add(item.epic || "Unassigned");
    }
    return ["All epics", ...Array.from(epics).sort()];
  }, [customEpicOptions, data]);

  const epicOptionLabels = useMemo(() => {
    const labels = new Map<string, string>();
    labels.set("All epics", "All epics");

    for (const epic of epicOptions) {
      if (epic === "All epics") continue;

      const itemsForEpic = (data?.document.items ?? []).filter((item) => (item.epic || "Unassigned") === epic);
      const doneCount = itemsForEpic.filter((item) => item.status === "Done").length;
      const openCount = itemsForEpic.length - doneCount;
      const label = openCount > 0 ? `Open (${openCount})` : `Done (${doneCount})`;
      labels.set(epic, `${label} - ${epic}`);
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

  const nextSprintNumber = useMemo(() => {
    const maxSprintNumber = (data?.document.items ?? []).reduce((highest, item) => {
      const match = item.sprintAssigned.match(/(\d+)(?!.*\d)/);
      if (!match) return highest;
      return Math.max(highest, Number(match[1]));
    }, 0);

    return String(maxSprintNumber + 1);
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

  async function assignItemToSprint(item: BacklogItem, sprintAssigned: string) {
    if (item.status === "Done" && item.sprintAssigned && !sprintAssigned.trim()) {
      throw new Error("Done stories stay locked to their sprint.");
    }
    await saveItem({ ...item, sprintAssigned });
  }

  async function runAutoSprint() {
    if (!data) return;
    const cap = Number.parseInt(autoSprintEffortCap, 10);
    if (!Number.isInteger(cap) || cap < 1) {
      setError("Enter a positive whole number for effort cap.");
      return;
    }

    const response = await fetch("/api/backlog/sprints/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sprint: currentSprintSelection,
        effortCap: cap,
        scope: autoSprintScope,
        filters: {
          epic: selectedEpic,
          owner: selectedOwner,
          sprint: selectedSprint,
          text: textFilter,
        },
      }),
    });

    if (response.status === 409) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message ?? "Auto Sprint is already running.");
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Failed to run Auto Sprint");
    }

    const payload = (await response.json().catch(() => null)) as { message?: string; sprint?: string; status?: "running" } | null;
    setAutoSprintProposal(null);
    setAutoSprintTaskStatus({
      message: payload?.message ?? `Auto Sprint started for ${currentSprintSelection}.`,
      scope: autoSprintScope,
      sprint: payload?.sprint ?? currentSprintSelection,
      startedAt: Date.now(),
      status: "running",
    });
    setAgentStatus(payload?.message ?? `Auto Sprint started for ${currentSprintSelection}.`);
    setError(null);
  }

  async function runAutoGroom() {
    if (!data) return;
    if (!currentSprintSelection || currentSprintSelection === UNASSIGNED_SPRINT) {
      setError("Select a valid current sprint before starting Auto Groom.");
      return;
    }

    openPaulaPanel();
    setAgentStatus(`Opening Paula chat for ${currentSprintSelection}...`);
    const response = await fetch("/api/agent/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedSprint: currentSprintSelection,
        selectedEpic,
        selectedOwner,
        textFilter,
      }),
    });

    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.message ?? "Failed to start Auto Groom");
    }

    setAgentStatus(payload?.message ?? `Auto Groom started for ${currentSprintSelection}.`);
    setError(null);
  }

  async function clearSprintAssignments(sprint: string) {
    if (!data) return;

    const confirmed = window.confirm(`Clear all sprint assignments from ${sprint}?`);
    if (!confirmed) {
      return;
    }

    const response = await fetch("/api/backlog/sprints/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: data.version, sprint }),
    });

    if (response.status === 409) {
      setError("The file changed on disk. I reloaded the latest backlog state.");
      await loadBacklog();
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Failed to clear sprint assignments");
    }

    const updated = (await response.json()) as BacklogResponse;
    setData({ ...data, version: updated.version, document: updated.document });
    latestVersionRef.current = updated.version;
    setError(null);
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

  function openFilterCreator(
    kind: FilterCreatorKind,
    event: { currentTarget: HTMLElement; preventDefault(): void; stopPropagation(): void },
    options?: { assignSprintItemId?: string },
  ) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 360;
    const height = 168;
    const x = Math.min(Math.max(16, rect.left), Math.max(16, window.innerWidth - width - 16));
    const y = Math.min(Math.max(16, rect.bottom + 10), Math.max(16, window.innerHeight - height - 16));
    setShowFilterCreator({ kind, x, y, assignSprintItemId: options?.assignSprintItemId });
    setPendingSprintAssignmentItemId(options?.assignSprintItemId ?? null);
    if (kind === "epic") {
      setNewFilterDraft(nextEpicStub);
      return;
    }
    if (kind === "owner") {
      setNewFilterDraft("");
      return;
    }
    if (kind === "sprint") {
      setNewFilterDraft(nextSprintNumber);
      return;
    }
    setNewFilterDraft("");
  }

  async function createFilterOption() {
    if (!showFilterCreator) return;
    const value = newFilterDraft.trim();
    if (!value) return;

    const assignSprintItemId = showFilterCreator.assignSprintItemId ?? pendingSprintAssignmentItemId;

    if (showFilterCreator.kind === "epic") {
      setCustomEpicOptions((current) => (current.includes(value) ? current : [...current, value]));
      setSelectedEpic(value);
      setShowFilterCreator(null);
      setNewFilterDraft("");
      setPendingSprintAssignmentItemId(null);
      return;
    }

    if (showFilterCreator.kind === "owner") {
      setCustomOwnerOptions((current) => (current.includes(value) ? current : [...current, value]));
      setShowFilterCreator(null);
      setNewFilterDraft("");
      setPendingSprintAssignmentItemId(null);
      return;
    }

    const sprintNumber = Number.parseInt(value, 10);
    if (!Number.isFinite(sprintNumber) || sprintNumber < 1) return;
    const sprintLabel = `Sprint ${sprintNumber}`;
    setCustomSprintOptions((current) => (current.includes(sprintLabel) ? current : [...current, sprintLabel]));
    setCurrentSprintTarget(sprintLabel);
    setShowFilterCreator(null);
    setNewFilterDraft("");
    setPendingSprintAssignmentItemId(null);

    if (!assignSprintItemId || !data) return;
    const item = data.document.items.find((candidate) => candidate.id === assignSprintItemId);
    if (!item) return;

    try {
      await assignItemToSprint(item, sprintLabel);
      setQuickEdit(null);
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

  function openQuickEditor(
    item: BacklogItem,
    field: QuickEditField,
    event: React.MouseEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const popoverWidth = field === "summary" ? 340 : 260;
    const popoverHeight = field === "summary" ? 220 : 164;
    const x = Math.min(
      Math.max(16, rect.left),
      Math.max(16, window.innerWidth - popoverWidth - 16),
    );
    const y = Math.min(
      Math.max(16, rect.bottom + 10),
      Math.max(16, window.innerHeight - popoverHeight - 16),
    );

    setQuickEdit({
      itemId: item.id,
      field,
      value: quickEditValue(item, field),
      x,
      y,
    });
  }

  async function saveQuickEdit() {
    if (!quickEdit || !data) return;
    const item = data.document.items.find((candidate) => candidate.id === quickEdit.itemId);
    if (!item) {
      setQuickEdit(null);
      return;
    }

    const trimmedValue = quickEdit.value.trim();
    const nextItem: BacklogItem = {
      ...item,
      title: quickEdit.field === "title" ? trimmedValue || item.title : item.title,
      summary: quickEdit.field === "summary" ? trimmedValue : item.summary,
      priority: quickEdit.field === "priority" ? (quickEdit.value as Priority) : item.priority,
      effort:
        quickEdit.field === "effort"
          ? (Number.parseInt(quickEdit.value, 10) as Effort)
          : item.effort,
      owner: quickEdit.field === "owner" ? trimmedValue || item.owner : item.owner,
      status: quickEdit.field === "status" ? (quickEdit.value as Status) : item.status,
      sprintAssigned:
        quickEdit.field === "sprintAssigned"
          ? trimmedValue
          : item.sprintAssigned,
      dueDate: quickEdit.field === "dueDate" ? quickEdit.value : item.dueDate,
    };

    try {
      await saveItem(nextItem);
      setQuickEdit(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  function handleQuickEditKeyDown(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setQuickEdit(null);
      return;
    }

    const isSummaryField = quickEdit?.field === "summary";
    const shouldSave = isSummaryField
      ? (event.metaKey || event.ctrlKey) && event.key === "Enter"
      : event.key === "Enter";

    if (shouldSave) {
      event.preventDefault();
      void saveQuickEdit();
    }
  }

  async function chooseBacklogFile() {
    setChoosingFile(true);
    setError(null);

    try {
      const response = await fetch("/api/backlog/choose", {
        method: "POST",
      });

      if (response.status === 204) {
        return;
      }

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
      await rememberBacklogConfig(backlog);
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
      await rememberBacklogConfig(backlog);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function createBacklogFile() {
    setCreatingFile(true);
    setError(null);

    try {
      const response = await fetch("/api/backlog/new", { method: "POST" });

      if (response.status === 204) {
        return;
      }

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
      await rememberBacklogConfig(backlog);
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
      await rememberBacklogConfig(backlog);
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
    const nextPosition = clampPaulaPanelPosition(
      {
        x: event.clientX - paulaDragOffsetRef.current.x,
        y: event.clientY - paulaDragOffsetRef.current.y,
      },
      paulaPanelExpanded,
    );
    if (!paulaPanelExpanded) {
      paulaCompactPositionRef.current = nextPosition;
    }
    setPaulaPanelPosition(nextPosition);
  }

  function onPaulaPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    draggingPaulaRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function openConfigPanel(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 420;
    const height = 280;
    const x = Math.min(Math.max(16, rect.left - width + rect.width), Math.max(16, window.innerWidth - width - 16));
    const y = Math.min(Math.max(16, rect.bottom + 10), Math.max(16, window.innerHeight - height - 16));
    setShowConfigPanel((current) => (current ? null : { x, y }));
  }

  function openPaulaPanel() {
    setPaulaPanelPosition((current) => clampPaulaPanelPosition(current, paulaPanelExpanded));
    setShowPaulaPanel(true);
  }

  function togglePaulaPanelExpanded() {
    setPaulaPanelExpanded((current) => {
      const nextExpanded = !current;
      if (!current) {
        paulaCompactPositionRef.current = clampPaulaPanelPosition(paulaPanelPosition, false);
        setPaulaPanelPosition((position) => clampPaulaPanelPosition(position, true));
      } else {
        setPaulaPanelPosition(clampPaulaPanelPosition(paulaCompactPositionRef.current, false));
      }
      return nextExpanded;
    });
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
              placeholder="Open a backlog"
              disabled={!data?.path}
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
          </div>
          <div className="hero-toolbar" role="group" aria-label="Backlog toolbar">
            <div className="shortcut-chip-row hero-chip-row">
              <button
                type="button"
                className="source-picker source-picker--icon"
                onClick={() => void createBacklogFile()}
                disabled={creatingFile}
                aria-label={creatingFile ? "Creating backlog" : "Create new backlog"}
                title={creatingFile ? "Creating…" : "New backlog"}
              >
                {newBacklogIcon()}
              </button>
              <button
                type="button"
                className="source-picker source-picker--icon"
                onClick={() => void chooseBacklogFile()}
                disabled={choosingFile}
                aria-label={choosingFile ? "Opening backlog" : "Open existing backlog"}
                title={choosingFile ? "Opening…" : "Open backlog"}
              >
                {openBacklogIcon()}
              </button>
              {recentBacklogs.map((entry) => (
                <div
                  key={entry.path}
                  className={`shortcut-chip-group ${data?.path === entry.path ? "is-active" : ""}`}
                  style={hashToPastel(entry.displayName)}
                  title={entry.path}
                >
                  <button
                    type="button"
                    className={`shortcut-chip ${data?.path === entry.path ? "is-active" : ""}`}
                    onClick={() => void selectBacklogFile(entry.path)}
                  >
                    <span className="shortcut-chip-label">{entry.displayName}</span>
                  </button>
                  <button
                    type="button"
                    className="shortcut-chip-remove"
                    aria-label={`Remove ${entry.displayName}`}
                    onClick={async (event) => {
                      event.stopPropagation();
                      try {
                        await removeRecentBacklogConfig(entry.path);
                      } catch (caught) {
                        setError((caught as Error).message);
                      }
                    }}
                  >
                    {chipRemoveIcon()}
                  </button>
                </div>
              ))}
            </div>
            <div className="metrics-row hero-metrics-row">
              <div className="meta-card metric-card metric-card--plain">
                <span className="meta-label">Open</span>
                <div className="metric-value">
                  {(data?.document.items.filter((item) => item.status !== "Done").length) ?? 0}
                </div>
              </div>
              <div className="meta-card metric-card metric-card--plain">
                <span className="meta-label">Done</span>
                <div className="metric-value">
                  {(data?.document.items.filter((item) => item.status === "Done").length) ?? 0}
                </div>
              </div>
              <div className="meta-card metric-card metric-card--plain">
                <span className="meta-label">Epics</span>
                <div className="metric-value">
                  {new Set(data?.document.items.map((item) => item.epic)).size}
                </div>
              </div>
              <div className="hero-toolbar-utility">
                <button
                  type="button"
                  className={`config-button ${showConfigPanel ? "is-active" : ""}`}
                  onClick={openConfigPanel}
                  aria-label="Agent configuration"
                  title={appConfig?.configPath ?? "Agent configuration"}
                >
                  {settingsIcon()}
                </button>
              </div>
            </div>
          </div>
          {savingTitle ? (
            <div className="hero-status-row">
              <span className="agent-status">Saving title…</span>
            </div>
          ) : null}
        </div>
      </header>

      {error ? <div className="banner-error">{error}</div> : null}

      {showConfigPanel ? (
        <div className="quick-edit-layer">
          <button
            type="button"
            className="quick-edit-scrim"
            onClick={() => setShowConfigPanel(null)}
            aria-label="Close settings"
          />
          <div
            className="config-popover config-popover--floating"
            style={{ left: `${showConfigPanel.x}px`, top: `${showConfigPanel.y}px` }}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Agent</p>
            <label className="config-field">
              <span>Launcher</span>
              <select
                value={selectedAgentPreset}
                onChange={(event) => {
                  const nextPreset = event.target.value as AgentPresetId;
                  setSelectedAgentPreset(nextPreset);
                  if (nextPreset !== "custom") {
                    const preset = AGENT_PRESETS.find((item) => item.id === nextPreset);
                    if (preset) {
                      void saveAgentCommandConfig(preset.command).catch((caught) => {
                        setError((caught as Error).message);
                      });
                    }
                  }
                }}
              >
                {AGENT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </label>
            {selectedAgentPreset === "custom" ? (
              <label className="config-field">
                <span>Command</span>
                <input
                  value={customAgentCommand}
                  onChange={(event) => setCustomAgentCommand(event.target.value)}
                  placeholder='my-agent "$BACKLOG_BOOTSTRAP"'
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void saveAgentCommandConfig(customAgentCommand).catch((caught) => {
                        setError((caught as Error).message);
                      });
                    }
                    if (event.key === "Escape") {
                      setShowConfigPanel(null);
                    }
                  }}
                />
              </label>
            ) : null}
            <p className="config-hint">Uses env vars: <code>BACKLOG_BOOTSTRAP</code>, <code>BACKLOG_DIR</code>, <code>BACKLOG_FILE</code>.</p>
            <div className="config-actions">
              <button type="button" className="ghost-button" onClick={() => setShowConfigPanel(null)}>Close</button>
              {selectedAgentPreset === "custom" ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={savingConfig || !customAgentCommand.trim()}
                  onClick={() => {
                    void saveAgentCommandConfig(customAgentCommand).catch((caught) => {
                      setError((caught as Error).message);
                    });
                  }}
                >
                  {savingConfig ? "Saving…" : "Save"}
                </button>
              ) : null}
            </div>
            {appConfig?.configPath ? <div className="config-path">{appConfig.configPath}</div> : null}
          </div>
        </div>
      ) : null}

      {showFilterCreator ? (
        <div className="quick-edit-layer">
          <button type="button" className="quick-edit-scrim" onClick={() => {
            setShowFilterCreator(null);
            setNewFilterDraft("");
            setPendingSprintAssignmentItemId(null);
          }} aria-label="Close creator" />
          <div
            className="epic-overlay filter-overlay"
            style={{ left: `${showFilterCreator.x}px`, top: `${showFilterCreator.y}px` }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">New {showFilterCreator.kind}</p>
            <input
                type={showFilterCreator.kind === "sprint" ? "number" : "text"}
                inputMode={showFilterCreator.kind === "sprint" ? "numeric" : undefined}
                min={showFilterCreator.kind === "sprint" ? 1 : undefined}
                step={showFilterCreator.kind === "sprint" ? 1 : undefined}
                value={newFilterDraft}
                placeholder={showFilterCreator.kind === "epic" ? "Epic name" : showFilterCreator.kind === "owner" ? "Owner name" : "Sprint number"}
                onChange={(event) => setNewFilterDraft(event.target.value)}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    createFilterOption();
                  }
                  if (event.key === "Escape") {
                    setShowFilterCreator(null);
                    setNewFilterDraft("");
                    setPendingSprintAssignmentItemId(null);
                  }
                }}
              />
            <div className="epic-overlay-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setShowFilterCreator(null);
                  setNewFilterDraft("");
                  setPendingSprintAssignmentItemId(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={showFilterCreator.kind === "sprint"
                  ? !/^\d+$/.test(newFilterDraft.trim()) || Number(newFilterDraft.trim()) < 1
                  : newFilterDraft.trim().length === 0}
                onClick={createFilterOption}
              >
                Add {showFilterCreator.kind}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {quickEdit ? (
        <div className="quick-edit-layer">
          <button type="button" className="quick-edit-scrim" onClick={() => setQuickEdit(null)} aria-label="Close quick editor" />
          <div
            className="quick-edit-popover"
            style={{ left: `${quickEdit.x}px`, top: `${quickEdit.y}px` }}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">{quickEdit.field === "dueDate" ? "Edit due date" : quickEdit.field === "sprintAssigned" ? "Change Sprint" : `Edit ${quickEdit.field}`}</p>
            {quickEdit.field === "summary" ? (
              <textarea
                rows={4}
                value={quickEdit.value}
                onChange={(event) => setQuickEdit({ ...quickEdit, value: event.target.value })}
                onKeyDown={handleQuickEditKeyDown}
                autoFocus
              />
            ) : quickEdit.field === "priority" ? (
              <select
                value={quickEdit.value}
                onChange={(event) => setQuickEdit({ ...quickEdit, value: event.target.value })}
                autoFocus
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            ) : quickEdit.field === "effort" ? (
              <select
                value={quickEdit.value}
                onChange={(event) => setQuickEdit({ ...quickEdit, value: event.target.value })}
                autoFocus
              >
                {EFFORTS.map((effort) => (
                  <option key={effort} value={effort}>{effort}</option>
                ))}
              </select>
            ) : quickEdit.field === "status" ? (
              <select
                value={quickEdit.value}
                onChange={(event) => setQuickEdit({ ...quickEdit, value: event.target.value })}
                autoFocus
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            ) : quickEdit.field === "dueDate" ? (
              <input
                type="date"
                value={quickEdit.value}
                onChange={(event) => setQuickEdit({ ...quickEdit, value: event.target.value })}
                onKeyDown={handleQuickEditKeyDown}
                autoFocus
              />
            ) : quickEdit.field === "sprintAssigned" ? (
              <select
                value={quickEdit.value}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (nextValue === "__new__") {
                    setQuickEdit(null);
                    openFilterCreator("sprint", event, { assignSprintItemId: quickEdit.itemId });
                    return;
                  }
                  setQuickEdit({ ...quickEdit, value: nextValue });
                }}
                autoFocus
              >
                <option value="">No sprint</option>
                {availableSprintTargets.map((sprint) => (
                  <option key={sprint} value={sprint}>{sprint}</option>
                ))}
                <option value="__new__">New sprint</option>
              </select>
            ) : (
              <input
                value={quickEdit.value}
                onChange={(event) => setQuickEdit({ ...quickEdit, value: event.target.value })}
                onKeyDown={handleQuickEditKeyDown}
                autoFocus
              />
            )}
            <div className="quick-edit-actions">
              {quickEdit.field === "dueDate" || quickEdit.field === "sprintAssigned" ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setQuickEdit({ ...quickEdit, value: "" })}
                >
                  Remove
                </button>
              ) : null}
              <button type="button" className="ghost-button" onClick={() => setQuickEdit(null)}>Cancel</button>
              <button type="button" className="primary-button" onClick={() => void saveQuickEdit()}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="epic-filter-strip">
        <div className="board-controls">
          <div className="filter-switchers">
            <label className="epic-switcher">
              <span className="meta-label">Epic</span>
              <div className="filter-select-row">
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
                <button
                  type="button"
                  className="epic-add-button"
                  onClick={(event) => openFilterCreator("epic", event)}
                  aria-label="Create epic filter"
                >
                  +
                </button>
              </div>
            </label>
            <label className="epic-switcher owner-switcher">
              <span className="meta-label">Owner</span>
              <div className="filter-select-row">
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
                <button
                  type="button"
                  className="epic-add-button"
                  onClick={(event) => openFilterCreator("owner", event)}
                  aria-label="Create owner filter"
                >
                  +
                </button>
              </div>
            </label>
            <label className="epic-switcher status-switcher">
              <span className="meta-label">Status</span>
              <div className="filter-select-row">
                <select
                  value={selectedStatus}
                  onChange={(event) => setSelectedStatus(event.target.value)}
                >
                  {[ALL_STATUSES, ...STATUSES].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="epic-switcher sprint-switcher">
              <span className="meta-label">Sprint</span>
              <div className="filter-select-row sprint-select-row">
                <select
                  value={selectedSprint}
                  onChange={(event) => setSelectedSprint(event.target.value)}
                >
                  {sprintOptions.map((sprint) => (
                    <option key={sprint} value={sprint}>
                      {sprint}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="epic-add-button"
                  onClick={(event) => openFilterCreator("sprint", event)}
                  aria-label="Create sprint"
                >
                  +
                </button>
              </div>
            </label>
            <label className="epic-switcher text-filter-switcher">
              <span className="meta-label">Text</span>
              <div className="filter-text-row">
                <input
                  type="text"
                  value={textFilter}
                  onChange={(event) => setTextFilter(event.target.value)}
                  placeholder="Filter tickets"
                  aria-label="Text filter"
                />
                <button
                  type="button"
                  className="icon-button text-filter-clear"
                  aria-label="Clear text filter"
                  title="Clear"
                  disabled={!textFilter}
                  onClick={() => setTextFilter("")}
                >
                  {closeIcon()}
                </button>
              </div>
            </label>
          </div>

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

          <button type="button" className="ghost-button save-layout-button" onClick={saveCurrentLayout} disabled={!data?.path}>
            Save layout
          </button>
        </div>
      </section>

      <section className="current-sprint-section">
        <div
          className="current-sprint-panel"
          onDragOver={(event) => {
            if (currentSprintCollapsed || !data || !draggingId) return;
            event.preventDefault();
          }}
          onDrop={async () => {
            if (currentSprintCollapsed || !data || !draggingId) return;
            const item = data.document.items.find((candidate) => candidate.id === draggingId);
            if (!item) return;
            try {
              const effectiveSprint = currentSprintSelection;
              setCurrentSprintTarget(effectiveSprint);
              if (!availableSprintTargets.includes(effectiveSprint)) {
                setCustomSprintOptions((current) =>
                  current.includes(effectiveSprint) ? current : [...current, effectiveSprint],
                );
              }
              if (dragSource === "sprint" && item.status === "Done" && item.sprintAssigned && !effectiveSprint.trim()) {
                throw new Error("Done stories stay locked to their sprint.");
              }
              await assignItemToSprint(item, effectiveSprint);
            } catch (caught) {
              setError((caught as Error).message);
            } finally {
              setDraggingId(null);
              setDragSource("board");
            }
          }}
        >
          <div className={`current-sprint-header ${currentSprintCollapsed ? "is-collapsed" : ""}`}>
            <button
              type="button"
              className="current-sprint-toggle"
              onClick={() => setCurrentSprintCollapsed((current) => !current)}
              aria-expanded={!currentSprintCollapsed}
              aria-label={currentSprintCollapsed ? "Expand current sprint" : "Collapse current sprint"}
            >
              <span className="current-sprint-toggle-icon" aria-hidden="true">
                {currentSprintCollapsed ? <ChevronRight strokeWidth={1.9} /> : <ChevronDown strokeWidth={1.9} />}
              </span>
              <span className="current-sprint-heading">
                <span className="eyebrow">Current Sprint</span>
                {!currentSprintCollapsed ? (
                  <span className="current-sprint-selector-row">
                    <select
                      value={currentSprintSelection}
                      onChange={(event) => setCurrentSprintTarget(event.target.value)}
                      aria-label="Current sprint"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {(availableSprintTargets.length ? availableSprintTargets : ["Sprint 1"]).map((sprint) => (
                        <option key={sprint} value={sprint}>
                          {sprint}
                        </option>
                      ))}
                    </select>
                  </span>
                ) : (
                  <span className="current-sprint-name">{currentSprintSelection}</span>
                )}
              </span>
            </button>
            <div className="metrics-row sprint-metrics-row">
              <div className="metric-card metric-card--plain">
                <span className="meta-label">Stories</span>
                <div className="metric-value">{currentSprintItems.length}</div>
              </div>
              <div className={`metric-card metric-card--plain ${isCurrentSprintOverCapacity ? "is-over-capacity" : ""}`}>
                <span className="meta-label">Effort</span>
                <div className="metric-value">{currentSprintEffort}</div>
              </div>
              {!currentSprintCollapsed ? (
                <button
                  type="button"
                  className="icon-button sprint-clear-button"
                  aria-label="Clear sprint assignments"
                  title="Clear sprint"
                  disabled={!currentSprintItems.length}
                  onClick={() => void clearSprintAssignments(currentSprintSelection).catch((caught) => setError((caught as Error).message))}
                >
                  {trashIcon()}
                </button>
              ) : null}
            </div>
          </div>
          {!currentSprintCollapsed ? (
            <div className="auto-sprint-results">
              {autoSprintProposal ? (
                <div className="auto-sprint-results-panel">
                  <div className="auto-sprint-results-summary">
                    <div className="lane-empty auto-sprint-results-summary-copy">
                      <strong>Auto Sprint applied</strong>
                      <span>
                        {autoSprintProposal.selected.length} stories, {autoSprintProposal.used}/{autoSprintProposal.cap} effort used
                        {autoSprintProposal.excluded.length ? `, ${autoSprintProposal.excluded.length} skipped.` : "."}
                      </span>
                    </div>
                  </div>
                  {autoSprintSelectedItems.length ? (
                    <div className="auto-sprint-results-section">
                      <div className="meta-label">Applied in order</div>
                      <ol className="auto-sprint-results-list">
                        {autoSprintSelectedItems.map((item, index) => (
                          <li key={item.id} className="auto-sprint-results-item">
                            <span className="auto-sprint-results-rank">{index + 1}.</span>
                            <span className="auto-sprint-results-id">{item.id}</span>
                            <span className="auto-sprint-results-title">{item.title}</span>
                            <span className="auto-sprint-results-meta">{item.priority}, Effort {item.effort}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                  {autoSprintExcludedItems.length ? (
                    <div className="auto-sprint-results-section">
                      <div className="meta-label">Skipped</div>
                      <ul className="auto-sprint-results-list">
                        {autoSprintExcludedItems.map(({ item, id, reason }) => (
                          <li key={id} className="auto-sprint-results-item auto-sprint-results-item--excluded">
                            <span className="auto-sprint-results-id">{id}</span>
                            <span className="auto-sprint-results-title">{item?.title ?? "Unknown story"}</span>
                            <span className="auto-sprint-results-meta">{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {!currentSprintCollapsed ? <div className="current-sprint-dropzone">
            <div className="current-sprint-cards">
              {currentSprintItems.length === 0 ? (
                <div className="lane-empty current-sprint-empty" />
              ) : (
                currentSprintItems.map((item) => (
                  <article
                    key={`sprint-${item.id}`}
                    className={`story-card sprint-story-card ${item.status === "Done" ? "sprint-story-card--done" : ""}`}
                    draggable
                    onDragStart={() => {
                      setDraggingId(item.id);
                      setDragSource("sprint");
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragSource("board");
                    }}
                    onClick={() => openEditor(item)}
                  >
                    <button
                      type="button"
                      className="sprint-card-remove"
                      aria-label={`Remove ${item.id} from ${currentSprintSelection}`}
                      title="Remove from current sprint"
                      disabled={item.status === "Done"}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (item.status === "Done") {
                          setError("Done stories stay locked to their sprint.");
                          return;
                        }
                        void assignItemToSprint(item, "").catch((caught) => setError((caught as Error).message));
                      }}
                    >
                      {closeIcon()}
                    </button>
                    <div className="story-topline">
                      <button type="button" className={`priority-chip quick-edit-trigger ${item.priority.toLowerCase()}`} onClick={(event) => openQuickEditor(item, "priority", event)}>{item.priority}</button>
                      <button type="button" className={`effort-chip quick-edit-trigger effort-${item.effort}`} onClick={(event) => openQuickEditor(item, "effort", event)}>Effort {item.effort}</button>
                      <span className="story-id">{item.id}</span>
                    </div>
                    {item.epic.trim() ? <div className="story-epic-label">{item.epic}</div> : null}
                    <button type="button" className="story-title-button quick-edit-trigger" onClick={(event) => openQuickEditor(item, "title", event)}>{item.title}</button>
                    <button type="button" className="story-summary-button quick-edit-trigger" onClick={(event) => openQuickEditor(item, "summary", event)}>{item.summary || "Add summary"}</button>
                    <div className="story-meta-line">
                      <button type="button" className="story-pill story-pill--owner quick-edit-trigger" onClick={(event) => openQuickEditor(item, "owner", event)}>{item.owner}</button>
                      <button type="button" className="story-pill story-pill--status quick-edit-trigger" onClick={(event) => openQuickEditor(item, "status", event)}>{item.status}</button>
                      <button type="button" className="story-pill story-pill--sprint quick-edit-trigger" onClick={(event) => openQuickEditor(item, "sprintAssigned", event)}>{formatSprintLabel(item.sprintAssigned)}</button>
                      <button type="button" className="story-pill story-pill--due quick-edit-trigger" onClick={(event) => openQuickEditor(item, "dueDate", event)}>{item.dueDate ? `Due ${formatDueDate(item.dueDate)}` : "Add due"}</button>
                    </div>
                    <div className="story-last-updated">{formatLastUpdated(item.lastUpdated)}</div>
                  </article>
                ))
              )}
            </div>
            <aside className="current-sprint-actions" aria-label="Auto Sprint controls">
              <div className="current-sprint-controls">
                <label className="auto-sprint-cap">
                  <span className="meta-label">Max Effort</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={autoSprintEffortCap}
                    onChange={(event) => setAutoSprintEffortCap(event.target.value)}
                  />
                </label>
                <label className="auto-sprint-scope">
                  <span className="meta-label">Scope</span>
                  <select value={autoSprintScope} onChange={(event) => setAutoSprintScope(event.target.value as "filtered" | "all")}>
                    <option value="filtered">Current filters</option>
                    <option value="all">Whole backlog</option>
                  </select>
                </label>
              </div>
              <div className="current-sprint-actions-row">
                <button
                  type="button"
                  className="primary-button auto-sprint-button"
                  disabled={!data || isAutoSprintRunning}
                  onClick={() => void runAutoSprint().catch((caught) => setError((caught as Error).message))}
                >
                  {`Auto Plan${".".repeat(autoSprintDotCount)}`}
                </button>
                <button
                  type="button"
                  className="primary-button auto-groom-button"
                  disabled={!data || !currentSprintSelection || currentSprintSelection === UNASSIGNED_SPRINT}
                  title={!data || !currentSprintSelection || currentSprintSelection === UNASSIGNED_SPRINT ? "Select a valid current sprint first." : `Open Paula chat for ${currentSprintSelection}`}
                  onClick={() => void runAutoGroom().catch((caught) => setError((caught as Error).message))}
                >
                  Auto Groom
                </button>
              </div>
              {!data || !currentSprintSelection || currentSprintSelection === UNASSIGNED_SPRINT ? (
                <div className="current-sprint-help current-sprint-help--blocked">Pick a valid current sprint to groom it with Paula.</div>
              ) : (
                <div className="current-sprint-help">Paula will open in the normal chat flow with {currentSprintSelection} as context.</div>
              )}
            </aside>
          </div> : null}
        </div>
      </section>

      <main className={`board ${expandedLane ? "board--lane-expanded" : ""}`}>
        {(expandedLane ? [expandedLane] : STATUSES).map((status) => {
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
                if (!item) return;
                try {
                  if (dragSource === "sprint") {
                    if (item.status === "Done" && item.sprintAssigned) {
                      throw new Error("Done stories stay locked to their sprint.");
                    }
                    if (item.sprintAssigned) {
                      await assignItemToSprint(item, "");
                    }
                    return;
                  }
                  if (item.status === status) return;
                  await moveItem(item, status);
                } catch (caught) {
                  setError((caught as Error).message);
                } finally {
                  setDraggingId(null);
                  setDragSource("board");
                }
              }}
            >
              <div className="lane-header">
                <div className="lane-header-title">
                  <button
                    type="button"
                    className="lane-toggle"
                    onClick={() => setExpandedLane((current) => (current === status ? null : status))}
                    aria-label={expandedLane === status ? `Collapse ${status}` : `Expand ${status}`}
                    title={expandedLane === status ? `Collapse ${status}` : `Expand ${status}`}
                  >
                    {expandedLane === status ? <ChevronDown strokeWidth={1.9} /> : <ChevronRight strokeWidth={1.9} />}
                  </button>
                  <h2>{status}</h2>
                </div>
                <div className="lane-header-actions">
                  {status === "Inbox" ? (
                    <button
                      type="button"
                      className="icon-button lane-add-button"
                      aria-label="Add request to Inbox"
                      title="Add request"
                      onClick={() => openPaulaPanel()}
                    >
                      {newBacklogIcon()}
                    </button>
                  ) : null}
                  <span>{epicEntries.reduce((sum, [, items]) => sum + items.length, 0)}</span>
                </div>
              </div>

              <div className={`lane-scroll ${expandedLane === status ? "lane-scroll--expanded" : ""}`}>
                {epicEntries.length === 0 ? (
                  <div className="lane-empty">No stories in this lane.</div>
                ) : (
                  epicEntries.map(([epic, items], index) => (
                    <div key={`${status}-${epic}`} className={`epic-block ${expandedLane === status ? "epic-block--expanded" : ""}`}>
                      {selectedEpic === "All epics" && index > 0 ? (
                        <div className="epic-divider" aria-hidden="true" />
                      ) : null}
                      <div className="epic-title">{epic}</div>
                      {items.map((item) => (
                        <article
                          key={item.id}
                          className={`story-card ${item.sprintAssigned === currentSprintSelection ? "story-card--current-sprint" : ""}`}
                          draggable
                          onDragStart={() => {
                            setDraggingId(item.id);
                            setDragSource("board");
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDragSource("board");
                          }}
                          onClick={() => openEditor(item)}
                        >
                          <div className="story-topline">
                            <button type="button" className={`priority-chip quick-edit-trigger ${item.priority.toLowerCase()}`} onClick={(event) => openQuickEditor(item, "priority", event)}>
                              {item.priority}
                            </button>
                            <button type="button" className={`effort-chip quick-edit-trigger effort-${item.effort}`} onClick={(event) => openQuickEditor(item, "effort", event)}>
                              Effort {item.effort}
                            </button>
                            <span className="story-id">{item.id}</span>
                          </div>
                          <button type="button" className="story-title-button quick-edit-trigger" onClick={(event) => openQuickEditor(item, "title", event)}>{item.title}</button>
                          <button type="button" className="story-summary-button quick-edit-trigger" onClick={(event) => openQuickEditor(item, "summary", event)}>{item.summary || "Add summary"}</button>
                          <div className="story-meta-line">
                            <button type="button" className="story-pill story-pill--owner quick-edit-trigger" onClick={(event) => openQuickEditor(item, "owner", event)}>{item.owner}</button>
                            <button type="button" className="story-pill story-pill--status quick-edit-trigger" onClick={(event) => openQuickEditor(item, "status", event)}>{item.status}</button>
                            <button type="button" className="story-pill story-pill--sprint quick-edit-trigger" onClick={(event) => openQuickEditor(item, "sprintAssigned", event)}>{formatSprintLabel(item.sprintAssigned)}</button>
                            <button type="button" className="story-pill story-pill--due quick-edit-trigger" onClick={(event) => openQuickEditor(item, "dueDate", event)}>{item.dueDate ? `Due ${formatDueDate(item.dueDate)}` : "Add due"}</button>
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
                Effort
                <select
                  value={editor.effort}
                  onChange={(event) =>
                    setEditor({ ...editor, effort: Number(event.target.value) as BacklogItem["effort"] })
                  }
                >
                  {EFFORTS.map((effort) => (
                    <option key={effort} value={effort}>
                      {effort}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sprint Assigned
                <select
                  value={editor.sprintAssigned}
                  onChange={(event) => setEditor({ ...editor, sprintAssigned: event.target.value })}
                >
                  <option value="">None</option>
                  {sprintOptions.filter((sprint) => sprint !== ALL_SPRINTS && sprint !== UNASSIGNED_SPRINT).map((sprint) => (
                    <option key={sprint} value={sprint}>
                      {sprint}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Owner
                <select
                  value={editor.owner}
                  onChange={(event) => setEditor({ ...editor, owner: event.target.value })}
                >
                  {ownerOptions.filter((owner) => owner !== "All owners").map((owner) => (
                    <option key={owner} value={owner}>
                      {owner}
                    </option>
                  ))}
                </select>
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
                  void removeRecentBacklogConfig(missingBacklogNotice.path)
                    .then(() => setMissingBacklogNotice(null))
                    .catch((caught) => setError((caught as Error).message));
                }}
              >
                Remove chip
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPaulaPanel ? (() => {
        const currentBacklogPath = data?.path ?? null;
        const isAgentBacklogMismatch = Boolean(
          currentBacklogPath &&
          agentSessionBacklogPath &&
          currentBacklogPath !== agentSessionBacklogPath,
        );

        return (
        <div
          className={`floating-paula-panel ${paulaPanelExpanded ? "is-expanded" : ""}`}
          style={{
            left: `${paulaPanelPosition.x}px`,
            top: `${paulaPanelPosition.y}px`,
            width: `${paulaPanelSize(paulaPanelExpanded).width}px`,
            height: `${paulaPanelSize(paulaPanelExpanded).height}px`,
          }}
        >
          <div
            className="floating-paula-header"
            onPointerDown={onPaulaPointerDown}
            onPointerMove={onPaulaPointerMove}
            onPointerUp={onPaulaPointerUp}
          >
            <span className="meta-label">Tell Paula What To Do</span>
            <div className="paula-header-actions">
              <button
                type="button"
                className="icon-button"
                aria-label={paulaPanelExpanded ? "Minimise Paula panel" : "Maximise Paula panel"}
                title={paulaPanelExpanded ? "Minimise" : "Maximise"}
                onClick={togglePaulaPanelExpanded}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {paulaPanelExpanded ? minimizeIcon() : maximizeIcon()}
              </button>
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
          </div>
          {data?.path ? (
            <AgentTerminal
              backlogPath={data.path}
              agentCommand={appConfig?.agentCommand}
              configVersion={agentConfigVersion}
              filterContext={deferredAgentContext}
              onStatusChange={setAgentStatus}
              onSessionPathChange={setAgentSessionBacklogPath}
            />
          ) : (
            <div className="agent-surface">
              <div className="agent-panel-body">
                <section className="agent-chat-panel is-active">
                  <div className="agent-chat-scroll">
                    <article className="agent-message agent-message--agent">
                      <p>Open a backlog file to start Paula.</p>
                    </article>
                  </div>
                </section>
              </div>
            </div>
          )}
          {agentStatus ? (
            <div className={`agent-status ${isAgentBacklogMismatch ? "is-mismatch" : ""}`}>
              {isAgentBacklogMismatch ? <span className="agent-status-alert" aria-hidden="true">!</span> : null}
              <span>{agentStatus}</span>
            </div>
          ) : null}
        </div>
        );
      })() : null}

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
        disabled={!data?.path}
        onClick={() => {
          if (!data?.path) {
            setError("Open a backlog file before creating stories.");
            return;
          }
          openEditor({ ...EMPTY_ITEM });
        }}
        aria-label="New story"
        title="New story"
      >
        +
      </button>
    </div>
  );
}

export default App;
