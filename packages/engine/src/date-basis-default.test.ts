import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  accounts,
  cards,
  eq,
  people,
  rawTransactions,
  scrapeRuns,
  transactions,
} from "@moneytrack/db";
import type { AnalysisFilter } from "@moneytrack/contracts";
import { closeDb, initDb, runMigrations, type MoneyTrackDb } from "@moneytrack/db";
import { isEncryptedSqliteAvailable } from "@moneytrack/db";
import {
  queryDashboardKpis,
  queryInstallmentCashOutflow,
  queryMonthlySeries,
  recomputeRollups,
  queryRollupTotals,
} from "./index.js";
import { processInstallments } from "./installments.js";

// Synthetic data only. Owner decision 2026-11-04: an unspecified date basis means
// "charge" (what was charged in the month); "transaction" stays available on request.

function nowIso(): string {
  return new Date().toISOString();
}

async function openTestDb(): Promise<{ db: MoneyTrackDb; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-date-basis-"));
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

function seedPerson(db: MoneyTrackDb): string {
  const id = randomUUID();
  const now = nowIso();
  db.insert(people)
    .values({ id, displayName: "Test User", isChild: false, createdAt: now, updatedAt: now })
    .run();
  return id;
}

function seedBankAccount(db: MoneyTrackDb, last4 = "4321"): string {
  const id = randomUUID();
  const now = nowIso();
  db.insert(accounts)
    .values({
      id,
      kind: "bank",
      connectionId: null,
      institutionCode: "leumi",
      displayName: `Bank ${last4}`,
      numberLast4: last4,
      currency: "ILS",
      ownerPersonId: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

function seedCardAccount(db: MoneyTrackDb, last4 = "7890"): string {
  const id = randomUUID();
  const now = nowIso();
  db.insert(accounts)
    .values({
      id,
      kind: "credit_card",
      connectionId: null,
      institutionCode: "isracard",
      displayName: `Card ${last4}`,
      numberLast4: last4,
      currency: "ILS",
      ownerPersonId: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

function seedCard(
  db: MoneyTrackDb,
  settlementAccountId: string,
  cardholderPersonId: string,
  last4 = "7890",
): string {
  const id = randomUUID();
  const now = nowIso();
  db.insert(cards)
    .values({
      id,
      settlementAccountId,
      last4,
      cardholderPersonId,
      brand: "visa",
      displayName: `Card ${last4}`,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

function seedRunWithRaw(
  db: MoneyTrackDb,
  txnId: string,
  providerAccountNumber = "7890",
): string {
  const runId = randomUUID();
  const rawId = randomUUID();
  const now = nowIso();
  db.insert(scrapeRuns)
    .values({
      id: runId,
      connectionId: randomUUID(),
      providerCode: "isracard",
      startedAt: now,
      finishedAt: now,
      status: "success",
      errorClass: null,
      errorMessageRedacted: null,
      libraryVersion: "test",
    })
    .run();
  db.insert(rawTransactions)
    .values({
      id: rawId,
      runId,
      providerAccountNumber,
      payloadJson: "{}",
      payloadSha256: createHash("sha256").update(rawId).digest("hex"),
      ingestedAt: now,
    })
    .run();
  db.update(transactions)
    .set({ firstSeenRawId: rawId, updatedAt: now })
    .where(eq(transactions.id, txnId))
    .run();
  return runId;
}

function insertTxn(
  db: MoneyTrackDb,
  fields: Partial<typeof transactions.$inferInsert> & {
    accountId: string;
    transactionDate: string;
    chargeDate: string;
    amountIls: number;
    direction: "debit" | "credit";
    kind: string;
    descriptionRaw: string;
    descriptionNormalized: string;
  },
): string {
  const id = randomUUID();
  const now = nowIso();
  const identityHash = createHash("sha256")
    .update(
      `${fields.accountId}|${fields.transactionDate}|${fields.amountIls}|${fields.descriptionNormalized}|${id}`,
    )
    .digest("hex");

  db.insert(transactions)
    .values({
      id,
      firstSeenRawId: null,
      cardId: fields.cardId ?? null,
      identityHash,
      status: "posted",
      originalAmount: fields.originalAmount ?? fields.amountIls,
      originalCurrency: fields.originalCurrency ?? "ILS",
      fxRate: null,
      fxFeeIls: null,
      merchantId: null,
      purchaseId: null,
      installmentIndex: fields.installmentIndex ?? null,
      installmentTotal: fields.installmentTotal ?? null,
      excludedFromTotals: fields.excludedFromTotals ?? false,
      exclusionReason: fields.exclusionReason ?? null,
      userNote: null,
      createdAt: now,
      updatedAt: now,
      ...fields,
    })
    .run();
  return id;
}


describe.skipIf(!isEncryptedSqliteAvailable())("date basis default", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function seedPurchaseMChargedNextMonth(): Promise<MoneyTrackDb> {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const cardAccountId = seedCardAccount(ctx.db, "1111");
    insertTxn(ctx.db, {
      accountId: cardAccountId,
      transactionDate: "2026-10-20",
      chargeDate: "2026-11-10",
      amountIls: 300,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "SYNTHETIC SHOP",
      descriptionNormalized: "synthetic shop",
    });
    return ctx.db;
  }

  it("counts a purchase in the charge month when no basis is given", async () => {
    const db = await seedPurchaseMChargedNextMonth();
    // The runtime default is applied by the schema; the cast mimics a caller that omits it.
    const october = { dateFrom: "2026-10-01", dateTo: "2026-10-31" } as AnalysisFilter;
    const november = { dateFrom: "2026-11-01", dateTo: "2026-11-30" } as AnalysisFilter;

    expect(queryDashboardKpis(db, october).totalExpensesIls).toBe(0);
    expect(queryDashboardKpis(db, november).totalExpensesIls).toBe(300);
    expect(queryMonthlySeries(db, november)).toEqual([
      { period: "2026-11", expensesIls: 300, incomeIls: 0, netIls: -300 },
    ]);
  });

  it("still honours an explicit transaction basis", async () => {
    const db = await seedPurchaseMChargedNextMonth();
    const october = { dateBasis: "transaction" as const, dateFrom: "2026-10-01", dateTo: "2026-10-31" };
    const november = { dateBasis: "transaction" as const, dateFrom: "2026-11-01", dateTo: "2026-11-30" };

    expect(queryDashboardKpis(db, october).totalExpensesIls).toBe(300);
    expect(queryDashboardKpis(db, november).totalExpensesIls).toBe(0);
  });

  it("rollups default to charge basis and keep both bases", async () => {
    const db = await seedPurchaseMChargedNextMonth();
    recomputeRollups(db, new Set(["2026-10", "2026-11"]));

    expect(queryRollupTotals(db, {} as AnalysisFilter)).toEqual([
      { period: "2026-11", totalAmountIls: 300, transactionCount: 1 },
    ]);
    expect(queryRollupTotals(db, { dateBasis: "transaction" })).toEqual([
      { period: "2026-10", totalAmountIls: 300, transactionCount: 1 },
    ]);
  });

  // Engine definition (kept): processInstallments rewrites every slice's
  // transaction_date to the true purchase date, so on transaction basis each
  // slice carries ITS OWN amount (never the whole purchase at once) but sits in
  // the purchase month; on charge basis it sits in its billing month.
  it("places installment slices by the engine's transaction/charge dates", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const personId = seedPerson(ctx.db);
    const bankId = seedBankAccount(ctx.db);
    const cardAccountId = seedCardAccount(ctx.db, "7890");
    const cardId = seedCard(ctx.db, bankId, personId, "7890");

    // Scraper output for a 3 x 100 purchase made 2026-10-20: date shifts by (k-1) months.
    const slices = [
      { index: 1, date: "2026-10-20", charge: "2026-11-10" },
      { index: 2, date: "2026-11-20", charge: "2026-12-10" },
      { index: 3, date: "2026-12-20", charge: "2027-01-10" },
    ];
    for (const slice of slices) {
      const txnId = insertTxn(ctx.db, {
        accountId: cardAccountId,
        cardId,
        transactionDate: slice.date,
        chargeDate: slice.charge,
        amountIls: 100,
        direction: "debit",
        kind: "expense",
        descriptionRaw: "SYNTHETIC SOFA",
        descriptionNormalized: "synthetic sofa",
        installmentIndex: slice.index,
        installmentTotal: 3,
      });
      processInstallments(ctx.db, seedRunWithRaw(ctx.db, txnId, "7890"));
    }

    const byCharge = queryInstallmentCashOutflow(ctx.db, "charge");
    expect(byCharge.map((row) => [row.period, row.totalAmountIls])).toEqual([
      ["2026-11", 100],
      ["2026-12", 100],
      ["2027-01", 100],
    ]);

    const byTransaction = queryInstallmentCashOutflow(ctx.db, "transaction");
    expect(byTransaction.map((row) => [row.period, row.totalAmountIls])).toEqual([
      ["2026-10", 300],
    ]);
  });
});
