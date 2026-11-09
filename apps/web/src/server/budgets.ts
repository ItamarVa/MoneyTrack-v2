import { budgetSpendIls } from "@moneytrack/alerts";
import { categories, eq, budgets, type MoneyTrackDb } from "@moneytrack/db";
import type { BudgetWithVariance } from "@moneytrack/contracts";
import { mapBudget } from "@/server/intelligence-mappers";

/** Spend for a budget's category in its month; the summing rule lives in @moneytrack/alerts. */
export function budgetWithVariance(
  db: MoneyTrackDb,
  row: typeof budgets.$inferSelect,
): BudgetWithVariance {
  const category = db.select().from(categories).where(eq(categories.id, row.categoryId)).get();
  const net = budgetSpendIls(db, row.categoryId, row.period);

  const actualIls = Math.max(0, net);
  const varianceIls = actualIls - row.amount;
  const variancePct = row.amount > 0 ? (varianceIls / row.amount) * 100 : 0;

  return {
    ...mapBudget(row),
    categoryName: category?.name ?? "ללא קטגוריה",
    actualIls,
    varianceIls,
    variancePct,
  };
}
