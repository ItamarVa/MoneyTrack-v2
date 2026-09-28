/**
 * Provider category map CRUD and uncategorized-merchant aggregation for /api/classify.
 * ponytail: full-table scans — fine for single-user local SQLite; add indexes if counts grow.
 */
import type { ProviderCategoryMapEntry, UncategorizedMerchant } from "@moneytrack/contracts";
import {
  categories,
  eq,
  merchants,
  providerCategoryMap,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";

function nowIso(): string {
  return new Date().toISOString();
}

function isUncategorized(categoryId: string | null, uncategorizedCategoryId: string): boolean {
  return categoryId === null || categoryId === uncategorizedCategoryId;
}

/** Group uncategorized transactions by merchant; sort count DESC then amount DESC. */
export function listUncategorizedMerchants(
  db: MoneyTrackDb,
  uncategorizedCategoryId: string,
): UncategorizedMerchant[] {
  const merchantNames = new Map(
    db.select().from(merchants).all().map((row) => [row.id, row.canonicalName]),
  );

  const groups = new Map<
    string,
    { count: number; totalAmountIls: number; providerCategories: Set<string> }
  >();

  for (const row of db.select().from(transactions).all()) {
    if (!row.merchantId || !isUncategorized(row.categoryId, uncategorizedCategoryId)) {
      continue;
    }

    const bucket = groups.get(row.merchantId) ?? {
      count: 0,
      totalAmountIls: 0,
      providerCategories: new Set<string>(),
    };
    bucket.count += 1;
    bucket.totalAmountIls += Math.abs(row.amountIls);
    if (row.providerCategory) {
      bucket.providerCategories.add(row.providerCategory);
    }
    groups.set(row.merchantId, bucket);
  }

  const merchantsList: UncategorizedMerchant[] = [];
  for (const [merchantId, bucket] of groups) {
    merchantsList.push({
      merchantId,
      merchantName: merchantNames.get(merchantId) ?? "Unknown",
      transactionCount: bucket.count,
      totalAmountIls: bucket.totalAmountIls,
      providerCategories: [...bucket.providerCategories].sort((a, b) => a.localeCompare(b, "he")),
    });
  }

  merchantsList.sort((a, b) => {
    if (b.transactionCount !== a.transactionCount) {
      return b.transactionCount - a.transactionCount;
    }
    return b.totalAmountIls - a.totalAmountIls;
  });

  return merchantsList;
}

/** All provider_category_map rows with per-category transaction counts. */
export function listProviderCategoryMappings(db: MoneyTrackDb): ProviderCategoryMapEntry[] {
  const counts = new Map<string, number>();
  for (const row of db.select().from(transactions).all()) {
    if (!row.providerCategory) {
      continue;
    }
    counts.set(row.providerCategory, (counts.get(row.providerCategory) ?? 0) + 1);
  }

  return db
    .select()
    .from(providerCategoryMap)
    .all()
    .map((row) => ({
      providerCategory: row.providerCategory,
      categoryId: row.categoryId,
      transactionCount: counts.get(row.providerCategory) ?? 0,
      updatedAt: row.updatedAt,
    }))
    .sort((a, b) => a.providerCategory.localeCompare(b.providerCategory, "he"));
}

export type ProviderCategoryMappingUpdate = {
  providerCategory: string;
  categoryId: string | null;
};

/** Upsert provider_category_map rows; validates category ids when non-null. */
export function updateProviderCategoryMappings(
  db: MoneyTrackDb,
  mappings: ProviderCategoryMappingUpdate[],
): void {
  const now = nowIso();

  for (const mapping of mappings) {
    if (mapping.categoryId !== null) {
      const category = db
        .select()
        .from(categories)
        .where(eq(categories.id, mapping.categoryId))
        .get();
      if (!category) {
        throw new Error(`category_not_found:${mapping.categoryId}`);
      }
    }

    const existing = db
      .select()
      .from(providerCategoryMap)
      .where(eq(providerCategoryMap.providerCategory, mapping.providerCategory))
      .get();

    if (existing) {
      db.update(providerCategoryMap)
        .set({ categoryId: mapping.categoryId, updatedAt: now })
        .where(eq(providerCategoryMap.providerCategory, mapping.providerCategory))
        .run();
    } else {
      db.insert(providerCategoryMap)
        .values({
          providerCategory: mapping.providerCategory,
          categoryId: mapping.categoryId,
          updatedAt: now,
        })
        .run();
    }
  }
}
