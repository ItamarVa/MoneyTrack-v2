import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  alerts,
  accounts,
  budgets,
  categories,
  merchants,
  recurringInstruments,
  rollupMonthly,
  transactions,
} from "@moneytrack/db";
import { closeDb, initDb, runMigrations, type MoneyTrackDb } from "@moneytrack/db";
import { isEncryptedSqliteAvailable } from "@moneytrack/db";
import {
  detectAnomalies,
  detectBudgetVariance,
  detectDuplicates,
  detectSubscriptions,
  forecastCashflow,
  runIntelligenceDetectors,
} from "./index.js";

// Seeded by migration 0009.
const TAXES_FEES_CATEGORY_ID = "00000000-0000-4000-8000-0000000000d0";
const PRICE_JUMP_SERIES = [
  { date: "2025-10-05", amount: 50 },
  { date: "2025-11-05", amount: 50 },
  { date: "2025-12-05", amount: 50 },
  { date: "2026-01-05", amount: 70 },
];


function nowIso(): string {
  return new Date().toISOString();
}

async function openTestDb(): Promise<{ db: MoneyTrackDb; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-alerts-"));
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

function seedCategory(db: MoneyTrackDb, name: string): string {
  const id = randomUUID();
  db.insert(categories)
    .values({ id, parentId: null, name, sortOrder: 0, createdAt: nowIso() })
    .run();
  return id;
}

function seedAccount(db: MoneyTrackDb, scope = "household", kind = "bank"): string {
  const id = randomUUID();
  const now = nowIso();
  db.insert(accounts)
    .values({
      id,
      kind,
      connectionId: null,
      institutionCode: "leumi",
      displayName: "Test",
      numberLast4: "1234",
      currency: "ILS",
      ownerPersonId: null,
      scope,
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
    categoryId?: string;
    kind?: string;
    excludedFromTotals?: boolean;
    description?: string;
  },
): string {
  const id = randomUUID();
  const now = nowIso();
  db.insert(transactions)
    .values({
      id,
      firstSeenRawId: null,
      accountId: opts.accountId,
      cardId: null,
      identityHash: randomUUID(),
      transactionDate: opts.date,
      chargeDate: opts.date,
      status: "posted",
      direction: "debit",
      amountIls: opts.amount,
      originalAmount: opts.amount,
      originalCurrency: "ILS",
      fxRate: null,
      fxFeeIls: null,
      descriptionRaw: opts.description ?? "test",
      descriptionNormalized: opts.description ?? "test",
      merchantId: opts.merchantId,
      kind: opts.kind ?? "expense",
      purchaseId: null,
      installmentIndex: null,
      installmentTotal: null,
      excludedFromTotals: opts.excludedFromTotals ?? false,
      exclusionReason: null,
      userNote: null,
      categoryId: opts.categoryId ?? null,
      classificationSource: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

describe.skipIf(!isEncryptedSqliteAvailable())("@moneytrack/alerts detectors", () => {
  let ctx: { db: MoneyTrackDb; cleanup: () => void };

  afterEach(() => {
    ctx?.cleanup();
  });

  it("creates budget variance alert when spend exceeds budget", async () => {
    ctx = await openTestDb();
    const categoryId = seedCategory(ctx.db, "מזון");
    const period = new Date().toISOString().slice(0, 7);
    dbInsertBudget(ctx.db, categoryId, period, 1000);
    dbInsertRollup(ctx.db, period, categoryId, 1500);

    const created = detectBudgetVariance(ctx.db);
    expect(created).toBe(1);
    const open = ctx.db.select().from(alerts).all().filter((row) => row.status === "open");
    expect(open).toHaveLength(1);
    expect(open[0]?.type).toBe("budget_variance");
    expect(open[0]?.message).toContain("מזון");
  });

  it("detects monthly subscriptions and price increases", async () => {
    ctx = await openTestDb();
    const accountId = seedAccount(ctx.db);
    const merchantId = seedMerchant(ctx.db, "נטפליקס");
    const dates = ["2025-10-05", "2025-11-05", "2025-12-05", "2026-01-05"];
    for (const date of dates.slice(0, 3)) {
      seedExpense(ctx.db, { accountId, merchantId, amount: 50, date });
    }
    seedExpense(ctx.db, { accountId, merchantId, amount: 60, date: dates[3]! });

    const upserted = detectSubscriptions(ctx.db);
    expect(upserted).toBeGreaterThan(0);

    const recurring = ctx.db.select().from(recurringInstruments).all();
    expect(recurring).toHaveLength(1);
    expect(recurring[0]?.expectedAmount).toBe(60);

    const priceAlerts = ctx.db
      .select()
      .from(alerts)
      .all()
      .filter((row) => row.type === "price_increase");
    expect(priceAlerts.length).toBeGreaterThan(0);
  });

  it("ignores non-spend kinds, taxes and business accounts in subscription detection", async () => {
    ctx = await openTestDb();
    const accountId = seedAccount(ctx.db);
    const businessId = seedAccount(ctx.db, "business");
    const fund = seedMerchant(ctx.db, "Money Market Fund");
    const mortgage = seedMerchant(ctx.db, "Mortgage");
    const tax = seedMerchant(ctx.db, "Securities Tax");
    const excluded = seedMerchant(ctx.db, "Excluded Co");
    const business = seedMerchant(ctx.db, "Business Co");
    const real = seedMerchant(ctx.db, "Streaming Co");

    for (const { date, amount } of PRICE_JUMP_SERIES) {
      seedExpense(ctx.db, { accountId, merchantId: fund, amount, date, kind: "transfer" });
      seedExpense(ctx.db, { accountId, merchantId: mortgage, amount, date, kind: "loan_payment" });
      seedExpense(ctx.db, { accountId, merchantId: tax, amount, date, categoryId: TAXES_FEES_CATEGORY_ID });
      seedExpense(ctx.db, { accountId, merchantId: excluded, amount, date, excludedFromTotals: true });
      seedExpense(ctx.db, { accountId: businessId, merchantId: business, amount, date });
      seedExpense(ctx.db, { accountId, merchantId: real, amount, date });
    }

    detectSubscriptions(ctx.db);

    const priceAlerts = ctx.db
      .select()
      .from(alerts)
      .all()
      .filter((row) => row.type === "price_increase");
    expect(priceAlerts).toHaveLength(1);
    expect(priceAlerts[0]?.message).toContain("Streaming Co");
    expect(ctx.db.select().from(recurringInstruments).all()).toHaveLength(1);
  });

  it("ignores non-spend rows and business accounts in anomaly and duplicate detection", async () => {
    ctx = await openTestDb();
    const accountId = seedAccount(ctx.db);
    const businessId = seedAccount(ctx.db, "business");
    const fund = seedMerchant(ctx.db, "Money Market Fund");
    const business = seedMerchant(ctx.db, "Business Co");

    for (const date of ["2025-08-01", "2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01"]) {
      seedExpense(ctx.db, { accountId, merchantId: fund, amount: 20, date, kind: "transfer" });
      seedExpense(ctx.db, { accountId: businessId, merchantId: business, amount: 20, date });
    }
    seedExpense(ctx.db, { accountId, merchantId: fund, amount: 900, date: "2026-01-01", kind: "transfer" });
    seedExpense(ctx.db, { accountId: businessId, merchantId: business, amount: 900, date: "2026-01-01" });
    seedExpense(ctx.db, { accountId, merchantId: fund, amount: 500, date: "2026-01-10", kind: "card_settlement" });
    seedExpense(ctx.db, { accountId, merchantId: fund, amount: 500, date: "2026-01-10", kind: "card_settlement" });
    seedExpense(ctx.db, { accountId: businessId, merchantId: business, amount: 80, date: "2026-01-11" });
    seedExpense(ctx.db, { accountId: businessId, merchantId: business, amount: 80, date: "2026-01-11" });

    expect(detectAnomalies(ctx.db)).toBe(0);
    expect(detectDuplicates(ctx.db)).toBe(0);
  });

  it("dismisses open alerts and ends instruments whose rows are no longer eligible", async () => {
    ctx = await openTestDb();
    const accountId = seedAccount(ctx.db);
    const fund = seedMerchant(ctx.db, "Money Market Fund");
    const real = seedMerchant(ctx.db, "Streaming Co");

    for (const { date, amount } of PRICE_JUMP_SERIES) {
      seedExpense(ctx.db, { accountId, merchantId: real, amount, date });
    }
    const fundTxnId = seedExpense(ctx.db, {
      accountId,
      merchantId: fund,
      amount: 900,
      date: "2026-01-05",
      kind: "transfer",
    });
    // Stale rows left behind by an older detector run.
    ctx.db
      .insert(alerts)
      .values({
        id: randomUUID(),
        type: "price_increase",
        severity: "critical",
        title: "stale",
        message: "stale",
        transactionId: fundTxnId,
        status: "open",
        metadata: null,
        createdAt: nowIso(),
      })
      .run();
    ctx.db
      .insert(recurringInstruments)
      .values({
        id: randomUUID(),
        merchantId: fund,
        accountId,
        cadence: "monthly",
        expectedAmount: 900,
        lastSeen: "2026-01-05",
        status: "active",
        priceHistory: "[]",
        createdAt: nowIso(),
      })
      .run();

    runIntelligenceDetectors(ctx.db);

    const rows = ctx.db.select().from(alerts).all();
    expect(rows.find((row) => row.title === "stale")?.status).toBe("dismissed");
    expect(rows.filter((row) => row.type === "price_increase" && row.status === "open")).toHaveLength(1);
    const instruments = ctx.db.select().from(recurringInstruments).all();
    expect(instruments.find((row) => row.merchantId === fund)?.status).toBe("ended");
    expect(instruments.find((row) => row.merchantId === real)?.status).toBe("active");
  });

  it("flags duplicate charges on the same day", async () => {
    ctx = await openTestDb();
    const accountId = seedAccount(ctx.db);
    const merchantId = seedMerchant(ctx.db, "סופר");
    seedExpense(ctx.db, { accountId, merchantId, amount: 120, date: "2026-01-10" });
    seedExpense(ctx.db, { accountId, merchantId, amount: 120, date: "2026-01-10" });

    const created = detectDuplicates(ctx.db);
    expect(created).toBe(1);
  });

  it("flags a 3x card purchase but not small noisy amounts or bank payments", async () => {
    ctx = await openTestDb();
    const cardAccount = seedAccount(ctx.db, "household", "credit_card");
    const bankAccount = seedAccount(ctx.db);
    const shop = seedMerchant(ctx.db, "Gadget Co");
    const grocer = seedMerchant(ctx.db, "Grocer Co");
    const person = seedMerchant(ctx.db, "Friend Co");
    const dates = ["2025-08-01", "2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01"];
    const grocerAmounts = [60, 80, 70, 72, 68];
    dates.forEach((date, index) => {
      seedExpense(ctx.db, { accountId: cardAccount, merchantId: shop, amount: 100, date });
      seedExpense(ctx.db, { accountId: cardAccount, merchantId: grocer, amount: grocerAmounts[index]!, date });
      seedExpense(ctx.db, { accountId: bankAccount, merchantId: person, amount: 100, date });
    });
    seedExpense(ctx.db, { accountId: cardAccount, merchantId: shop, amount: 300, date: "2026-01-01" });
    seedExpense(ctx.db, { accountId: cardAccount, merchantId: grocer, amount: 75, date: "2026-01-01" });
    seedExpense(ctx.db, { accountId: bankAccount, merchantId: person, amount: 900, date: "2026-01-01" });

    expect(detectAnomalies(ctx.db)).toBe(1);
    const found = ctx.db.select().from(alerts).all().filter((row) => row.type === "anomaly");
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("Gadget Co");
    expect(found[0]?.message).not.toContain(found[0]!.title);
  });

  it("writes a plain body without the title and dismisses alerts that no longer qualify", async () => {
    ctx = await openTestDb();
    const accountId = seedAccount(ctx.db);
    const stream = seedMerchant(ctx.db, "Streaming Co");
    const fee = seedMerchant(ctx.db, "Community Co");
    const p2p = seedMerchant(ctx.db, "Friend Co");
    const educationId = "00000000-0000-4000-8000-000000000082";
    for (const { date } of PRICE_JUMP_SERIES) {
      const latest = date === "2026-01-05";
      seedExpense(ctx.db, { accountId, merchantId: stream, amount: latest ? 46.7 : 27.6, date });
      seedExpense(ctx.db, {
        accountId,
        merchantId: fee,
        amount: latest ? 300 : 200,
        date,
        categoryId: educationId,
      });
      seedExpense(ctx.db, {
        accountId,
        merchantId: p2p,
        amount: latest ? 90 : 50,
        date,
        description: "BIT transfer",
      });
    }
    const feeTxn = ctx.db
      .select()
      .from(transactions)
      .all()
      .find((row) => row.merchantId === fee && row.amountIls === 300)!;
    // An alert raised under the old, looser rules on the community-fee-like series.
    ctx.db
      .insert(alerts)
      .values({
        id: randomUUID(),
        type: "price_increase",
        severity: "critical",
        title: "old",
        message: "old",
        transactionId: feeTxn.id,
        status: "open",
        metadata: null,
        createdAt: nowIso(),
      })
      .run();

    runIntelligenceDetectors(ctx.db);

    const rows = ctx.db.select().from(alerts).all();
    expect(rows.find((row) => row.title === "old")?.status).toBe("dismissed");
    const open = rows.filter((row) => row.type === "price_increase" && row.status === "open");
    expect(open).toHaveLength(1);
    expect(open[0]?.title).toBe("עליית מחיר במנוי");
    expect(open[0]?.message).toBe("Streaming Co: עכשיו 46.70 ₪ במקום 27.60 ₪ (עלייה של 69%)");
    expect(open[0]?.message).not.toContain(open[0]!.title);
  });

  it("builds 90-day cashflow forecast from recurring instruments", async () => {
    ctx = await openTestDb();
    const accountId = seedAccount(ctx.db);
    const merchantId = seedMerchant(ctx.db, "חשמל");
    ctx.db
      .insert(recurringInstruments)
      .values({
        id: randomUUID(),
        merchantId,
        accountId,
        cadence: "monthly",
        expectedAmount: 300,
        lastSeen: new Date().toISOString().slice(0, 10),
        status: "active",
        priceHistory: "[]",
        createdAt: nowIso(),
      })
      .run();

    const forecast = forecastCashflow(ctx.db, 90);
    expect(forecast.horizonDays).toBe(90);
    expect(forecast.points.length).toBeGreaterThan(0);
    expect(forecast.totalOutflowIls).toBeGreaterThan(0);
  });

  it("runIntelligenceDetectors orchestrates all detectors", async () => {
    ctx = await openTestDb();
    const result = runIntelligenceDetectors(ctx.db);
    expect(result).toMatchObject({
      budgetAlerts: expect.any(Number),
      subscriptionsDetected: expect.any(Number),
      anomalyAlerts: expect.any(Number),
      duplicateAlerts: expect.any(Number),
    });
  });
});

function dbInsertBudget(db: MoneyTrackDb, categoryId: string, period: string, amount: number): void {
  db.insert(budgets)
    .values({
      id: randomUUID(),
      categoryId,
      period,
      amount,
      createdAt: nowIso(),
    })
    .run();
}

function dbInsertRollup(
  db: MoneyTrackDb,
  period: string,
  categoryId: string,
  totalAmountIls: number,
): void {
  db.insert(rollupMonthly)
    .values({
      period,
      dateBasis: "charge",
      categoryId,
      cardId: null,
      personId: null,
      totalAmountIls,
      transactionCount: 1,
      computedAt: nowIso(),
    })
    .run();
}
