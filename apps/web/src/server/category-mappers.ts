import type { Category, Tag } from "@moneytrack/contracts";
import type { categories, tags } from "@moneytrack/db";

type DbCategory = typeof categories.$inferSelect;
type DbTag = typeof tags.$inferSelect;

export function mapCategory(row: DbCategory): Category {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    sortOrder: row.sortOrder,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export function mapTag(row: DbTag): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.createdAt,
  };
}
