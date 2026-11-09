import he from "@/locales/he.json";
/**
 * Classification hub tab ids and the ?tab=<id> deep-link parser (/classify?tab=rules).
 * Pure so it can be unit-tested. Labels/descriptions: locales/he.json (classifyHub).
 * Used by: classify-page-client.tsx.
 */

export const CLASSIFY_TAB_IDS = ["merchants", "rules", "categories", "providerMap"] as const;

export type ClassifyTabId = (typeof CLASSIFY_TAB_IDS)[number];

export const CLASSIFY_TABS = CLASSIFY_TAB_IDS.map((id) => ({
  id,
  label: he.classifyHub.tabs[id].label,
  description: he.classifyHub.tabs[id].description,
}));

/** Returns the tab id for a known ?tab value, otherwise null (caller keeps its default). */
export function parseClassifyTab(value: string | null | undefined): ClassifyTabId | null {
  if (!value) return null;
  return CLASSIFY_TABS.find((tab) => tab.id === value)?.id ?? null;
}
