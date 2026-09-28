import { categories, eq, rollupMonthly, budgets, type MoneyTrackDb } from "@moneytrack/db";
import type { BudgetWithVariance } from "@moneytrack/contracts";
import { mapBudget } from "@/server/intelligence-mappers";

export function budgetWithVariance(
  db: MoneyTrackDb,
  row: typeof budgets.$inferSelect,
): BudgetWithVariance {
  const category = db.select().from(categories).where(eq(categories.id, row.categoryId)).get();
  const rollup = db
    .select()
    .from(rollupMonthly)
    .all()
    .find(
      (item) =>
        item.period === row.period &&
        item.dateBasis === "transaction" &&
        item.categoryId === row.categoryId &&
        item.cardId === null &&
        item.personId === null,
    );

  const actualIls = Math.abs(rollup?.totalAmountIls ?? 0);
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
