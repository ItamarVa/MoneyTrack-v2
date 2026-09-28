/**
 * Salary-source matching for the dashboard inner income ring.
 * First enabled source by sortOrder wins; unmatched income rolls into "other".
 */
import { salarySources, type MoneyTrackDb } from "@moneytrack/db";
import type { transactions } from "@moneytrack/db";

export const SALARY_OTHER_LABEL = "הכנסות אחרות";

export type SalarySourceRow = typeof salarySources.$inferSelect;

export function loadSalarySources(
  db: MoneyTrackDb,
  personIds?: string[],
): SalarySourceRow[] {
  const rows = db
    .select()
    .from(salarySources)
    .all()
    .filter((row) => row.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (!personIds?.length) {
    return rows;
  }

  const allowed = new Set(personIds);
  return rows.filter((row) => !row.personId || allowed.has(row.personId));
}

export function salarySourceMatches(
  txn: typeof transactions.$inferSelect,
  source: SalarySourceRow,
): boolean {
  if (source.accountId && txn.accountId !== source.accountId) {
    return false;
  }
  if (source.merchantId && txn.merchantId !== source.merchantId) {
    return false;
  }
  if (source.matchPattern?.trim()) {
    const haystack = txn.descriptionNormalized.toLowerCase();
    const needle = source.matchPattern.trim().toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
  }
  return true;
}

export function matchSalarySourceId(
  txn: typeof transactions.$inferSelect,
  sources: SalarySourceRow[],
): string | null {
  for (const source of sources) {
    if (salarySourceMatches(txn, source)) {
      return source.id;
    }
  }
  return null;
}
