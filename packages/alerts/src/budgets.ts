import { budgets, categories, rollupMonthly, type MoneyTrackDb } from "@moneytrack/db";
import { upsertOpenAlert } from "./alert-store.js";

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

    const rollup = db
      .select()
      .from(rollupMonthly)
      .all()
      .find(
        (row) =>
          row.period === period &&
          row.dateBasis === "transaction" &&
          row.categoryId === budget.categoryId &&
          row.cardId === null &&
          row.personId === null,
      );

    const actual = Math.abs(rollup?.totalAmountIls ?? 0);
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
