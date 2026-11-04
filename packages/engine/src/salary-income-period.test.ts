/**
 * Income bucketing by reporting period (25–5 window) in rollups and analysis filters.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  accounts,
  eq,
  salarySources,
  transactions,
} from "@moneytrack/db";
import { closeDb, initDb, runMigrations, type MoneyTrackDb } from "@moneytrack/db";
import {
  applySalaryReportingPeriods,
  effectiveIncomePeriod,
  incomeMatchesPeriod,
  queryDashboardKpis,
  queryMonthlySeries,
  selectAnalysisTransactions,
} from "./index.js";

function nowIso(): string {
  return new Date().toISOString();
}

async function openTestDb(): Promise<{ db: MoneyTrackDb; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-salary-period-"));
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

function seedAccount(db: MoneyTrackDb): string {
  const accountId = randomUUID();
  const now = nowIso();
  db.insert(accounts)
    .values({
      id: accountId,
      kind: "bank",
      connectionId: null,
      institutionCode: "test",
      displayName: "Bank",
      numberLast4: "1234",
      currency: "ILS",
      ownerPersonId: null,
      scope: "household",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return accountId;
}

function insertTxn(
  db: MoneyTrackDb,
  fields: {
    accountId: string;
    chargeDate: string;
    amountIls: number;
    kind: "income" | "expense";
    descriptionNormalized?: string;
    reportingPeriod?: string | null;
    reportingPeriodLocked?: boolean;
  },
): string {
  const id = randomUUID();
  const now = nowIso();
  const description = fields.descriptionNormalized ?? "txn";
  const identityHash = createHash("sha256")
    .update(`${fields.accountId}|${fields.chargeDate}|${fields.amountIls}|${description}|${id}`)
    .digest("hex");

  db.insert(transactions)
    .values({
      id,
      firstSeenRawId: null,
      accountId: fields.accountId,
      cardId: null,
      identityHash,
      transactionDate: fields.chargeDate,
      chargeDate: fields.chargeDate,
      status: "posted",
      direction: fields.kind === "income" ? "credit" : "debit",
      amountIls: fields.amountIls,
      originalAmount: fields.amountIls,
      originalCurrency: "ILS",
      fxRate: null,
      fxFeeIls: null,
      descriptionRaw: description,
      descriptionNormalized: description,
      merchantId: null,
      kind: fields.kind,
      purchaseId: null,
      installmentIndex: null,
      installmentTotal: null,
      excludedFromTotals: false,
      exclusionReason: null,
      reportingPeriod: fields.reportingPeriod ?? null,
      reportingPeriodLocked: fields.reportingPeriodLocked ?? false,
      userNote: null,
      categoryId: null,
      classificationSource: null,
      providerCategory: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

describe("effectiveIncomePeriod and incomeMatchesPeriod", () => {
  let db: MoneyTrackDb;
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("maps late-month salary charge to next calendar month", async () => {
    ({ db, cleanup } = await openTestDb());
    const accountId = seedAccount(db);
    insertTxn(db, {
      accountId,
      chargeDate: "2026-09-28",
      amountIls: 18_000,
      kind: "income",
    });

    const txn = db.select().from(transactions).all()[0]!;
    expect(effectiveIncomePeriod(txn)).toBe("2026-10");
    expect(incomeMatchesPeriod(txn, "2026-10")).toBe(true);
    expect(incomeMatchesPeriod(txn, "2026-09")).toBe(false);
  });

  it("respects locked manual reporting_period override", async () => {
    ({ db, cleanup } = await openTestDb());
    const accountId = seedAccount(db);
    insertTxn(db, {
      accountId,
      chargeDate: "2026-09-28",
      amountIls: 18_000,
      kind: "income",
      reportingPeriod: "2026-09",
      reportingPeriodLocked: true,
    });

    const txn = db.select().from(transactions).all()[0]!;
    expect(effectiveIncomePeriod(txn)).toBe("2026-09");
    expect(incomeMatchesPeriod(txn, "2026-09")).toBe(true);
  });
});

describe("queryMonthlySeries income bucketing", () => {
  let db: MoneyTrackDb;
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("buckets income by reporting period while expenses stay on charge month", async () => {
    ({ db, cleanup } = await openTestDb());
    const accountId = seedAccount(db);

    insertTxn(db, {
      accountId,
      chargeDate: "2026-09-28",
      amountIls: 18_000,
      kind: "income",
    });
    insertTxn(db, {
      accountId,
      chargeDate: "2026-09-28",
      amountIls: 200,
      kind: "expense",
    });
    insertTxn(db, {
      accountId,
      chargeDate: "2026-09-20",
      amountIls: 500,
      kind: "income",
    });

    const series = queryMonthlySeries(db, {
      dateBasis: "charge",
      dateFrom: "2026-09-01",
      dateTo: "2026-10-31",
    });

    const september = series.find((row) => row.period === "2026-09");
    const october = series.find((row) => row.period === "2026-10");

    expect(september?.expensesIls).toBe(200);
    expect(september?.incomeIls).toBe(500);
    expect(october?.incomeIls).toBe(18_000);
    expect(october?.expensesIls ?? 0).toBe(0);
  });
});

describe("selectAnalysisTransactions income period filter", () => {
  let db: MoneyTrackDb;
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("includes late-month salary when filtering October only", async () => {
    ({ db, cleanup } = await openTestDb());
    const accountId = seedAccount(db);
    insertTxn(db, {
      accountId,
      chargeDate: "2026-09-28",
      amountIls: 18_000,
      kind: "income",
    });

    const rows = selectAnalysisTransactions(db, {
      dateBasis: "charge",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.chargeDate).toBe("2026-09-28");
  });

  it("excludes late-month salary from September filter", async () => {
    ({ db, cleanup } = await openTestDb());
    const accountId = seedAccount(db);
    insertTxn(db, {
      accountId,
      chargeDate: "2026-09-28",
      amountIls: 18_000,
      kind: "income",
    });

    const rows = selectAnalysisTransactions(db, {
      dateBasis: "charge",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });

    expect(rows).toHaveLength(0);
  });
});

describe("queryDashboardKpis with salary reporting", () => {
  let db: MoneyTrackDb;
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("totals income by effective period for the selected month", async () => {
    ({ db, cleanup } = await openTestDb());
    const accountId = seedAccount(db);
    insertTxn(db, {
      accountId,
      chargeDate: "2026-09-28",
      amountIls: 18_000,
      kind: "income",
    });

    const october = queryDashboardKpis(db, {
      dateBasis: "charge",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    });
    const september = queryDashboardKpis(db, {
      dateBasis: "charge",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });

    expect(october.totalIncomeIls).toBe(18_000);
    expect(september.totalIncomeIls).toBe(0);
  });
});

describe("applySalaryReportingPeriods", () => {
  let db: MoneyTrackDb;
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("persists reporting_period for salary-matched income and skips locked rows", async () => {
    ({ db, cleanup } = await openTestDb());
    const accountId = seedAccount(db);
    const salaryId = randomUUID();
    const now = nowIso();

    db.insert(salarySources)
      .values({
        id: salaryId,
        displayName: "Salary",
        personId: null,
        merchantId: null,
        accountId,
        matchPattern: "payroll",
        sortOrder: 0,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const matchedId = insertTxn(db, {
      accountId,
      chargeDate: "2026-09-28",
      amountIls: 10_000,
      kind: "income",
      descriptionNormalized: "payroll sep",
    });
    const lockedId = insertTxn(db, {
      accountId,
      chargeDate: "2026-09-28",
      amountIls: 8_000,
      kind: "income",
      descriptionNormalized: "payroll locked",
      reportingPeriod: "2026-09",
      reportingPeriodLocked: true,
    });
    insertTxn(db, {
      accountId,
      chargeDate: "2026-09-28",
      amountIls: 300,
      kind: "income",
      descriptionNormalized: "gift",
    });

    const updated = applySalaryReportingPeriods(db);
    expect(updated).toBe(1);

    const matched = db.select().from(transactions).where(eq(transactions.id, matchedId)).get()!;
    const locked = db.select().from(transactions).where(eq(transactions.id, lockedId)).get()!;

    expect(matched.reportingPeriod).toBe("2026-10");
    expect(locked.reportingPeriod).toBe("2026-09");
  });
});
