import type { SalarySource } from "@moneytrack/contracts";
import type { salarySources } from "@moneytrack/db";

type DbSalarySource = typeof salarySources.$inferSelect;

export function mapSalarySource(row: DbSalarySource): SalarySource {
  return {
    id: row.id,
    displayName: row.displayName,
    personId: row.personId,
    merchantId: row.merchantId,
    accountId: row.accountId,
    matchPattern: row.matchPattern,
    sortOrder: row.sortOrder,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
