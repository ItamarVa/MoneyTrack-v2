import { randomUUID } from "node:crypto";
import {
  categories,
  eq,
  merchantAliases,
  merchants,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { getNormalizationVersion, normalizeMerchant } from "./normalize.js";
import {
  UNCATEGORIZED_CATEGORY_ID,
  UNCATEGORIZED_CATEGORY_NAME,
} from "./constants.js";

export function ensureUncategorizedCategory(db: MoneyTrackDb, now = new Date().toISOString()): string {
  const existing = db
    .select()
    .from(categories)
    .where(eq(categories.id, UNCATEGORIZED_CATEGORY_ID))
    .get();

  if (existing) {
    return existing.id;
  }

  db.insert(categories)
    .values({
      id: UNCATEGORIZED_CATEGORY_ID,
      parentId: null,
      name: UNCATEGORIZED_CATEGORY_NAME,
      sortOrder: 9999,
      createdAt: now,
    })
    .run();

  return UNCATEGORIZED_CATEGORY_ID;
}

export function resolveMerchant(
  db: MoneyTrackDb,
  rawDescriptor: string,
  now = new Date().toISOString(),
): { merchantId: string; canonicalName: string; normalized: string } {
  const normalized = normalizeMerchant(rawDescriptor);
  const alias = db
    .select()
    .from(merchantAliases)
    .where(eq(merchantAliases.rawDescriptor, rawDescriptor))
    .get();

  if (alias) {
    const merchant = db.select().from(merchants).where(eq(merchants.id, alias.merchantId)).get();
    if (merchant) {
      return {
        merchantId: merchant.id,
        canonicalName: merchant.canonicalName,
        normalized,
      };
    }
  }

  const merchantId = randomUUID();
  const canonicalName = normalized || rawDescriptor.trim();

  db.insert(merchants)
    .values({
      id: merchantId,
      canonicalName,
      createdAt: now,
    })
    .run();

  db.insert(merchantAliases)
    .values({
      id: randomUUID(),
      merchantId,
      rawDescriptor,
      normalizationVersion: getNormalizationVersion(),
      createdAt: now,
    })
    .run();

  return { merchantId, canonicalName, normalized };
}
