/**
 * Duplicate-name guard shared by POST /api/categories and PATCH /api/categories/[id].
 * Names compare trimmed and case-insensitively, scoped to one parent (null = top level).
 * Existing duplicates are never rewritten here; only new or changed names are checked.
 */
import { categories, type MoneyTrackDb } from "@moneytrack/db";

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function hasSiblingWithName(
  db: MoneyTrackDb,
  parentId: string | null,
  name: string,
  excludeId?: string,
): boolean {
  const wanted = normalizeName(name);
  return db
    .select()
    .from(categories)
    .all()
    .some(
      (row) =>
        row.id !== excludeId &&
        (row.parentId ?? null) === parentId &&
        normalizeName(row.name) === wanted,
    );
}
