import he from "@/locales/he.json";
/**
 * Settings tab ids, their groups and the ?tab=<id> deep-link parser (e.g. the dashboard's
 * "set up a budget" link lands on /settings?tab=budgets). Pure so it can be unit-tested.
 * Old ?tab=rules / ?tab=categories links moved to the classification hub (classifyRedirectTab).
 * Labels/descriptions come from locales/he.json (settingsShell) (key = tab id).
 * Used by: settings-page-client.tsx.
 */

/** Order here is the display order. */
export const SETTINGS_GROUPS = [
  { id: "household", tabs: ["people", "salaries"] },
  { id: "money", tabs: ["budgets", "cards"] },
  { id: "connections", tabs: ["connections"] },
  { id: "look", tabs: ["appearance"] },
  { id: "securityBackup", tabs: ["security", "backup"] },
  { id: "more", tabs: ["advanced"] },
] as const;

export type SettingsTabId = (typeof SETTINGS_GROUPS)[number]["tabs"][number];

export const SETTINGS_TABS = SETTINGS_GROUPS.flatMap((group) =>
  group.tabs.map((id) => ({
    id,
    groupId: group.id,
    label: he.settingsShell.tabs[id].label,
    description: he.settingsShell.tabs[id].description,
  })),
);

/** Returns the tab id for a known ?tab value, otherwise null (caller keeps its default). */
export function parseSettingsTab(value: string | null | undefined): SettingsTabId | null {
  if (!value) return null;
  return SETTINGS_TABS.find((tab) => tab.id === value)?.id ?? null;
}

/** Old settings tabs that now live at /classify?tab=<same id>; null for every other value. */
export function classifyRedirectTab(value: string | null | undefined): "rules" | "categories" | null {
  return value === "rules" || value === "categories" ? value : null;
}
