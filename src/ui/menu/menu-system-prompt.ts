/**
 * menu-system-prompt.ts — System prompt settings menu concern.
 *
 * Uses SettingsList from @earendil-works/pi-tui via ctx.ui.custom.
 * SettingsList maintains internal cursor state, fixing the cursor-position
 * reset bug that occurred with ctx.ui.select.
 *
 * Exports:
 *   - showSystemPromptMenu: system prompt mode, create prompt file, include AGENTS.md
 */

import fs from "node:fs";
import path from "node:path";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { SettingsList, type SettingItem } from "@earendil-works/pi-tui";
import { buildSettingsListTheme, type MenuTheme } from "./helpers.js";
import { createExcludedExtensionsSubmenu } from "./submenus/excluded-extensions.js";
import { listInstalledExtensions } from "../../agents/agent-runner.js";
import { SettingsListWrapper } from "./wrappers/settings-list.js";
import type { SystemPromptMode } from "../../agents/types.js";
import { getStore } from "../../shell.js";
import { CUSTOM_PROMPT_PATH } from "../../config/config-io.js";

/** Placeholder theme for the pre-render build; replaced when the menu opens. */
const FALLBACK_THEME: MenuTheme = { fg: (_color, text) => text, bold: (text) => text };

/** Item value: how many extensions are blacklisted, or "none". */
function blacklistLabel(excluded: readonly string[], detected: number): string {
  if (excluded.length === 0) return detected > 0 ? "none" : "none (no extensions detected)";
  return `${excluded.length} excluded`;
}

export async function showSystemPromptMenu(ctx: ExtensionCommandContext): Promise<void> {
  const store = getStore();
  // Discovery reloads a throwaway resource loader, so it runs once per menu open.
  const installed = await listInstalledExtensions();

  const buildItems = (theme: MenuTheme): SettingItem[] => {
    const items: SettingItem[] = [
      {
        id: "systemPromptMode",
        label: "System prompt mode",
        currentValue: store.agent.systemPromptMode,
        values: ["replace", "inherit", "custom"],
        description: "How the subagent system prompt is built: replace, inherit, or custom.",
      },
    ];

    // Create prompt file (only when mode is custom and file doesn't exist)
    if (store.agent.systemPromptMode === "custom" && !fs.existsSync(CUSTOM_PROMPT_PATH)) {
      items.push({
        id: "createPromptFile",
        label: "Create prompt file",
        currentValue: CUSTOM_PROMPT_PATH,
        values: ["Create"],
        description: `Create ${CUSTOM_PROMPT_PATH} with a starter template for custom mode.`,
      });
    }

    items.push(
      {
        id: "includeContextFiles",
        label: "Include AGENTS.md",
        currentValue: store.agent.includeContextFiles ? "ON" : "OFF",
        values: ["ON", "OFF"],
        description: "Load project and ~/.pi/agent AGENTS.md as shared <project_context>.",
      },
      {
        id: "loadSkillsImplicitly",
        label: "Load skills implicitly",
        currentValue: store.agent.loadSkillsImplicitly ? "ON" : "OFF",
        values: ["ON", "OFF"],
        description: "Give new agents all skills when frontmatter omits the field.",
      },
      {
        id: "loadExtensionsImplicitly",
        label: "Load extensions implicitly",
        currentValue: store.agent.loadExtensionsImplicitly ? "ON" : "OFF",
        values: ["ON", "OFF"],
        description: "Give new agents all extensions when frontmatter omits the field.",
      },
      {
        id: "excludedExtensions",
        label: "Global extension blacklist",
        currentValue: blacklistLabel(store.agent.excludedExtensions ?? [], installed.length),
        submenu: createExcludedExtensionsSubmenu(installed, theme),
        description: "Extensions never loaded in subagent sessions. Enter opens the list; Enter/space toggles each entry.",
      },
    );

    return items;
  };
  let items = buildItems(FALLBACK_THEME);
  let rebuild: ((newItems: SettingItem[]) => void) | null = null;

  const onChange = (id: string, newValue: string) => {
    switch (id) {
      case "systemPromptMode":
        store.mutate.agent.setSystemPromptMode(newValue as SystemPromptMode);
        ctx.ui.notify(`System prompt mode set to ${newValue}`, "info");
        // Rebuild: "custom" adds the create prompt file item, other modes remove it.
        items = buildItems(FALLBACK_THEME);
        rebuild?.(items);
        break;
      case "createPromptFile":
        try {
          fs.mkdirSync(path.dirname(CUSTOM_PROMPT_PATH), { recursive: true });
          fs.writeFileSync(CUSTOM_PROMPT_PATH, "You are a Pi, an expert coding sub-agent.\nYou have been invoked to handle a specific task autonomously", "utf-8");
          ctx.ui.notify(`Created prompt file: ${CUSTOM_PROMPT_PATH}`, "info");
        } catch (err: any) {
          ctx.ui.notify(`Failed to create prompt file: ${err.message}`, "error");
        }
        return;
      case "includeContextFiles":
        store.mutate.agent.setIncludeContextFiles(newValue === "ON");
        ctx.ui.notify(`Include AGENTS.md set to ${newValue}`, "info");
        break;
      case "loadSkillsImplicitly":
        store.mutate.agent.setLoadSkillsImplicitly(newValue === "ON");
        ctx.ui.notify(`Load skills implicitly set to ${newValue}`, "info");
        break;
      case "loadExtensionsImplicitly":
        store.mutate.agent.setLoadExtensionsImplicitly(newValue === "ON");
        ctx.ui.notify(`Load extensions implicitly set to ${newValue}`, "info");
        break;
    }
  };

  await ctx.ui.custom((_tui, theme, _kb, done) => {
    // Rebuild with the real theme so the blacklist submenu matches the menu.
    items = buildItems(theme);
    const settingsList = new SettingsList(items, 10, buildSettingsListTheme(theme), onChange, () => done(undefined));
    return new SettingsListWrapper(settingsList, { title: "System Prompt", theme, onCancel: () => done(undefined), onRebuild: (r) => { rebuild = r; } });
  });
}
