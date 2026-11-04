/**
 * Maps what the engine already knows about a bank row (kind, internal-transfer
 * exclusion, a few generic stems) to a fixed system category, for the "kind" stage
 * of classifyTransaction. Without it ~75% of a month sat in "לא מסווג".
 * Ids are the fixed UUIDs seeded by migrations 0002 and 0009; the stage matches by id
 * only and skips a bucket whose row is missing. Bank rows only: a card purchase is
 * always a purchase, and a shop may legitimately be called "ביטוח" something.
 * Kind detection itself lives in packages/engine (transaction-kind.ts); the tax and
 * insurance stems live here because they change the category, never the kind.
 */

export const SYSTEM_CATEGORY_IDS = {
  /** 0002: העברות פנימיות */
  internalTransfer: "00000000-0000-4000-8000-0000000000c2",
  /** 0002: חיסכון */
  savings: "00000000-0000-4000-8000-0000000000b1",
  /** 0009: חיובי כרטיס אשראי ללא פירוט (top level) — settlement of a card we do not scrape; neutral, not a spend bucket. */
  cardBill: "00000000-0000-4000-8000-0000000000c3",
  /** 0009: החזרי הלוואות ומשכנתא */
  loanPayment: "00000000-0000-4000-8000-000000000043",
  /** 0002: הכנסות */
  income: "00000000-0000-4000-8000-0000000000c1",
  /** 0009: מיסים ועמלות */
  taxesFees: "00000000-0000-4000-8000-0000000000d0",
  /** 0002: ביטוח (parent; transactions may sit on it directly) */
  insurance: "00000000-0000-4000-8000-000000000070",
} as const;

// Whole-word Hebrew stems: JS \b ignores Hebrew letters, so use lookarounds; one
// prefix letter ("לביטוח") is allowed.
const TAX_WITHHELD = /ניכוי\s+מס/;
const NATIONAL_INSURANCE = /ביטוח\s+לאומי/;
const INSURANCE = /(?<![א-ת]{2})ביטוח(?![א-ת])/;

export type KindCategoryInput = {
  accountKind: string;
  kind: string;
  exclusionReason: string | null;
  descriptionRaw: string;
  descriptionNormalized: string;
};

export function resolveKindCategoryId(input: KindCategoryInput): string | null {
  if (input.exclusionReason === "internal_transfer") {
    return SYSTEM_CATEGORY_IDS.internalTransfer;
  }
  if (input.accountKind !== "bank") {
    return null;
  }

  switch (input.kind) {
    case "card_settlement":
      return SYSTEM_CATEGORY_IDS.cardBill;
    case "loan_payment":
      return SYSTEM_CATEGORY_IDS.loanPayment;
    case "transfer":
      return SYSTEM_CATEGORY_IDS.savings;
    case "income":
      return SYSTEM_CATEGORY_IDS.income;
    case "expense": {
      const texts = [input.descriptionRaw, input.descriptionNormalized];
      if (texts.some((t) => TAX_WITHHELD.test(t) || NATIONAL_INSURANCE.test(t))) {
        return SYSTEM_CATEGORY_IDS.taxesFees;
      }
      if (texts.some((t) => INSURANCE.test(t))) {
        return SYSTEM_CATEGORY_IDS.insurance;
      }
      return null;
    }
    default:
      return null;
  }
}
