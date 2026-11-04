/**
 * Maps categorization_rules DB rows to contract CategorizationRule objects.
 * Used by /api/rules handlers only.
 */
import type { CategorizationRule } from "@moneytrack/contracts";
import type { categorizationRules } from "@moneytrack/db";

type DbRule = typeof categorizationRules.$inferSelect;

export function mapRule(row: DbRule): CategorizationRule {
  return {
    id: row.id,
    pattern: row.pattern,
    categoryId: row.categoryId,
    priority: row.priority,
    enabled: row.enabled,
    createdAt: row.createdAt,
  };
}
