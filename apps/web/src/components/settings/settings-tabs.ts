/**
 * Settings tab ids and the ?tab=<id> deep-link parser (e.g. the dashboard's
 * "set up a budget" link lands on /settings?tab=budgets). Pure so it can be unit-tested.
 * Rules moved into the "advanced" tab; the old ?tab=rules link still lands there.
 * Used by: settings-page-client.tsx.
 */
export const SETTINGS_TABS = [
  { id: "categories", label: "קטגוריות" },
  { id: "people", label: "בני משפחה" },
  { id: "salaries", label: "משכורות" },
  { id: "cards", label: "כרטיסים" },
  { id: "budgets", label: "תקציבים" },
  { id: "security", label: "אבטחה" },
  { id: "backup", label: "גיבוי" },
  { id: "appearance", label: "תצוגה" },
  { id: "advanced", label: "מתקדם" },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

/** Returns the tab id for a known ?tab value, otherwise null (caller keeps its default). */
export function parseSettingsTab(value: string | null | undefined): SettingsTabId | null {
  if (!value) return null;
  if (value === "rules") return "advanced";
  return SETTINGS_TABS.find((tab) => tab.id === value)?.id ?? null;
}
