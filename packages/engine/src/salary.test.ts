/**
 * Salary breakdown matching: merchant, pattern, account, person filter, disabled, other bucket.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { accounts, merchants, people, salarySources, transactions } from "@moneytrack/db";
import { closeDb, initDb, runMigrations, type MoneyTrackDb } from "@moneytrack/db";
import { queryBreakdown, SALARY_OTHER_LABEL, selectAnalysisTransactions } from "./index.js";

function nowIso(): string {
  return new Date().toISOString();
}

async function openTestDb(): Promise<{ db: MoneyTrackDb; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-salary-"));
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

function insertIncome(
  db: MoneyTrackDb,
  fields: {
    accountId: string;
    amountIls: number;
    descriptionNormalized: string;
    merchantId?: string | null;
    chargeDate?: string;
  },
): string {
  const id = randomUUID();
  const now = nowIso();
  const chargeDate = fields.chargeDate ?? "2026-09-15";
  const identityHash = createHash("sha256")
    .update(`${fields.accountId}|${chargeDate}|${fields.amountIls}|${fields.descriptionNormalized}|${id}`)
    .digest("hex");

  db.insert(transactions)
    .values({
      id,
      firstSeenRawId: null,
      accountId: fields.accountId,
      cardId: null,
      identityHash,
      transactionDate: chargeDate,
      chargeDate,
      status: "posted",
      direction: "credit",
      amountIls: fields.amountIls,
      originalAmount: fields.amountIls,
      originalCurrency: "ILS",
      fxRate: null,
      fxFeeIls: null,
      descriptionRaw: fields.descriptionNormalized,
      descriptionNormalized: fields.descriptionNormalized,
      merchantId: fields.merchantId ?? null,
      kind: "income",
      purchaseId: null,
      installmentIndex: null,
      installmentTotal: null,
      excludedFromTotals: false,
      exclusionReason: null,
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

describe("queryBreakdown salary dimension", () => {
  let db: MoneyTrackDb;
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("matches income by merchant", async () => {
    ({ db, cleanup } = await openTestDb());
    const now = nowIso();
    const personId = randomUUID();
    const accountId = randomUUID();
    const merchantId = randomUUID();
    const salaryId = randomUUID();

    db.insert(people)
      .values({ id: personId, displayName: "Parent A", isChild: false, createdAt: now, updatedAt: now })
      .run();
    db.insert(accounts)
      .values({
        id: accountId,
        kind: "bank",
        connectionId: null,
        institutionCode: "test",
        displayName: "Bank",
        numberLast4: "1234",
        currency: "ILS",
        ownerPersonId: personId,
        scope: "household",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(merchants)
      .values({ id: merchantId, canonicalName: "Acme Corp", createdAt: now })
      .run();
    db.insert(salarySources)
      .values({
        id: salaryId,
        displayName: "משכורת הורה א",
        personId,
        merchantId,
        accountId: null,
        matchPattern: null,
        sortOrder: 0,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    insertIncome(db, {
      accountId,
      amountIls: 18_000,
      descriptionNormalized: "SALARY ACME CORP",
      merchantId,
    });
    insertIncome(db, {
      accountId,
      amountIls: 500,
      descriptionNormalized: "REFUND",
      merchantId: null,
    });

    const rows = queryBreakdown(
      db,
      { dateBasis: "charge", dateFrom: "2026-09-01", dateTo: "2026-09-30" },
      "salary",
      "income",
    );

    const salaryRow = rows.find((row) => row.categoryId === salaryId);
    const otherRow = rows.find((row) => row.categoryName === SALARY_OTHER_LABEL);
    expect(salaryRow?.amountIls).toBe(18_000);
    expect(otherRow?.amountIls).toBe(500);
  });

  it("matches income by pattern and account", async () => {
    ({ db, cleanup } = await openTestDb());
    const now = nowIso();
    const accountA = randomUUID();
    const accountB = randomUUID();
    const salaryId = randomUUID();

    for (const id of [accountA, accountB]) {
      db.insert(accounts)
        .values({
          id,
          kind: "bank",
          connectionId: null,
          institutionCode: "test",
          displayName: id,
          numberLast4: "1234",
          currency: "ILS",
          ownerPersonId: null,
          scope: "household",
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    db.insert(salarySources)
      .values({
        id: salaryId,
        displayName: "משכורת ב",
        personId: null,
        merchantId: null,
        accountId: accountA,
        matchPattern: "משכורת",
        sortOrder: 0,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    insertIncome(db, { accountId: accountA, amountIls: 9_000, descriptionNormalized: "משכורת ספטמבר" });
    insertIncome(db, { accountId: accountB, amountIls: 9_000, descriptionNormalized: "משכורת ספטמבר" });

    const rows = queryBreakdown(
      db,
      { dateBasis: "charge", dateFrom: "2026-09-01", dateTo: "2026-09-30" },
      "salary",
      "income",
    );

    expect(rows.find((row) => row.categoryId === salaryId)?.amountIls).toBe(9_000);
    expect(rows.find((row) => row.categoryName === SALARY_OTHER_LABEL)?.amountIls).toBe(9_000);
  });

  it("filters salary sources by personIds", async () => {
    ({ db, cleanup } = await openTestDb());
    const now = nowIso();
    const personA = randomUUID();
    const personB = randomUUID();
    const accountId = randomUUID();
    const salaryA = randomUUID();
    const salaryB = randomUUID();

    db.insert(people)
      .values([
        { id: personA, displayName: "A", isChild: false, createdAt: now, updatedAt: now },
        { id: personB, displayName: "B", isChild: false, createdAt: now, updatedAt: now },
      ])
      .run();
    db.insert(accounts)
      .values({
        id: accountId,
        kind: "bank",
        connectionId: null,
        institutionCode: "test",
        displayName: "Bank",
        numberLast4: "1234",
        currency: "ILS",
        ownerPersonId: personA,
        scope: "household",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    for (const [id, personId, name] of [
      [salaryA, personA, "Salary A"],
      [salaryB, personB, "Salary B"],
    ] as const) {
      db.insert(salarySources)
        .values({
          id,
          displayName: name,
          personId,
          merchantId: null,
          accountId,
          matchPattern: name,
          sortOrder: 0,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      insertIncome(db, { accountId, amountIls: 1_000, descriptionNormalized: name });
    }

    const rows = queryBreakdown(
      db,
      {
        dateBasis: "charge",
        dateFrom: "2026-09-01",
        dateTo: "2026-09-30",
        personIds: [personA],
      },
      "salary",
      "income",
    );

    expect(rows.some((row) => row.categoryId === salaryB)).toBe(false);
    expect(rows.find((row) => row.categoryId === salaryA)?.amountIls).toBe(1_000);
    expect(rows.find((row) => row.categoryName === SALARY_OTHER_LABEL)?.amountIls).toBe(1_000);
  });

  it("ignores disabled salary sources", async () => {
    ({ db, cleanup } = await openTestDb());
    const now = nowIso();
    const accountId = randomUUID();
    const salaryId = randomUUID();

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
    db.insert(salarySources)
      .values({
        id: salaryId,
        displayName: "Old salary",
        personId: null,
        merchantId: null,
        accountId,
        matchPattern: "pay",
        sortOrder: 0,
        enabled: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    insertIncome(db, { accountId, amountIls: 7_000, descriptionNormalized: "payroll" });

    const rows = queryBreakdown(
      db,
      { dateBasis: "charge", dateFrom: "2026-09-01", dateTo: "2026-09-30" },
      "salary",
      "income",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.categoryName).toBe(SALARY_OTHER_LABEL);
    expect(rows[0]?.amountIls).toBe(7_000);
  });
});

describe("selectAnalysisTransactions salaryScope", () => {
  let db: MoneyTrackDb;
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns only income matched to a salary source id", async () => {
    ({ db, cleanup } = await openTestDb());
    const now = nowIso();
    const accountId = randomUUID();
    const salaryId = randomUUID();
    const matchedTxnId = randomUUID();
    const otherIncomeId = randomUUID();
    const expenseId = randomUUID();

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

    for (const [id, kind, description, amount] of [
      [matchedTxnId, "income", "payroll sep", 10_000],
      [otherIncomeId, "income", "gift", 200],
      [expenseId, "expense", "groceries", 50],
    ] as const) {
      const chargeDate = "2026-09-15";
      db.insert(transactions)
        .values({
          id,
          firstSeenRawId: null,
          accountId,
          cardId: null,
          identityHash: createHash("sha256").update(id).digest("hex"),
          transactionDate: chargeDate,
          chargeDate,
          status: "posted",
          direction: kind === "income" ? "credit" : "debit",
          amountIls: amount,
          originalAmount: amount,
          originalCurrency: "ILS",
          fxRate: null,
          fxFeeIls: null,
          descriptionRaw: description,
          descriptionNormalized: description,
          merchantId: null,
          kind,
          purchaseId: null,
          installmentIndex: null,
          installmentTotal: null,
          excludedFromTotals: false,
          exclusionReason: null,
          userNote: null,
          categoryId: null,
          classificationSource: null,
          providerCategory: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    const rows = selectAnalysisTransactions(db, {
      dateBasis: "charge",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      salaryScope: salaryId,
    });

    expect(rows.map((row) => row.id)).toEqual([matchedTxnId]);
  });

  it("returns only unmatched income for salaryScope other", async () => {
    ({ db, cleanup } = await openTestDb());
    const now = nowIso();
    const accountId = randomUUID();
    const salaryId = randomUUID();

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

    const matchedId = insertIncome(db, {
      accountId,
      amountIls: 10_000,
      descriptionNormalized: "payroll sep",
    });
    const otherId = insertIncome(db, {
      accountId,
      amountIls: 300,
      descriptionNormalized: "refund",
    });

    const rows = selectAnalysisTransactions(db, {
      dateBasis: "charge",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      salaryScope: "other",
    });

    expect(rows.map((row) => row.id)).toEqual([otherId]);
    expect(rows.some((row) => row.id === matchedId)).toBe(false);
  });

  it("excludes non-income rows even when salaryScope is set", async () => {
    ({ db, cleanup } = await openTestDb());
    const now = nowIso();
    const accountId = randomUUID();
    const salaryId = randomUUID();

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

    insertIncome(db, { accountId, amountIls: 10_000, descriptionNormalized: "payroll sep" });
    const expenseId = randomUUID();
    const chargeDate = "2026-09-15";
    db.insert(transactions)
      .values({
        id: expenseId,
        firstSeenRawId: null,
        accountId,
        cardId: null,
        identityHash: createHash("sha256").update(expenseId).digest("hex"),
        transactionDate: chargeDate,
        chargeDate,
        status: "posted",
        direction: "debit",
        amountIls: 80,
        originalAmount: 80,
        originalCurrency: "ILS",
        fxRate: null,
        fxFeeIls: null,
        descriptionRaw: "payroll sep",
        descriptionNormalized: "payroll sep",
        merchantId: null,
        kind: "expense",
        purchaseId: null,
        installmentIndex: null,
        installmentTotal: null,
        excludedFromTotals: false,
        exclusionReason: null,
        userNote: null,
        categoryId: null,
        classificationSource: null,
        providerCategory: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const bySource = selectAnalysisTransactions(db, {
      dateBasis: "charge",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      salaryScope: salaryId,
    });
    const byOther = selectAnalysisTransactions(db, {
      dateBasis: "charge",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      salaryScope: "other",
    });

    expect(bySource.every((row) => row.kind === "income")).toBe(true);
    expect(byOther.every((row) => row.kind === "income")).toBe(true);
    expect(bySource.some((row) => row.id === expenseId)).toBe(false);
    expect(byOther.some((row) => row.id === expenseId)).toBe(false);
  });
});
