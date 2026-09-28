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
    categoryId?: string;
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

  it("flags duplicate charges on the same day", async () => {
    ctx = await openTestDb();
    const accountId = seedAccount(ctx.db);
    const merchantId = seedMerchant(ctx.db, "סופר");
    seedExpense(ctx.db, { accountId, merchantId, amount: 120, date: "2026-01-10" });
    seedExpense(ctx.db, { accountId, merchantId, amount: 120, date: "2026-01-10" });

    const created = detectDuplicates(ctx.db);
    expect(created).toBe(1);
  });

  it("flags anomalous merchant amounts via MAD", async () => {
    ctx = await openTestDb();
    const accountId = seedAccount(ctx.db);
    const merchantId = seedMerchant(ctx.db, "קפה");
    const baseDates = ["2025-08-01", "2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01"];
    for (const date of baseDates) {
      seedExpense(ctx.db, { accountId, merchantId, amount: 20, date });
    }
    seedExpense(ctx.db, { accountId, merchantId, amount: 200, date: "2026-01-01" });

    const created = detectAnomalies(ctx.db);
    expect(created).toBe(1);
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
      dateBasis: "transaction",
      categoryId,
      cardId: null,
      personId: null,
      totalAmountIls,
      transactionCount: 1,
      computedAt: nowIso(),
    })
    .run();
}
