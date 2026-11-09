/**
 * Pure search + sort helper for the uncategorized-merchants list.
 * Client-side only; never mutates input. Used by uncategorized-merchants-section.tsx.
 * UncategorizedMerchant exposes no transfer/check "kind", so there is no kind filter.
 */
import type { UncategorizedMerchant } from "@moneytrack/contracts";

export type MerchantSort = "amount" | "count" | "name";

export function filterAndSortMerchants(
  merchants: readonly UncategorizedMerchant[],
  query: string,
  sort: MerchantSort,
): UncategorizedMerchant[] {
  const needle = query.trim().toLocaleLowerCase();
  const rows = needle
    ? merchants.filter((m) => m.merchantName.toLocaleLowerCase().includes(needle))
    : [...merchants];
  switch (sort) {
    case "amount":
      return rows.sort((a, b) => Math.abs(b.totalAmountIls) - Math.abs(a.totalAmountIls));
    case "count":
      return rows.sort((a, b) => b.transactionCount - a.transactionCount);
    case "name":
      return rows.sort((a, b) => a.merchantName.localeCompare(b.merchantName, "he"));
  }
}
