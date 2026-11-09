import { DEFAULT_DATE_BASIS } from "@moneytrack/contracts";
import { budgets, categories, rollupMonthly, type MoneyTrackDb } from "@moneytrack/db";
import { upsertOpenAlert } from "./alert-store.js";

type ScopeRollup = {
  period: string;
  dateBasis: string;
  categoryId: string | null;
  totalAmountIls: number;
};

/**
 * Net spend for a budget category and its direct children in one month, summed across every
 * card and person split of the rollup. Shared with the web budgets API so the page and the
 * alerts agree. Budgets sit on top-level categories, so one level of children is enough.
 */
export function sumBudgetScopeSpend(
  rollups: readonly ScopeRollup[],
  allCategories: readonly { id: string; parentId: string | null }[],
  categoryId: string,
  period: string,
): number {
  const scopeIds = new Set([
    categoryId,
    ...allCategories.filter((child) => child.parentId === categoryId).map((child) => child.id),
  ]);
  return rollups
    .filter(
      (row) =>
        row.period === period &&
        row.dateBasis === DEFAULT_DATE_BASIS &&
        row.categoryId !== null &&
        scopeIds.has(row.categoryId),
    )
    .reduce((sum, row) => sum + row.totalAmountIls, 0);
}

export function budgetSpendIls(db: MoneyTrackDb, categoryId: string, period: string): number {
  return sumBudgetScopeSpend(
    db.select().from(rollupMonthly).all(),
    db.select().from(categories).all(),
    categoryId,
    period,
  );
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatIls(amount: number): string {
  return `${amount.toLocaleString("he-IL", { maximumFractionDigits: 0 })} ₪`;
}

export function detectBudgetVariance(db: MoneyTrackDb): number {
  const period = currentPeriod();
  const categoryNames = new Map(
    db
      .select()
      .from(categories)
      .all()
      .map((row) => [row.id, row.name] as const),
  );

  let created = 0;
  for (const budget of db.select().from(budgets).all()) {
    if (budget.period !== period) {
      continue;
    }

    const actual = Math.max(0, budgetSpendIls(db, budget.categoryId, period));
    if (actual <= budget.amount) {
      continue;
    }

    const categoryName = categoryNames.get(budget.categoryId) ?? "קטגוריה";
    const id = upsertOpenAlert(db, {
      type: "budget_variance",
      severity: actual > budget.amount * 1.2 ? "critical" : "warning",
      title: "חריגה מתקציב",
      message: `חריגה מתקציב: ${categoryName} — בוצעו ${formatIls(actual)} מתוך ${formatIls(budget.amount)}`,
      metadata: { categoryId: budget.categoryId, period, actual, budget: budget.amount },
      dedupeKey: `budget:${budget.categoryId}:${period}`,
    });
    if (id) {
      created += 1;
    }
  }

  return created;
}
