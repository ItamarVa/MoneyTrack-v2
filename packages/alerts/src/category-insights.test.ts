import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { accounts, categories, merchants, transactions } from "@moneytrack/db";
import { closeDb, initDb, isEncryptedSqliteAvailable, runMigrations, type MoneyTrackDb } from "@moneytrack/db";
import { buildCategoryInsights } from "./category-insights.js";

function nowIso(): string {
  return new Date().toISOString();
}

async function openTestDb(): Promise<{ db: MoneyTrackDb; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-cat-insights-"));
  const key = randomBytes(32);
  closeDb();
  const db = await initDb({ dataDir: tmpDir, key, skipGuards: true });
  runMigrations();
  return {
    db,
    cleanup: () => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

function seedCategory(db: MoneyTrackDb, name: string, parentId: string | null = null): string {
  const id = randomUUID();
  db.insert(categories)
    .values({ id, parentId, name, sortOrder: 0, createdAt: nowIso() })
    .run();
  return id;
}

function seedAccount(db: MoneyTrackDb): string {
  const id = randomUUID();
  const now = nowIso();
  db.insert(accounts)
    .values({
      id,
      kind: "bank",
      connectionId: null,
      institutionCode: "leumi",
      displayName: "Test",
      numberLast4: "1234",
      currency: "ILS",
      ownerPersonId: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

function seedMerchant(db: MoneyTrackDb, name: string): string {
  const id = randomUUID();
  db.insert(merchants).values({ id, canonicalName: name, createdAt: nowIso() }).run();
  return id;
}

function seedExpense(
  db: MoneyTrackDb,
  opts: {
    accountId: string;
    merchantId: string;
    amount: number;
    date: string;
    chargeDate?: string;
    categoryId: string;
  },
): void {
  const now = nowIso();
  db.insert(transactions)
    .values({
      id: randomUUID(),
      firstSeenRawId: null,
      accountId: opts.accountId,
      cardId: null,
      identityHash: randomUUID(),
      transactionDate: opts.date,
      chargeDate: opts.chargeDate ?? opts.date,
      status: "posted",
      direction: "debit",
      amountIls: opts.amount,
      originalAmount: opts.amount,
      originalCurrency: "ILS",
      fxRate: null,
      fxFeeIls: null,
      descriptionRaw: "test",
      descriptionNormalized: "test",
      merchantId: opts.merchantId,
      kind: "expense",
      purchaseId: null,
      installmentIndex: null,
      installmentTotal: null,
      excludedFromTotals: false,
      exclusionReason: null,
      userNote: null,
      categoryId: opts.categoryId,
      classificationSource: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

describe.skipIf(!isEncryptedSqliteAvailable())("buildCategoryInsights", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("flags a merchant that disappeared after three active months", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const categoryId = seedCategory(ctx.db, "Subscriptions");
    const accountId = seedAccount(ctx.db);
    const merchantId = seedMerchant(ctx.db, "Netflix");

    for (const date of ["2025-11-05", "2025-12-05", "2026-01-05"]) {
      seedExpense(ctx.db, { accountId, merchantId, amount: 50, date, categoryId });
    }

    const insights = buildCategoryInsights(ctx.db, categoryId, "2026-02");
    expect(insights).toContainEqual({
      kind: "merchant_disappeared",
      merchantName: "Netflix",
      monthsObserved: 3,
    });
  });

  it("flags a first-time merchant when the category already has prior-month spend", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const categoryId = seedCategory(ctx.db, "Dining");
    const accountId = seedAccount(ctx.db);
    const existingMerchantId = seedMerchant(ctx.db, "Old Place");
    const merchantId = seedMerchant(ctx.db, "New Cafe");

    seedExpense(ctx.db, {
      accountId,
      merchantId: existingMerchantId,
      amount: 60,
      date: "2026-02-10",
      categoryId,
    });

    seedExpense(ctx.db, {
      accountId,
      merchantId,
      amount: 85,
      date: "2026-03-12",
      categoryId,
    });

    const insights = buildCategoryInsights(ctx.db, categoryId, "2026-03");
    expect(insights).toContainEqual({
      kind: "new_merchant",
      merchantName: "New Cafe",
      amountIls: 85,
    });
  });

  it("does not emit new_merchant when the category has no prior-month spend", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const categoryId = seedCategory(ctx.db, "Dining");
    const accountId = seedAccount(ctx.db);
    const merchantId = seedMerchant(ctx.db, "New Cafe");

    seedExpense(ctx.db, {
      accountId,
      merchantId,
      amount: 85,
      date: "2026-03-12",
      categoryId,
    });

    const insights = buildCategoryInsights(ctx.db, categoryId, "2026-03");
    expect(insights.some((insight) => insight.kind === "new_merchant")).toBe(false);
  });

  it("uses charge month for category_vs_average so amountIls matches charge-month total", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const categoryId = seedCategory(ctx.db, "Utilities");
    const accountId = seedAccount(ctx.db);
    const merchantId = seedMerchant(ctx.db, "Electric Co");

    for (const date of ["2026-02-05", "2026-03-05", "2026-04-05"]) {
      seedExpense(ctx.db, { accountId, merchantId, amount: 100, date, categoryId });
    }

    seedExpense(ctx.db, {
      accountId,
      merchantId,
      amount: 500,
      date: "2026-04-28",
      chargeDate: "2026-05-08",
      categoryId,
    });

    const insights = buildCategoryInsights(ctx.db, categoryId, "2026-05");
    expect(insights).toContainEqual({
      kind: "category_vs_average",
      averageIls: 100,
      amountIls: 500,
      pctChange: 400,
    });
  });

  it("flags a dominant transaction that drives most of the month", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const categoryId = seedCategory(ctx.db, "Shopping");
    const accountId = seedAccount(ctx.db);
    const bigMerchantId = seedMerchant(ctx.db, "Electronics");
    const smallMerchantId = seedMerchant(ctx.db, "Snacks");

    seedExpense(ctx.db, {
      accountId,
      merchantId: bigMerchantId,
      amount: 800,
      date: "2026-04-10",
      categoryId,
    });
    seedExpense(ctx.db, {
      accountId,
      merchantId: smallMerchantId,
      amount: 100,
      date: "2026-04-15",
      categoryId,
    });

    const insights = buildCategoryInsights(ctx.db, categoryId, "2026-04");
    expect(insights).toContainEqual({
      kind: "dominant_transaction",
      merchantName: "Electronics",
      amountIls: 800,
      sharePct: 88.88888888888889,
    });
  });

  it("includes child-category spend when insights are scoped to a parent category", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const parentId = seedCategory(ctx.db, "Food");
    const childId = seedCategory(ctx.db, "Groceries", parentId);
    const accountId = seedAccount(ctx.db);
    const existingMerchantId = seedMerchant(ctx.db, "Supermarket");
    const merchantId = seedMerchant(ctx.db, "Corner Store");

    seedExpense(ctx.db, {
      accountId,
      merchantId: existingMerchantId,
      amount: 90,
      date: "2026-04-08",
      categoryId: childId,
    });

    seedExpense(ctx.db, {
      accountId,
      merchantId,
      amount: 120,
      date: "2026-05-08",
      categoryId: childId,
    });

    const insights = buildCategoryInsights(ctx.db, parentId, "2026-05");
    expect(insights).toContainEqual({
      kind: "new_merchant",
      merchantName: "Corner Store",
      amountIls: 120,
    });
  });
});
