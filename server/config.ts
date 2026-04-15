import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface SprintSummaryConfigEntry {
  sprint: string;
  summary: string;
  suggestedSummary: string;
  ticketIdHash: string;
  overridden: boolean;
  updatedAt: number;
}

export interface BacklogSprintSummaryConfigEntry {
  backlogPath: string;
  summaries: Record<string, SprintSummaryConfigEntry>;
}

export interface RecentBacklogConfigEntry {
  path: string;
  displayName: string;
  lastOpenedAt: number;
}

export interface AppConfig {
  agentCommand: string;
  recentBacklogs: RecentBacklogConfigEntry[];
  sprintSummaries: Record<string, BacklogSprintSummaryConfigEntry>;
}

export const DEFAULT_AGENT_COMMAND = 'codex --no-alt-screen -a never -s danger-full-access --add-dir "$BACKLOG_DIR" "$BACKLOG_BOOTSTRAP"';

const LEGACY_DEFAULT_AGENT_COMMANDS = new Map([
  ['codex --no-alt-screen --add-dir "$BACKLOG_DIR"', DEFAULT_AGENT_COMMAND],
  ['codex --no-alt-screen --add-dir "$BACKLOG_DIR" "$BACKLOG_BOOTSTRAP"', DEFAULT_AGENT_COMMAND],
  ['codex --no-alt-screen -a never -s danger-full-access --add-dir "$BACKLOG_DIR" "$BACKLOG_BOOTSTRAP"', DEFAULT_AGENT_COMMAND],
  ['claude "$BACKLOG_BOOTSTRAP"', 'claude'],
  ['aider --yes "$BACKLOG_FILE" --message "$BACKLOG_BOOTSTRAP"', 'aider --yes "$BACKLOG_FILE"'],
  ['gemini -p "$BACKLOG_BOOTSTRAP"', 'gemini'],
]);
export const CONFIG_PATH = path.join(os.homedir(), ".codex-agile-backlog-manager.json");

function normalizeConfig(input: Partial<AppConfig> | null | undefined): AppConfig {
  const recentBacklogs = Array.isArray(input?.recentBacklogs)
    ? input.recentBacklogs
        .map((entry) => ({
          path: String(entry?.path ?? "").trim(),
          displayName: String(entry?.displayName ?? "").trim(),
          lastOpenedAt: Number(entry?.lastOpenedAt ?? Date.now()),
        }))
        .filter((entry) => entry.path && entry.displayName)
        .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
        .slice(0, 8)
    : [];

  const rawAgentCommand = String(input?.agentCommand ?? DEFAULT_AGENT_COMMAND).trim() || DEFAULT_AGENT_COMMAND;
  const agentCommand = LEGACY_DEFAULT_AGENT_COMMANDS.get(rawAgentCommand) ?? rawAgentCommand;
  const sprintSummaries = Object.fromEntries(
    Object.entries(input?.sprintSummaries ?? {}).flatMap(([key, value]) => {
      const backlogPath = String(value?.backlogPath ?? key).trim();
      if (!backlogPath) return [];
      const summaries = Object.fromEntries(
        Object.entries(value?.summaries ?? {}).flatMap(([sprintKey, entry]) => {
          const sprint = String(entry?.sprint ?? sprintKey).trim();
          const summary = String(entry?.summary ?? "").trim();
          const suggestedSummary = String(entry?.suggestedSummary ?? summary).trim();
          const ticketIdHash = String(entry?.ticketIdHash ?? "").trim();
          if (!sprint) return [];
          return [[sprint, {
            sprint,
            summary,
            suggestedSummary,
            ticketIdHash,
            overridden: Boolean(entry?.overridden),
            updatedAt: Number(entry?.updatedAt ?? Date.now()),
          }]];
        }),
      );
      return [[backlogPath, { backlogPath, summaries }]];
    }),
  );

  return {
    agentCommand,
    recentBacklogs,
    sprintSummaries,
  };
}

async function writeConfig(config: AppConfig) {
  const normalized = normalizeConfig(config);
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    return normalizeConfig(JSON.parse(raw) as Partial<AppConfig>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return writeConfig(normalizeConfig(null));
    }
    throw error;
  }
}

export async function updateConfig(patch: Partial<AppConfig>) {
  const current = await readConfig();
  return writeConfig({ ...current, ...patch });
}

export async function rememberRecentBacklog(pathValue: string, displayName: string) {
  const current = await readConfig();
  const next = [
    {
      path: pathValue,
      displayName,
      lastOpenedAt: Date.now(),
    },
    ...current.recentBacklogs.filter((entry) => entry.path !== pathValue),
  ].sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);

  return updateConfig({ recentBacklogs: next });
}

export async function removeRecentBacklog(pathValue: string) {
  const current = await readConfig();
  return updateConfig({
    recentBacklogs: current.recentBacklogs.filter((entry) => entry.path !== pathValue),
  });
}

export async function updateBacklogSprintSummaries(
  backlogPath: string,
  updater: (summaries: Record<string, SprintSummaryConfigEntry>) => Record<string, SprintSummaryConfigEntry>,
) {
  const current = await readConfig();
  const currentEntry = current.sprintSummaries[backlogPath] ?? { backlogPath, summaries: {} };
  const nextSummaries = updater(currentEntry.summaries);
  return updateConfig({
    sprintSummaries: {
      ...current.sprintSummaries,
      [backlogPath]: {
        backlogPath,
        summaries: nextSummaries,
      },
    },
  });
}

export function extractCommandBinary(command: string) {
  const trimmed = command.trim();
  const match = trimmed.match(/^([A-Za-z0-9._/-]+)/);
  return match?.[1] ?? "";
}
