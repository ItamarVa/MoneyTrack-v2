import type { Alert, Budget, NetWorthSnapshot } from "@moneytrack/contracts";
import type { alerts as alertsTable, budgets as budgetsTable, netWorthSnapshots } from "@moneytrack/db";

type DbAlert = typeof alertsTable.$inferSelect;
type DbBudget = typeof budgetsTable.$inferSelect;
type DbNetWorth = typeof netWorthSnapshots.$inferSelect;

export function mapAlert(row: DbAlert): Alert {
  return {
    id: row.id,
    type: row.type as Alert["type"],
    severity: row.severity as Alert["severity"],
    title: row.title,
    message: row.message,
    transactionId: row.transactionId,
    status: row.status as Alert["status"],
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    createdAt: row.createdAt,
  };
}

export function mapBudget(row: DbBudget): Budget {
  return {
    id: row.id,
    categoryId: row.categoryId,
    period: row.period,
    amount: row.amount,
    createdAt: row.createdAt,
  };
}

export function mapNetWorthSnapshot(row: DbNetWorth): NetWorthSnapshot {
  return {
    id: row.id,
    asOf: row.asOf,
    totalAssetsIls: row.totalAssetsIls,
    totalLiabilitiesIls: row.totalLiabilitiesIls,
    netWorthIls: row.netWorthIls,
    computedAt: row.computedAt,
  };
}
