import type { Transaction } from "@moneytrack/contracts";
import { describe, expect, it } from "vitest";
import { UNCATEGORIZED_CATEGORY_ID } from "@/lib/category-ids";
import {
  directCategoryTransactions,
  transactionSliceLabel,
  transactionsToBreakdownItems,
  TRANSACTION_RING_SOURCE_VIEW,
} from "./entity-transaction-slices";

const TXN_ID = "550e8400-e29b-41d4-a716-446655440000";
const ACCOUNT_ID = "550e8400-e29b-41d4-a716-446655440001";
const PARENT_CATEGORY_ID = "660e8400-e29b-41d4-a716-446655440010";
const CHILD_CATEGORY_ID = "660e8400-e29b-41d4-a716-446655440011";

function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: TXN_ID,
    firstSeenRawId: null,
    accountId: ACCOUNT_ID,
    cardId: null,
    identityHash: "a".repeat(64),
    transactionDate: "2026-08-15",
    chargeDate: "2026-09-01",
    status: "posted",
    direction: "debit",
    amountIls: 120,
    originalAmount: 120,
    originalCurrency: "ILS",
    fxRate: null,
    fxFeeIls: null,
    descriptionRaw: "SUPERMARKET TLV",
    descriptionNormalized: "supermarket tlv",
    merchantId: null,
    kind: "expense",
    purchaseId: null,
    installmentIndex: null,
    installmentTotal: null,
    excludedFromTotals: false,
    exclusionReason: null,
    userNote: null,
    categoryId: PARENT_CATEGORY_ID,
    providerCategory: null,
    classificationSource: null,
    reportingPeriod: null,
    reportingPeriodLocked: false,
    tagIds: [],
    createdAt: "2026-08-15T10:00:00+02:00",
    updatedAt: "2026-08-15T10:00:00+02:00",
    ...overrides,
  };
}

describe("transactionSliceLabel", () => {
  it("prefers descriptionRaw over normalized merchant text", () => {
    expect(transactionSliceLabel(makeTxn())).toBe("SUPERMARKET TLV");
  });

  it("falls back to normalized merchant text when description is empty", () => {
    expect(
      transactionSliceLabel(
        makeTxn({ descriptionRaw: "  ", descriptionNormalized: "rami levy" }),
      ),
    ).toBe("rami levy");
  });

  it("falls back to transaction date when descriptions are empty", () => {
    expect(
      transactionSliceLabel(
        makeTxn({ descriptionRaw: "", descriptionNormalized: "", transactionDate: "2026-03-02" }),
      ),
    ).toBe("2026-03-02");
  });
});

describe("transactionsToBreakdownItems", () => {
  it("maps signed expense contributions and uses transaction id as slice key", () => {
    const expense = makeTxn({
      id: "770e8400-e29b-41d4-a716-446655440001",
      direction: "debit",
      kind: "expense",
      amountIls: 200,
    });
    const refund = makeTxn({
      id: "770e8400-e29b-41d4-a716-446655440002",
      direction: "credit",
      kind: "refund",
      amountIls: 50,
    });
    const excluded = makeTxn({
      id: "770e8400-e29b-41d4-a716-446655440003",
      excludedFromTotals: true,
      amountIls: 999,
    });

    const items = transactionsToBreakdownItems([expense, refund, excluded]);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      categoryId: expense.id,
      categoryName: "SUPERMARKET TLV",
      amountIls: 200,
      transactionCount: 1,
    });
    expect(items[1]?.amountIls).toBe(-50);
    expect(items[2]?.amountIls).toBe(0);
  });

  it("tags every slice so click handlers can tell it apart from a category", () => {
    const items = transactionsToBreakdownItems([makeTxn()]);
    expect(items[0]?.drillDown.sourceView).toBe(TRANSACTION_RING_SOURCE_VIEW);
  });
});

describe("directCategoryTransactions", () => {
  it("keeps only rows whose resolved category matches exactly", () => {
    const onParent = makeTxn({ id: "880e8400-e29b-41d4-a716-446655440001", categoryId: PARENT_CATEGORY_ID });
    const onChild = makeTxn({ id: "880e8400-e29b-41d4-a716-446655440002", categoryId: CHILD_CATEGORY_ID });
    const uncategorized = makeTxn({ id: "880e8400-e29b-41d4-a716-446655440003", categoryId: null });

    const result = directCategoryTransactions(
      [onParent, onChild, uncategorized],
      PARENT_CATEGORY_ID,
    );

    expect(result).toEqual([onParent]);
  });

  it("files rows without a category under the uncategorized bucket", () => {
    const onParent = makeTxn({ id: "880e8400-e29b-41d4-a716-446655440001" });
    const noCategory = makeTxn({ id: "880e8400-e29b-41d4-a716-446655440004", categoryId: null });
    const seededUncategorized = makeTxn({
      id: "880e8400-e29b-41d4-a716-446655440005",
      categoryId: UNCATEGORIZED_CATEGORY_ID,
    });

    const result = directCategoryTransactions(
      [onParent, noCategory, seededUncategorized],
      UNCATEGORIZED_CATEGORY_ID,
    );

    expect(result).toEqual([noCategory, seededUncategorized]);
  });
});
