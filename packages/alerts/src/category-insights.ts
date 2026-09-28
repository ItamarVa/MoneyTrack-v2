/**
 * Deterministic category-scoped spending insights for the category detail page.
 * Reads transactions in a category subtree; Hebrew labels are built client-side.
 * Invariants: merchant triggers need 3 prior months of history; amounts use debit expenses only.
 */
import type { CategoryInsight } from "@moneytrack/contracts";
import { categories, merchants, transactions, type MoneyTrackDb } from "@moneytrack/db";
import { mad, median } from "./stats.js";

const MAD_MULTIPLIER = 3;
const MIN_MERCHANT_HISTORY_MONTHS = 3;
const CATEGORY_VS_AVG_THRESHOLD = 0.25;
const DOMINANT_TXN_SHARE = 0.4;

type ScopedTxn = typeof transactions.$inferSelect;

function buildCategoryExpander(db: MoneyTrackDb): (ids: string[]) => string[] {
  const allCategories = db.select().from(categories).all();
  const childrenByParent = new Map<string, string[]>();
  for (const category of allCategories) {
    if (!category.parentId) {
      continue;
    }
    const siblings = childrenByParent.get(category.parentId) ?? [];
    siblings.push(category.id);
    childrenByParent.set(category.parentId, siblings);
  }

  const expandedById = new Map<string, Set<string>>();

  function expandOne(id: string): Set<string> {
    const cached = expandedById.get(id);
    if (cached) {
      return cached;
    }

    const result = new Set<string>([id]);
    for (const childId of childrenByParent.get(id) ?? []) {
      for (const descendantId of expandOne(childId)) {
        result.add(descendantId);
      }
    }
    expandedById.set(id, result);
    return result;
  }

  return (ids: string[]) => {
    const combined = new Set<string>();
    for (const id of ids) {
      for (const descendantId of expandOne(id)) {
        combined.add(descendantId);
      }
    }
    return [...combined];
  };
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function insightMonthKey(txn: ScopedTxn): string {
  return monthKey(txn.chargeDate);
}

function priorMonths(period: string, count: number): string[] {
  const result: string[] = [];
  let year = Number(period.slice(0, 4));
  let month = Number(period.slice(5, 7));
  for (let i = 0; i < count; i++) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    result.unshift(`${year}-${String(month).padStart(2, "0")}`);
  }
  return result;
}

function pctChange(current: number, baseline: number): number {
  if (baseline === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - baseline) / baseline) * 100;
}

function isScopedExpense(txn: ScopedTxn, scopedCategoryIds: Set<string>): boolean {
  return (
    txn.direction === "debit" &&
    txn.kind === "expense" &&
    !txn.excludedFromTotals &&
    txn.categoryId !== null &&
    scopedCategoryIds.has(txn.categoryId)
  );
}

function merchantName(db: MoneyTrackDb, merchantId: string): string {
  const row = db
    .select()
    .from(merchants)
    .all()
    .find((merchant) => merchant.id === merchantId);
  return row?.canonicalName ?? "Unknown";
}

export function buildCategoryInsights(
  db: MoneyTrackDb,
  categoryId: string,
  period: string,
): CategoryInsight[] {
  const expandCategoryIds = buildCategoryExpander(db);
  const scopedCategoryIds = new Set(expandCategoryIds([categoryId]));
  const historyMonths = [...priorMonths(period, MIN_MERCHANT_HISTORY_MONTHS), period];

  const scopedExpenses = db
    .select()
    .from(transactions)
    .all()
    .filter((txn) => isScopedExpense(txn, scopedCategoryIds))
    .filter((txn) => historyMonths.includes(insightMonthKey(txn)));

  const insights: CategoryInsight[] = [];
  const priorPeriods = priorMonths(period, MIN_MERCHANT_HISTORY_MONTHS);

  const categoryTotalCurrent = scopedExpenses
    .filter((txn) => insightMonthKey(txn) === period)
    .reduce((sum, txn) => sum + txn.amountIls, 0);

  const priorCategoryTotals = priorPeriods.map((month) =>
    scopedExpenses
      .filter((txn) => insightMonthKey(txn) === month)
      .reduce((sum, txn) => sum + txn.amountIls, 0),
  );
  const hasPriorCategorySpend = priorCategoryTotals.some((amount) => amount > 0);
  const categoryAverage =
    priorCategoryTotals.reduce((sum, amount) => sum + amount, 0) / priorCategoryTotals.length;
  if (
    priorCategoryTotals.every((amount) => amount > 0) &&
    Math.abs(categoryTotalCurrent - categoryAverage) / categoryAverage > CATEGORY_VS_AVG_THRESHOLD
  ) {
    insights.push({
      kind: "category_vs_average",
      averageIls: categoryAverage,
      amountIls: categoryTotalCurrent,
      pctChange: pctChange(categoryTotalCurrent, categoryAverage),
    });
  }

  const currentMonthTxns = scopedExpenses.filter((txn) => insightMonthKey(txn) === period);
  if (categoryTotalCurrent > 0) {
    const largest = [...currentMonthTxns].sort((a, b) => b.amountIls - a.amountIls)[0]!;
    const sharePct = (largest.amountIls / categoryTotalCurrent) * 100;
    if (sharePct >= DOMINANT_TXN_SHARE * 100 && largest.merchantId) {
      insights.push({
        kind: "dominant_transaction",
        merchantName: merchantName(db, largest.merchantId),
        amountIls: largest.amountIls,
        sharePct,
      });
    }
  }

  const byMerchant = new Map<string, ScopedTxn[]>();
  for (const txn of scopedExpenses) {
    if (!txn.merchantId) {
      continue;
    }
    const rows = byMerchant.get(txn.merchantId) ?? [];
    rows.push(txn);
    byMerchant.set(txn.merchantId, rows);
  }

  for (const [merchantId, rows] of byMerchant) {
    const countsByMonth = new Map<string, number>();
    const amountsByMonth = new Map<string, number>();
    for (const month of historyMonths) {
      countsByMonth.set(month, 0);
      amountsByMonth.set(month, 0);
    }
    for (const txn of rows) {
      const month = insightMonthKey(txn);
      countsByMonth.set(month, (countsByMonth.get(month) ?? 0) + 1);
      amountsByMonth.set(month, (amountsByMonth.get(month) ?? 0) + txn.amountIls);
    }

    const priorCounts = priorPeriods.map((month) => countsByMonth.get(month) ?? 0);
    const currentCount = countsByMonth.get(period) ?? 0;
    const hadStableRecurring =
      priorCounts.every((count) => count > 0) &&
      priorCounts.every((count) => count === priorCounts[0]);

    if (hadStableRecurring && currentCount === 0) {
      insights.push({
        kind: "merchant_disappeared",
        merchantName: merchantName(db, merchantId),
        monthsObserved: MIN_MERCHANT_HISTORY_MONTHS,
      });
      continue;
    }

    if (hadStableRecurring && currentCount > 0 && currentCount < priorCounts[0]!) {
      insights.push({
        kind: "missing_recurring",
        merchantName: merchantName(db, merchantId),
        expectedCount: priorCounts[0]!,
        actualCount: currentCount,
        monthsObserved: MIN_MERCHANT_HISTORY_MONTHS,
      });
    }

    const allMerchantRows = db
      .select()
      .from(transactions)
      .all()
      .filter(
        (txn) =>
          txn.merchantId === merchantId && isScopedExpense(txn, scopedCategoryIds),
      );
    const firstSeenMonth = allMerchantRows
      .map((txn) => insightMonthKey(txn))
      .sort()[0];
    if (firstSeenMonth === period && hasPriorCategorySpend) {
      const currentAmount = amountsByMonth.get(period) ?? 0;
      if (currentAmount > 0) {
        insights.push({
          kind: "new_merchant",
          merchantName: merchantName(db, merchantId),
          amountIls: currentAmount,
        });
      }
    }

    const priorAmounts = priorPeriods.map((month) => amountsByMonth.get(month) ?? 0);
    if (!priorAmounts.every((amount) => amount > 0)) {
      continue;
    }

    const med = median(priorAmounts);
    const deviation = mad(priorAmounts, med);
    const spikeThreshold = med + MAD_MULTIPLIER * (deviation || med * 0.1);
    const dropThreshold = Math.max(0, med - MAD_MULTIPLIER * (deviation || med * 0.1));
    const currentAmount = amountsByMonth.get(period) ?? 0;

    if (currentAmount > spikeThreshold) {
      insights.push({
        kind: "merchant_spike",
        merchantName: merchantName(db, merchantId),
        amountIls: currentAmount,
        medianIls: med,
        pctChange: pctChange(currentAmount, med),
      });
      continue;
    }

    if (currentAmount > 0 && currentAmount < dropThreshold) {
      insights.push({
        kind: "merchant_drop",
        merchantName: merchantName(db, merchantId),
        amountIls: currentAmount,
        medianIls: med,
        pctChange: pctChange(currentAmount, med),
      });
    }
  }

  return insights;
}
