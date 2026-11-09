/**
 * Pure rules for the "needs your attention" page: which categories to suggest for a merchant,
 * and the total that feeds the nav badge (sync problems + uncategorized merchants + open alerts + card-bill problems).
 * Why: the page and GET /api/attention/count must agree, so both use countAttention.
 * Gotcha: NON_SPEND_CATEGORY_IDS mirrors SYSTEM_CATEGORY_IDS in @moneytrack/classify, which a
 * client bundle must not import (MEM-LESSONS); keep the two lists in sync.
 * Used by attention-page-client.tsx, classify-block.tsx and app/api/attention/count/route.ts.
 */
import type { Alert, Category, Connection, UncategorizedMerchant } from "@moneytrack/contracts";
import { cardBillProblems } from "@/components/attention/card-bills-logic";
import type { CardReconciliationRow } from "@/components/credit/credit-types";
import { liveConnectionIds, selectNeedsAction } from "@/components/accounts/accounts-needs-action";
import type { SyncConnectionState } from "@/components/sync/auto-sync-api";
import { UNCATEGORIZED_CATEGORY_ID } from "@/lib/category-ids";

export const MAX_SUGGESTIONS = 4;

/** Buckets that are never a spend category: uncategorized, transfers, savings, card bill, loans, income. */
const NON_SPEND_CATEGORY_IDS: ReadonlySet<string> = new Set([
  UNCATEGORIZED_CATEGORY_ID,
  "00000000-0000-4000-8000-0000000000c2",
  "00000000-0000-4000-8000-0000000000b1",
  "00000000-0000-4000-8000-0000000000c3",
  "00000000-0000-4000-8000-000000000043",
  "00000000-0000-4000-8000-0000000000c1",
]);

export type ProviderMapRow = { providerCategory: string; categoryId: string | null };
export type BreakdownRow = { categoryId: string | null; transactionCount: number };

/** Category ids the merchant's provider labels map to, in the merchant's label order. */
export function providerCategoryIds(
  merchant: Pick<UncategorizedMerchant, "providerCategories">,
  map: readonly ProviderMapRow[],
): string[] {
  const byLabel = new Map(map.map((row) => [row.providerCategory, row.categoryId]));
  const ids: string[] = [];
  for (const label of merchant.providerCategories) {
    const id = byLabel.get(label);
    if (id) ids.push(id);
  }
  return ids;
}

/** Most used spend categories first (count desc, id as tie-break so the order is stable). */
export function topUsedCategoryIds(rows: readonly BreakdownRow[]): string[] {
  return rows
    .filter((row): row is { categoryId: string; transactionCount: number } => row.categoryId !== null)
    .sort((a, b) => b.transactionCount - a.transactionCount || a.categoryId.localeCompare(b.categoryId))
    .map((row) => row.categoryId);
}

/** Top-level categories in display order: last-resort chips when usage data is unavailable. */
export function rootCategoryIds(
  categories: readonly Pick<Category, "id" | "parentId" | "name" | "sortOrder">[],
): string[] {
  return categories
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he"))
    .map((c) => c.id);
}

/** Provider-mapped categories first, then the most used, then top-level ones; deduped, existing, spend-only. */
export function suggestCategoryIds(input: {
  providerIds: readonly string[];
  topUsedIds: readonly string[];
  fallbackIds?: readonly string[];
  knownIds: ReadonlySet<string>;
  max?: number;
}): string[] {
  const out: string[] = [];
  for (const id of [...input.providerIds, ...input.topUsedIds, ...(input.fallbackIds ?? [])]) {
    if (out.length >= (input.max ?? MAX_SUGGESTIONS)) break;
    if (NON_SPEND_CATEGORY_IDS.has(id) || !input.knownIds.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

export type AttentionInputs = {
  connections: readonly Pick<
    Connection,
    "id" | "providerCode" | "enabled" | "lastSuccessAt" | "credentialsSet"
  >[];
  states: readonly SyncConnectionState[];
  merchants: readonly unknown[];
  alerts: readonly Pick<Alert, "status">[];
  /** Card-bill check; omitted when unavailable (advisory, never blocks the count). */
  cardBills?: { rows: readonly CardReconciliationRow[]; today: string };
};

export function countAttention(input: AttentionInputs): number {
  const syncProblems = selectNeedsAction(
    input.connections,
    input.states,
    liveConnectionIds(input.states, []),
  ).length;
  const openAlerts = input.alerts.filter((alert) => alert.status !== "dismissed").length;
  const cardBills = input.cardBills ? cardBillProblems(input.cardBills.rows, input.cardBills.today).length : 0;
  return syncProblems + input.merchants.length + openAlerts + cardBills;
}
