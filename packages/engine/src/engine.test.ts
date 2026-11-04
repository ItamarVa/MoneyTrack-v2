import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  accounts,
  alerts,
  cards,
  categories,
  eq,
  merchants,
  people,
  purchases,
  rawTransactions,
  rollupMonthly,
  scrapeRuns,
  transactionLinks,
  transactions,
} from "@moneytrack/db";
import { closeDb, initDb, runMigrations, type MoneyTrackDb } from "@moneytrack/db";
import { isEncryptedSqliteAvailable } from "@moneytrack/db";
import {
  amountsMatch,
  expenseContribution,
  incomeContribution,
  lookupStoredFxRate,
  manualLinkTransactions,
  processInternalTransfers,
  processRefunds,
  processSettlementMatching,
  queryDashboardKpis,
  queryBreakdown,
  queryInstallmentCashOutflow,
  queryPurchaseTotalsByPurchaseDate,
  queryRollupTotals,
  reverseInstallmentDateShift,
  recomputeRollups,
  runEnginePostProcess,
  seedFxObservation,
} from "./index.js";
import { selectAnalysisTransactions } from "./analysis-filter.js";
import { processInstallments } from "./installments.js";


function nowIso(): string {
  return new Date().toISOString();
}

async function openTestDb(): Promise<{ db: MoneyTrackDb; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-engine-"));
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

describe.skipIf(!isEncryptedSqliteAvailable())("financial engine", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("reverses installment date shift", () => {
    expect(reverseInstallmentDateShift("2026-02-10", 2)).toBe("2026-01-10");
    expect(reverseInstallmentDateShift("2026-02-10", 1)).toBe("2026-02-10");
  });

  it("amountsMatch tolerance property", () => {
    for (let i = 0; i < 50; i += 1) {
      const base = 100 + Math.random() * 500;
      const delta = Math.random() * 2;
      expect(amountsMatch(base, base + delta)).toBe(true);
      expect(amountsMatch(base, base + 10)).toBe(false);
    }
  });

  it("reconstructs purchases and links installment children", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const personId = seedPerson(ctx.db);
    const bankId = seedBankAccount(ctx.db);
    const cardAccountId = seedCardAccount(ctx.db, "7890");
    const cardId = seedCard(ctx.db, bankId, personId, "7890");

    const txnId = insertTxn(ctx.db, {
      accountId: cardAccountId,
      cardId,
      transactionDate: "2026-02-10",
      chargeDate: "2026-02-10",
      amountIls: 250,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "KSP ELECTRONICS",
      descriptionNormalized: "ksp electronics",
      installmentIndex: 2,
      installmentTotal: 6,
    });

    const runId = seedRunWithRaw(ctx.db, txnId, "7890");
    processInstallments(ctx.db, runId);

    const txn = ctx.db.select().from(transactions).where(eq(transactions.id, txnId)).get()!;
    expect(txn.purchaseId).not.toBeNull();
    expect(txn.transactionDate).toBe("2026-01-10");

    const purchase = ctx.db.select().from(purchases).get()!;
    expect(purchase.originalTotalAmount).toBe(1500);
    expect(purchase.installmentTotal).toBe(6);

    const cashOutflow = queryInstallmentCashOutflow(ctx.db, "charge", "2026-02-01", "2026-02-28");
    expect(cashOutflow[0]?.totalAmountIls).toBe(250);

    const purchaseTotals = queryPurchaseTotalsByPurchaseDate(ctx.db, "2026-01-01", "2026-01-31");
    expect(purchaseTotals[0]?.totalAmountIls).toBe(1500);
  });

  it("matches card settlement to card charges", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const personId = seedPerson(ctx.db);
    const bankId = seedBankAccount(ctx.db, "4321");
    const cardAccountId = seedCardAccount(ctx.db, "7890");
    const cardId = seedCard(ctx.db, bankId, personId, "7890");

    insertTxn(ctx.db, {
      accountId: cardAccountId,
      cardId,
      transactionDate: "2026-02-05",
      chargeDate: "2026-02-05",
      amountIls: 120,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "WOLT",
      descriptionNormalized: "wolt",
    });
    insertTxn(ctx.db, {
      accountId: cardAccountId,
      cardId,
      transactionDate: "2026-02-08",
      chargeDate: "2026-02-08",
      amountIls: 80,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "SUPER",
      descriptionNormalized: "super",
    });

    const settlementId = insertTxn(ctx.db, {
      accountId: bankId,
      transactionDate: "2026-02-15",
      chargeDate: "2026-02-15",
      amountIls: 200,
      direction: "debit",
      kind: "card_settlement",
      descriptionRaw: "ישראכרט חיוב 7890",
      descriptionNormalized: "ישראכרט חיוב 7890",
    });

    const dirty = new Set<string>();
    const matched = processSettlementMatching(ctx.db, dirty);
    expect(matched).toBe(1);

    const settlement = ctx.db.select().from(transactions).where(eq(transactions.id, settlementId)).get()!;
    expect(settlement.excludedFromTotals).toBe(true);

    const links = ctx.db.select().from(transactionLinks).all();
    expect(links.length).toBe(2);
    expect(links.every((row) => row.linkType === "card_settlement")).toBe(true);
  });

  it("creates alert for unmatched settlement", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const bankId = seedBankAccount(ctx.db);
    // The issuer must be connected for a match to be expected at all; the
    // missing piece here is the card row, so the settlement stays unmatched.
    seedCardAccount(ctx.db, "7890");

    insertTxn(ctx.db, {
      accountId: bankId,
      transactionDate: "2026-02-15",
      chargeDate: "2026-02-15",
      amountIls: 999,
      direction: "debit",
      kind: "card_settlement",
      descriptionRaw: "ישראכרט חיוב",
      descriptionNormalized: "ישראכרט חיוב",
    });

    processSettlementMatching(ctx.db, new Set());
    const openAlerts = ctx.db.select().from(alerts).all();
    expect(openAlerts.some((row) => row.type === "unmatched_settlement")).toBe(true);
  });

  it("nets internal transfers across accounts", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const bankA = seedBankAccount(ctx.db, "1111");
    const bankB = seedBankAccount(ctx.db, "2222");

    insertTxn(ctx.db, {
      accountId: bankA,
      transactionDate: "2026-03-01",
      chargeDate: "2026-03-01",
      amountIls: 500,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "Transfer out",
      descriptionNormalized: "transfer out",
    });
    insertTxn(ctx.db, {
      accountId: bankB,
      transactionDate: "2026-03-02",
      chargeDate: "2026-03-02",
      amountIls: 500,
      direction: "credit",
      kind: "income",
      descriptionRaw: "Transfer in",
      descriptionNormalized: "transfer in",
    });

    const dirty = new Set<string>();
    const linked = processInternalTransfers(ctx.db, dirty);
    expect(linked).toBe(1);

    const rows = ctx.db.select().from(transactions).all();
    expect(rows.every((row) => row.excludedFromTotals)).toBe(true);
  });

  it("offsets refunds against expenses, not income", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const bankId = seedBankAccount(ctx.db);

    insertTxn(ctx.db, {
      accountId: bankId,
      transactionDate: "2026-04-01",
      chargeDate: "2026-04-01",
      amountIls: 75,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "AMAZON",
      descriptionNormalized: "amazon",
    });
    const refundId = insertTxn(ctx.db, {
      accountId: bankId,
      transactionDate: "2026-04-10",
      chargeDate: "2026-04-10",
      amountIls: 75,
      direction: "credit",
      kind: "income",
      descriptionRaw: "AMAZON REFUND",
      descriptionNormalized: "amazon",
    });

    processRefunds(ctx.db, new Set());

    const refund = ctx.db.select().from(transactions).where(eq(transactions.id, refundId)).get()!;
    expect(refund.kind).toBe("refund");
    expect(expenseContribution(refund)).toBe(-75);
    expect(incomeContribution(refund)).toBe(0);
  });

  it("marks unmatched card credits as refund for review", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const cardAccountId = seedCardAccount(ctx.db);

    const creditId = insertTxn(ctx.db, {
      accountId: cardAccountId,
      transactionDate: "2026-05-01",
      chargeDate: "2026-05-01",
      amountIls: 42,
      direction: "credit",
      kind: "income",
      descriptionRaw: "MYSTERY CREDIT",
      descriptionNormalized: "mystery credit",
    });

    processRefunds(ctx.db, new Set());
    const credit = ctx.db.select().from(transactions).where(eq(transactions.id, creditId)).get()!;
    expect(credit.kind).toBe("refund");
  });

  it("leaves an unmatched bank credit as income", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const bankId = seedBankAccount(ctx.db);

    const creditId = insertTxn(ctx.db, {
      accountId: bankId,
      transactionDate: "2026-05-01",
      chargeDate: "2026-05-01",
      amountIls: 12_000,
      direction: "credit",
      kind: "income",
      descriptionRaw: "SALARY",
      descriptionNormalized: "salary",
    });

    processRefunds(ctx.db, new Set());
    const credit = ctx.db.select().from(transactions).where(eq(transactions.id, creditId)).get()!;
    expect(credit.kind).toBe("income");
  });

  it("stores FX rate and fee separation", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const bankId = seedBankAccount(ctx.db);
    seedFxObservation(ctx.db, "USD", "2026-06-01", 3.5);

    const rate = lookupStoredFxRate(ctx.db, "USD", "2026-06-01");
    expect(rate).toBe(3.5);

    const txnId = insertTxn(ctx.db, {
      accountId: bankId,
      transactionDate: "2026-06-01",
      chargeDate: "2026-06-01",
      amountIls: 360,
      originalAmount: 100,
      originalCurrency: "USD",
      direction: "debit",
      kind: "expense",
      descriptionRaw: "AWS",
      descriptionNormalized: "aws",
    });

    const txn = ctx.db.select().from(transactions).where(eq(transactions.id, txnId)).get()!;
    const { applyFxToTransaction } = await import("./fx.js");
    await applyFxToTransaction(ctx.db, txn);

    const updated = ctx.db.select().from(transactions).where(eq(transactions.id, txnId)).get()!;
    expect(updated.fxRate).toBe(3.5);
    expect(updated.fxFeeIls).toBe(10);
  });

  it("recomputes rollup_monthly for both date bases", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const bankId = seedBankAccount(ctx.db);

    insertTxn(ctx.db, {
      accountId: bankId,
      transactionDate: "2026-07-10",
      chargeDate: "2026-07-15",
      amountIls: 100,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "GROCERY",
      descriptionNormalized: "grocery",
    });
    insertTxn(ctx.db, {
      accountId: bankId,
      transactionDate: "2026-07-20",
      chargeDate: "2026-07-20",
      amountIls: 50,
      direction: "credit",
      kind: "income",
      descriptionRaw: "SALARY",
      descriptionNormalized: "salary",
    });

    const dirty = new Set<string>(["2026-07"]);
    recomputeRollups(ctx.db, dirty);

    const rollups = ctx.db.select().from(rollupMonthly).all();
    const transactionBasis = rollups.filter((row) => row.dateBasis === "transaction");
    const chargeBasis = rollups.filter((row) => row.dateBasis === "charge");
    expect(transactionBasis.length).toBeGreaterThan(0);
    expect(chargeBasis.length).toBeGreaterThan(0);

    const kpis = queryDashboardKpis(ctx.db, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      dateBasis: "transaction",
    });
    expect(kpis.totalExpensesIls).toBe(100);
    expect(kpis.totalIncomeIls).toBe(50);
    expect(kpis.netCashFlowIls).toBe(-50);

    const trend = queryRollupTotals(ctx.db, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      dateBasis: "transaction",
    });
    expect(trend[0]?.totalAmountIls).toBe(50);
  });

  it("recomputeRollups rebuilds only dirty periods on category change", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const bankId = seedBankAccount(ctx.db);
    const categoryFood = randomUUID();
    const categoryTransport = randomUUID();
    const now = nowIso();
    ctx.db
      .insert(categories)
      .values({
        id: categoryFood,
        name: "Food",
        parentId: null,
        sortOrder: 0,
        note: null,
        createdAt: now,
      })
      .run();
    ctx.db
      .insert(categories)
      .values({
        id: categoryTransport,
        name: "Transport",
        parentId: null,
        sortOrder: 1,
        note: null,
        createdAt: now,
      })
      .run();

    const julyTxnId = insertTxn(ctx.db, {
      accountId: bankId,
      categoryId: categoryFood,
      transactionDate: "2026-07-10",
      chargeDate: "2026-07-10",
      amountIls: 100,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "JULY GROCERY",
      descriptionNormalized: "july grocery",
    });
    insertTxn(ctx.db, {
      accountId: bankId,
      categoryId: categoryFood,
      transactionDate: "2026-08-05",
      chargeDate: "2026-08-05",
      amountIls: 200,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "AUGUST GROCERY",
      descriptionNormalized: "august grocery",
    });

    recomputeRollups(ctx.db, new Set(["2026-07", "2026-08"]));

    const rollupSnapshot = (period: string) =>
      ctx.db
        .select()
        .from(rollupMonthly)
        .all()
        .filter((row) => row.period === period)
        .map(({ computedAt: _computedAt, ...row }) => row);

    const augustBefore = rollupSnapshot("2026-08");
    expect(augustBefore.length).toBeGreaterThan(0);

    ctx.db
      .update(transactions)
      .set({ categoryId: categoryTransport, updatedAt: nowIso() })
      .where(eq(transactions.id, julyTxnId))
      .run();

    recomputeRollups(ctx.db, new Set(["2026-07"]));

    expect(rollupSnapshot("2026-08")).toEqual(augustBefore);

    const julyRows = rollupSnapshot("2026-07").filter((row) => row.dateBasis === "transaction");
    expect(
      julyRows.some((row) => row.categoryId === categoryTransport && row.totalAmountIls === 100),
    ).toBe(true);
    expect(julyRows.some((row) => row.categoryId === categoryFood && row.totalAmountIls === 100)).toBe(
      false,
    );
  });

  it("queryBreakdown category expense uses transaction scan, not rollup net", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const bankId = seedBankAccount(ctx.db);
    const categoryId = randomUUID();
    const now = nowIso();
    ctx.db
      .insert(categories)
      .values({
        id: categoryId,
        name: "Food",
        parentId: null,
        sortOrder: 0,
        note: null,
        createdAt: now,
      })
      .run();

    insertTxn(ctx.db, {
      accountId: bankId,
      transactionDate: "2026-07-10",
      chargeDate: "2026-07-10",
      amountIls: 120,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "SHUFERSAL",
      descriptionNormalized: "shufersal",
      categoryId,
    });

    recomputeRollups(ctx.db, new Set(["2026-07"]));

    const rows = queryBreakdown(
      ctx.db,
      {
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        dateBasis: "transaction",
      },
      "category",
    );

    expect(rows.some((row) => row.categoryId === categoryId && row.amountIls === 120)).toBe(true);
  });

  it("queryBreakdown expense totals match across category and merchant dimensions", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const bankId = seedBankAccount(ctx.db);
    const categoryId = randomUUID();
    const merchantId = randomUUID();
    const now = nowIso();
    ctx.db
      .insert(categories)
      .values({
        id: categoryId,
        name: "Mixed",
        parentId: null,
        sortOrder: 0,
        note: null,
        createdAt: now,
      })
      .run();
    ctx.db
      .insert(merchants)
      .values({ id: merchantId, canonicalName: "Shop", createdAt: now })
      .run();

    insertTxn(ctx.db, {
      accountId: bankId,
      merchantId,
      categoryId,
      transactionDate: "2026-07-10",
      chargeDate: "2026-07-10",
      amountIls: 500,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "SHOP",
      descriptionNormalized: "shop",
    });
    insertTxn(ctx.db, {
      accountId: bankId,
      categoryId,
      transactionDate: "2026-07-15",
      chargeDate: "2026-07-15",
      amountIls: 200,
      direction: "credit",
      kind: "income",
      descriptionRaw: "REIMBURSE",
      descriptionNormalized: "reimburse",
    });

    recomputeRollups(ctx.db, new Set(["2026-07"]));

    const filter = {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      dateBasis: "transaction" as const,
    };
    const categoryRows = queryBreakdown(ctx.db, filter, "category", "expense");
    const merchantRows = queryBreakdown(ctx.db, filter, "merchant", "expense");
    const kpis = queryDashboardKpis(ctx.db, filter);
    const sumRows = (rows: typeof categoryRows) =>
      rows.reduce((sum, row) => sum + row.amountIls, 0);

    expect(sumRows(categoryRows)).toBe(500);
    expect(sumRows(merchantRows)).toBe(500);
    expect(kpis.totalExpensesIls).toBe(500);

    const rollupNet = ctx.db
      .select()
      .from(rollupMonthly)
      .all()
      .filter((row) => row.categoryId === categoryId && row.dateBasis === "transaction")
      .reduce((sum, row) => sum + Math.max(row.totalAmountIls, 0), 0);
    expect(rollupNet).toBe(300);
    expect(sumRows(categoryRows)).not.toBe(rollupNet);
  });

  it("queryBreakdown income flow scans transactions instead of rollup fast path", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const bankId = seedBankAccount(ctx.db);
    const categoryId = randomUUID();
    const now = nowIso();
    ctx.db
      .insert(categories)
      .values({
        id: categoryId,
        name: "Salary",
        parentId: null,
        sortOrder: 0,
        note: null,
        createdAt: now,
      })
      .run();

    insertTxn(ctx.db, {
      accountId: bankId,
      transactionDate: "2026-07-10",
      chargeDate: "2026-07-10",
      amountIls: 120,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "SHUFERSAL",
      descriptionNormalized: "shufersal",
      categoryId,
    });
    insertTxn(ctx.db, {
      accountId: bankId,
      transactionDate: "2026-07-15",
      chargeDate: "2026-07-15",
      amountIls: 8_000,
      direction: "credit",
      kind: "income",
      descriptionRaw: "SALARY",
      descriptionNormalized: "salary",
      categoryId,
    });

    recomputeRollups(ctx.db, new Set(["2026-07"]));

    const rows = queryBreakdown(
      ctx.db,
      {
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        dateBasis: "transaction",
      },
      "category",
      "income",
    );

    expect(rows.some((row) => row.categoryId === categoryId && row.amountIls === 8_000)).toBe(true);
    expect(rows.some((row) => row.amountIls === 120)).toBe(false);
  });

  it("queryBreakdown person dimension falls back to account owner for bank income", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const personId = seedPerson(ctx.db);
    const bankId = randomUUID();
    const now = nowIso();
    ctx.db
      .insert(accounts)
      .values({
        id: bankId,
        kind: "bank",
        connectionId: null,
        institutionCode: "leumi",
        displayName: "Salary account",
        numberLast4: "1111",
        currency: "ILS",
        ownerPersonId: personId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    insertTxn(ctx.db, {
      accountId: bankId,
      transactionDate: "2026-08-05",
      chargeDate: "2026-08-05",
      amountIls: 12_000,
      direction: "credit",
      kind: "income",
      descriptionRaw: "PAYROLL",
      descriptionNormalized: "payroll",
    });

    const rows = queryBreakdown(
      ctx.db,
      {
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
        dateBasis: "transaction",
      },
      "person",
      "income",
    );

    expect(rows.some((row) => row.categoryId === personId && row.amountIls === 12_000)).toBe(true);
  });

  it("selectAnalysisTransactions filters by accountIds and personIds via account owner", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const personA = seedPerson(ctx.db);
    const personB = seedPerson(ctx.db);
    const bankA = randomUUID();
    const bankB = seedBankAccount(ctx.db, "5555");
    const now = nowIso();
    ctx.db
      .insert(accounts)
      .values({
        id: bankA,
        kind: "bank",
        connectionId: null,
        institutionCode: "leumi",
        displayName: "Owned account",
        numberLast4: "6666",
        currency: "ILS",
        ownerPersonId: personA,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const cardAccountId = seedCardAccount(ctx.db, "7777");
    const cardId = seedCard(ctx.db, bankB, personB, "7777");

    const ownedTxnId = insertTxn(ctx.db, {
      accountId: bankA,
      transactionDate: "2026-09-01",
      chargeDate: "2026-09-01",
      amountIls: 100,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "OWNED",
      descriptionNormalized: "owned",
    });
    const cardTxnId = insertTxn(ctx.db, {
      accountId: cardAccountId,
      cardId,
      transactionDate: "2026-09-02",
      chargeDate: "2026-09-02",
      amountIls: 50,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "CARD",
      descriptionNormalized: "card",
    });
    insertTxn(ctx.db, {
      accountId: bankB,
      transactionDate: "2026-09-03",
      chargeDate: "2026-09-03",
      amountIls: 25,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "OTHER",
      descriptionNormalized: "other",
    });

    const monthFilter = {
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      dateBasis: "transaction" as const,
    };

    const byAccount = selectAnalysisTransactions(ctx.db, {
      ...monthFilter,
      accountIds: [bankA],
    });
    expect(byAccount.map((row) => row.id)).toEqual([ownedTxnId]);

    const byPersonA = selectAnalysisTransactions(ctx.db, {
      ...monthFilter,
      personIds: [personA],
    });
    expect(byPersonA.map((row) => row.id)).toEqual([ownedTxnId]);

    const byPersonB = selectAnalysisTransactions(ctx.db, {
      ...monthFilter,
      personIds: [personB],
    });
    expect(byPersonB.map((row) => row.id)).toEqual([cardTxnId]);
  });

  it("supports manual transaction links", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const bankA = seedBankAccount(ctx.db, "3333");
    const bankB = seedBankAccount(ctx.db, "4444");

    const debitId = insertTxn(ctx.db, {
      accountId: bankA,
      transactionDate: "2026-08-01",
      chargeDate: "2026-08-01",
      amountIls: 300,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "Manual debit",
      descriptionNormalized: "manual debit",
    });
    const creditId = insertTxn(ctx.db, {
      accountId: bankB,
      transactionDate: "2026-08-01",
      chargeDate: "2026-08-01",
      amountIls: 300,
      direction: "credit",
      kind: "income",
      descriptionRaw: "Manual credit",
      descriptionNormalized: "manual credit",
    });

    const linkId = manualLinkTransactions(ctx.db, debitId, creditId, "internal_transfer");
    expect(linkId).not.toBe("");

    const debit = ctx.db.select().from(transactions).where(eq(transactions.id, debitId)).get()!;
    const credit = ctx.db.select().from(transactions).where(eq(transactions.id, creditId)).get()!;
    expect(debit.excludedFromTotals).toBe(true);
    expect(credit.excludedFromTotals).toBe(true);
  });

  it("runEnginePostProcess orchestrates ingest hook", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const personId = seedPerson(ctx.db);
    const bankId = seedBankAccount(ctx.db);
    const cardAccountId = seedCardAccount(ctx.db, "7890");
    const cardId = seedCard(ctx.db, bankId, personId, "7890");

    const txnId = insertTxn(ctx.db, {
      accountId: cardAccountId,
      cardId,
      transactionDate: "2026-02-10",
      chargeDate: "2026-02-10",
      amountIls: 100,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "COFFEE",
      descriptionNormalized: "coffee",
      installmentIndex: 2,
      installmentTotal: 3,
    });

    const runId = seedRunWithRaw(ctx.db, txnId, "7890");
    const result = await runEnginePostProcess(ctx.db, { runId });
    expect(result.dirtyPeriods.length).toBeGreaterThan(0);
    expect(ctx.db.select().from(purchases).all().length).toBe(1);
  });
});
