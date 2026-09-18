/**
 * excluded-extensions.test.ts — Global extension blacklist submenu.
 *
 * The submenu is the only place where the blacklist is edited; every toggle
 * must persist, so the store mutation is asserted directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

let settingsListCalls: Array<{ items: any[]; onChange: (id: string, value: string) => void; onCancel: () => void }> = [];

vi.mock("@earendil-works/pi-tui", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@earendil-works/pi-tui")>();
	return {
	...actual,
	SettingsList: class MockSettingsList {
		items: any[];
		constructor(
			items: any[],
			_maxVisible: number,
			_theme: any,
			onChange: (id: string, value: string) => void,
			onCancel: () => void,
		) {
			this.items = items;
			settingsListCalls.push({ items, onChange, onCancel });
		}
	},
	};
});

const setExcludedExtensions = vi.fn();
const store = {
	agent: { excludedExtensions: ["pi-btw"] as string[] },
	mutate: { agent: { setExcludedExtensions } },
};

vi.mock("../../../../src/shell.js", () => ({
	getStore: () => store,
}));

import { createExcludedExtensionsSubmenu } from "../../../../src/ui/menu/submenus/excluded-extensions.js";

const installed = [
	{ name: "pi-btw", path: "/home/u/.pi/agent/npm/node_modules/@narumitw/pi-btw/dist/index.ts" },
	{ name: "pi-session-ui", path: "/home/u/.pi/agent/extensions/pi-session-ui/index.ts" },
	{ name: "rtk", path: "/home/u/.pi/agent/extensions/rtk.ts" },
];

const theme = { fg: (_c: string, text: string) => text, bold: (text: string) => text };

describe("createExcludedExtensionsSubmenu", () => {
	beforeEach(() => {
		settingsListCalls = [];
		setExcludedExtensions.mockClear();
		store.agent.excludedExtensions = ["pi-btw"];
	});

	it("renders one row per detected extension, marking the blacklisted ones", () => {
		createExcludedExtensionsSubmenu(installed, theme)("none", () => {});
		const items = settingsListCalls[0].items;

		expect(items.map((item) => item.id)).toEqual(["pi-btw", "pi-session-ui", "rtk"]);
		expect(items.map((item) => item.currentValue)).toEqual(["EXCLUDED", "included", "included"]);
		// Space cycles through `values`, so two entries are enough for a toggle.
		expect(items[0].values).toEqual(["EXCLUDED", "included"]);
		expect(items[0].description).toContain("pi-btw");
	});

	it("persists the blacklist on every toggle", () => {
		createExcludedExtensionsSubmenu(installed, theme)("none", () => {});
		const { onChange } = settingsListCalls[0];

		onChange("rtk", "EXCLUDED");
		expect(setExcludedExtensions).toHaveBeenLastCalledWith(["pi-btw", "rtk"]);

		onChange("pi-btw", "included");
		expect(setExcludedExtensions).toHaveBeenLastCalledWith(["rtk"]);

		onChange("pi-session-ui", "EXCLUDED");
		expect(setExcludedExtensions).toHaveBeenLastCalledWith(["rtk", "pi-session-ui"]);
	});
});
