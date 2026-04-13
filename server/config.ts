import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface RecentBacklogConfigEntry {
  path: string;
  displayName: string;
  lastOpenedAt: number;
}

export interface AppConfig {
  agentCommand: string;
  recentBacklogs: RecentBacklogConfigEntry[];
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

  return {
    agentCommand,
    recentBacklogs,
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

export function extractCommandBinary(command: string) {
  const trimmed = command.trim();
  const match = trimmed.match(/^([A-Za-z0-9._/-]+)/);
  return match?.[1] ?? "";
}
