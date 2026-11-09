import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  accounts,
  closeDb,
  initDb,
  isEncryptedSqliteAvailable,
  loans,
  runMigrations,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { computeNetWorth, computeNetWorthCompleteness, queryDetectedLoanPayments } from "./index.js";

// Synthetic data only.
const NOW = "2026-11-04T08:00:00.000Z";
const AS_OF = "2026-11-04";

describe.skipIf(!isEncryptedSqliteAvailable())("net worth: card debt and completeness", () => {
  let tmpDir: string;
  let db: MoneyTrackDb;

  function addAccount(kind: string, balanceIls: number | null, scope = "household"): string {
    const id = randomUUID();
    db.insert(accounts)
      .values({
        id,
        kind,
        institutionCode: "manual",
        displayName: `${kind} ${id.slice(0, 4)}`,
        currency: "ILS",
        scope,
        balanceIls,
        balanceDate: balanceIls === null ? null : "2026-11-01",
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
    return id;
  }

  function addLoanPayment(accountId: string, date: string, amountIls: number, description: string): void {
    const id = randomUUID();
    db.insert(transactions)
      .values({
        id,
        accountId,
        identityHash: id,
        transactionDate: date,
        chargeDate: date,
        status: "completed",
        direction: "debit",
        amountIls,
        originalAmount: amountIls,
        originalCurrency: "ILS",
        descriptionRaw: description,
        descriptionNormalized: description,
        kind: "loan_payment",
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  }

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-nw-card-"));
    closeDb();
    db = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("counts a negative card balance as a liability, not a negative asset", () => {
    addAccount("bank", 11_000);
    addAccount("credit_card", -13_000);
    addAccount("bank", 99_000, "business");

    const result = computeNetWorth(db, AS_OF);
    expect(result.totalAssetsIls).toBe(11_000);
    expect(result.cardDebtIls).toBe(13_000);
    expect(result.totalLiabilitiesIls).toBe(13_000);
    expect(result.netWorthIls).toBe(-2_000);
  });

  it("flags a partial picture when loan debits exist without loans and no savings exist", () => {
    const bank = addAccount("bank", 1_000);
    addLoanPayment(bank, "2026-10-10", -4_000, "Lender A");

    expect(computeNetWorthCompleteness(db, AS_OF)).toEqual({
      partial: true,
      reasons: ["no_loans", "no_savings"],
    });
  });

  it("is complete once a loan and a savings account exist", () => {
    const bank = addAccount("bank", 1_000);
    addAccount("savings", 5_000);
    addLoanPayment(bank, "2026-10-10", -4_000, "Lender A");
    db.insert(loans)
      .values({
        id: randomUUID(),
        accountId: addAccount("loan", null),
        kind: "mortgage",
        lender: "Lender A",
        originationDate: "2020-01-01",
        originalPrincipal: 500_000,
        createdAt: NOW,
      })
      .run();

    expect(computeNetWorthCompleteness(db, AS_OF)).toEqual({ partial: false, reasons: [] });
  });

  it("detects the monthly loan payment from stored rows, household only", () => {
    const bank = addAccount("bank", 1_000);
    const business = addAccount("bank", 1_000, "business");
    for (const date of ["2026-08-10", "2026-09-10", "2026-10-10"]) {
      addLoanPayment(bank, date, -4_000, "Lender A");
      addLoanPayment(business, date, -7_000, "Business Lender");
    }

    const detected = queryDetectedLoanPayments(db, AS_OF);
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({ merchant: "Lender A", monthlyAmountIls: 4_000, months: 3 });
  });
});
