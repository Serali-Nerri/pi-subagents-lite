/**
 * excluded-extensions.ts — Global extension blacklist submenu.
 *
 * Lists the extensions detected in the current installation; Enter/space
 * cycles each row between EXCLUDED and included. Every toggle persists the
 * blacklist immediately, so the setting survives even if the user closes the
 * menu with Escape.
 *
 * The blacklist is a session-wide setting for subagent sessions: it is
 * subtracted after an agent's own `extensions` whitelist and merged with its
 * `exclude_extensions`, so a globally excluded extension never loads in a
 * child — regardless of the implicit-loading switch.
 */

import { SettingsList, type Component, type SettingItem } from "@earendil-works/pi-tui";
import { buildSettingsListTheme, type MenuTheme } from "../helpers.js";
import { SettingsListWrapper } from "../wrappers/settings-list.js";
import { getStore } from "../../../shell.js";
import type { InstalledExtension } from "../../../agents/agent-runner.js";

/** Row values; the first is the excluded state so a single cycle starts there. */
const EXCLUDED = "EXCLUDED";
const INCLUDED = "included";

/**
 * Returns a submenu factory for `SettingItem.submenu`.
 *
 * `installed` is resolved once by the caller (extension discovery reloads the
 * resource loader, which is too slow to do per keypress).
 */
export function createExcludedExtensionsSubmenu(
  installed: readonly InstalledExtension[],
  theme: MenuTheme,
): (currentValue: string, done: (selectedValue?: string) => void) => Component {
  return (_currentValue, done) => {
    const store = getStore();
    const excluded = new Set(store.agent.excludedExtensions);

    const items: SettingItem[] = installed.map((ext) => ({
      id: ext.name,
      label: ext.name,
      currentValue: excluded.has(ext.name) ? EXCLUDED : INCLUDED,
      values: [EXCLUDED, INCLUDED],
      description: ext.path,
    }));

    const onChange = (id: string, newValue: string) => {
      if (newValue === EXCLUDED) excluded.add(id);
      else excluded.delete(id);
      store.mutate.agent.setExcludedExtensions([...excluded]);
    };

    const list = new SettingsList(
      items,
      Math.min(14, Math.max(4, items.length)),
      buildSettingsListTheme(theme),
      onChange,
      () => done(undefined),
    );
    return new SettingsListWrapper(list, {
      title: "Global extension blacklist · Enter/space toggles",
      theme,
      onCancel: () => done(undefined),
    });
  };
}
