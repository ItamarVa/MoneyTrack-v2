/**
 * Rules that decide which spend series may raise a price-increase or unusual-amount alert.
 * Exists because the first detectors fired on community fees, youth-movement dues, clothing
 * stores, Bit transfers and small noisy grocery baskets. Wording lists are deliberately short:
 * a miss only costs one noisy alert, a wrong hit hides a real one. Category ids are seeded by
 * migrations 0002/0009 (not imported: alerts does not depend on classify). Used by
 * subscriptions.ts and anomalies.ts; thresholds are documented in memory/intelligence.md.
 */
import { accounts, categories, type MoneyTrackDb } from "@moneytrack/db";
import type { DetectableTransaction } from "./eligible-transactions.js";

const UNCATEGORIZED_ID = "00000000-0000-4000-8000-000000000001";

/** Categories (and their descendants) whose payments are subscription-like. */
const SUBSCRIPTION_CATEGORY_IDS = new Set([
  "00000000-0000-4000-8000-000000000052", // telecom & internet
  "00000000-0000-4000-8000-000000000070", // insurance (incl. health / car & home)
  "00000000-0000-4000-8000-000000000091", // entertainment (streaming)
]);

// Person-to-person wording: Bit / PayBox / bank "העברה" lines.
const P2P_PATTERN =
  /(?<![א-ת])ביט(?![א-ת])|(?<![a-z])bit(?![a-z])|paybox|pay\s+box|פייבוקס|פיי\s+בוקס|פיבוקס|העברה|הע\.\s*ל|transfer/i;

// Community, residential and youth-movement dues: regular but not a subscription.
const NON_SUBSCRIPTION_PATTERN =
  /(?<![א-ת])[הלבמש]?ועד(?![א-ת])|קיבוץ|קבוץ|מושב|קהילה|קהילת|דמי\s+חבר|תנועת\s+נוער|בני\s+עקיבא|הצופים|השומר\s+הצעיר|הנוער\s+העובד|גן\s+ילדים|צהרון|קייטנה/;

export function looksLikePersonToPerson(text: string): boolean {
  return P2P_PATTERN.test(text);
}

export function looksLikeNonSubscriptionPayee(text: string): boolean {
  return NON_SUBSCRIPTION_PATTERN.test(text);
}

/**
 * True when the category is unknown/uncategorized or sits under a subscription-like
 * category. Any other known category (groceries, clothing, education, fuel, restaurants,
 * housing, utilities...) means the recurring charge is not a subscription.
 */
export function buildSubscriptionCategoryCheck(db: MoneyTrackDb): (categoryId: string | null) => boolean {
  const parentOf = new Map(
    db
      .select()
      .from(categories)
      .all()
      .map((row) => [row.id, row.parentId] as const),
  );
  return (categoryId) => {
    if (!categoryId || categoryId === UNCATEGORIZED_ID) {
      return true;
    }
    let cursor: string | null | undefined = categoryId;
    for (let depth = 0; cursor && depth < 8; depth += 1) {
      if (SUBSCRIPTION_CATEGORY_IDS.has(cursor)) {
        return true;
      }
      cursor = parentOf.get(cursor);
    }
    return false;
  };
}

/** Rows bought with a card: a card id, or an account that is a credit-card account. */
export function buildCardPurchaseCheck(db: MoneyTrackDb): (row: DetectableTransaction) => boolean {
  const cardAccountIds = new Set(
    db
      .select()
      .from(accounts)
      .all()
      .filter((row) => row.kind === "credit_card")
      .map((row) => row.id),
  );
  return (row) => row.cardId !== null || cardAccountIds.has(row.accountId);
}
