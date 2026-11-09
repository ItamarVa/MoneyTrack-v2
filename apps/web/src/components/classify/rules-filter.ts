/**
 * Pure search helper for the rules table: case-insensitive match on pattern text or category name.
 * Kept free of React so it is unit-testable; used by rules-panel.tsx.
 */
import type { CategorizationRule } from "@moneytrack/contracts";

export function filterRules(
  rules: readonly CategorizationRule[],
  categoryNameById: ReadonlyMap<string, string>,
  query: string,
): CategorizationRule[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...rules];
  return rules.filter((rule) => {
    if (rule.pattern.toLowerCase().includes(needle)) return true;
    return (categoryNameById.get(rule.categoryId) ?? "").toLowerCase().includes(needle);
  });
}
