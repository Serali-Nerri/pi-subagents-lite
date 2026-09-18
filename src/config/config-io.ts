/**
 * config-io.ts — Config persistence (read/write).
 *
 * Atomic writes: write to .tmp then rename.
 * Loaded at session_start; saved on every /agents menu mutation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { SubagentsConfig } from "../models/model-precedence.js";

const CONFIG_DIR = path.join(process.env.HOME || "", ".pi", "agent");
const CONFIG_PATH = path.join(CONFIG_DIR, "subagents-lite.json");
/** Path to custom prompt file for subagent system prompts. */
export const CUSTOM_PROMPT_PATH = path.join(CONFIG_DIR, "subagents-lite-prompt.md");
/** Default number of grace turns before an agent is force-stopped. */
export const DEFAULT_GRACE_TURNS = 6;
/** Default watchdog timeout (tool and idle) in minutes. 0 disables a check. */
export const DEFAULT_WATCHDOG_TIMEOUT_MINUTES = 45;
/** Default finished retention in minutes. Preserves legacy 10min local behavior. */
export const DEFAULT_FINISHED_RETENTION_MINUTES = 10;

/** Valid system prompt modes. */
export const VALID_SYSTEM_PROMPT_MODES = new Set<string>(["replace", "inherit", "custom"]);

/** Default concurrency config — used for resets. */
export const DEFAULT_CONCURRENCY: SubagentsConfig["concurrency"] = { default: 4 };

/** Default agent settings — merged into loaded config so callers get a complete shape. */
const DEFAULT_AGENT: SubagentsConfig["agent"] = {
  default: null,
  forceBackground: false,
  graceTurns: DEFAULT_GRACE_TURNS,
  widgetMaxLines: 12,
  widgetDescLengthFull: 50,
  widgetDescLengthCompact: 30,
  widgetCompact: false,
  widgetShortcut: false,
  showAgentSelector: false,
  excludedExtensions: [],
  systemPromptMode: "replace",
  includeContextFiles: true,
  disableDefaultAgents: false,
  showTools: true,
  showTurns: true,
  showInput: true,
  showOutput: true,
  showContext: true,
  showCost: false,
  showTime: true,
  deltaInputTokens: false,
  toolTimeoutMinutes: DEFAULT_WATCHDOG_TIMEOUT_MINUTES,
  idleTimeoutMinutes: DEFAULT_WATCHDOG_TIMEOUT_MINUTES,
  finishedRetentionMinutes: DEFAULT_FINISHED_RETENTION_MINUTES,
};

/**
 * Read config from disk. Merges loaded values over defaults so the result
 * is always a complete SubagentsConfig — no partial shapes for callers to handle.
 *
 * When `projectDir` is set, `<projectDir>/.pi/subagents-lite.json` acts as an
 * override layer (model + concurrency only) over the global file — team-shared
 * defaults like `oracle` model pins. Unknown/other keys are ignored.
 */
export function loadConfig(projectDir?: string): SubagentsConfig {
  let raw: Partial<SubagentsConfig>;
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as Partial<SubagentsConfig>;
  } catch {
    raw = {};
  }

  if (projectDir) {
    const projectRaw = readProjectRaw(projectDir);
    if (projectRaw) raw = mergeProjectLayer(raw, projectRaw);
  }

  const concurrency = { default: 4, ...(raw.concurrency ?? {}) } as SubagentsConfig["concurrency"];
  return {
    agent: { ...DEFAULT_AGENT, ...raw.agent },
    concurrency,
  };
}

/** Keys a project file may set: model family + per-type model overrides + concurrency. */
const PROJECT_MODEL_KEYS = new Set(["default", "defaultThinking", "defaultMaxTurns"]);

function isProjectAllowedAgentKey(key: string, value: unknown): boolean {
  if (PROJECT_MODEL_KEYS.has(key)) return true;
  // Per-type model overrides are plain strings not in the known non-model set.
  // Import lazily to avoid cycle: config/types only holds constants.
  if (typeof value === "string") return true;
  return false;
}

/** Read `<projectDir>/.pi/subagents-lite.json`; null when absent/malformed. */
function readProjectRaw(projectDir: string): Partial<SubagentsConfig> | null {
  try {
    const p = path.join(projectDir, ".pi", "subagents-lite.json");
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as Partial<SubagentsConfig>;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Merge project layer over global: project model/concurrency keys win. Pure. */
export function mergeProjectLayer(
  global: Partial<SubagentsConfig>,
  project: Partial<SubagentsConfig>,
): Partial<SubagentsConfig> {
  const agent = { ...(global.agent ?? {}) } as Record<string, unknown>;
  for (const [k, v] of Object.entries(project.agent ?? {})) {
    if (isProjectAllowedAgentKey(k, v)) agent[k] = v;
  }
  const concurrency = {
    ...(global.concurrency ?? {}),
    ...(project.concurrency ?? {}),
    providers: { ...(global.concurrency?.providers ?? {}), ...(project.concurrency?.providers ?? {}) },
    models: { ...(global.concurrency?.models ?? {}), ...(project.concurrency?.models ?? {}) },
  };
  if (Object.keys(concurrency.providers ?? {}).length === 0) delete (concurrency as Record<string, unknown>).providers;
  if (Object.keys(concurrency.models ?? {}).length === 0) delete (concurrency as Record<string, unknown>).models;
  return { agent: agent as SubagentsConfig["agent"], concurrency: concurrency as SubagentsConfig["concurrency"] };
}

/** Write config to disk with atomic rename. */
export function saveConfigAtomic(config: SubagentsConfig): void {
  const tmpPath = CONFIG_PATH + ".tmp";
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), "utf-8");
    fs.renameSync(tmpPath, CONFIG_PATH);
  } catch (err) {
    console.error(`[subagents] Failed to save config: ${err}`);
  }
}
