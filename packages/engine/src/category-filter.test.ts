import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { accounts, transactions } from "@moneytrack/db";
import { closeDb, initDb, isEncryptedSqliteAvailable, runMigrations, type MoneyTrackDb } from "@moneytrack/db";
import { selectAnalysisTransactions } from "./analysis-filter.js";
import { UNCATEGORIZED_CATEGORY_ID } from "./labels.js";

async function openTestDb(): Promise<{ db: MoneyTrackDb; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-category-filter-"));
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

function insertTxn(
  db: MoneyTrackDb,
  fields: {
    accountId: string;
    categoryId?: string | null;
    transactionDate: string;
    chargeDate: string;
    amountIls: number;
    descriptionNormalized: string;
  },
): void {
  const id = randomUUID();
  const now = new Date().toISOString();
  const identityHash = createHash("sha256")
    .update(`${fields.accountId}|${fields.transactionDate}|${fields.amountIls}|${fields.descriptionNormalized}|${id}`)
    .digest("hex");

  db.insert(transactions)
    .values({
      id,
      firstSeenRawId: null,
      accountId: fields.accountId,
      cardId: null,
      categoryId: fields.categoryId ?? null,
      identityHash,
      status: "posted",
      transactionDate: fields.transactionDate,
      chargeDate: fields.chargeDate,
      amountIls: fields.amountIls,
      originalAmount: fields.amountIls,
      originalCurrency: "ILS",
      fxRate: null,
      fxFeeIls: null,
      direction: "debit",
      kind: "expense",
      descriptionRaw: fields.descriptionNormalized,
      descriptionNormalized: fields.descriptionNormalized,
      merchantId: null,
      purchaseId: null,
      installmentIndex: null,
      installmentTotal: null,
      excludedFromTotals: false,
      exclusionReason: null,
      userNote: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

describe.skipIf(!isEncryptedSqliteAvailable())("categoryIdsMatchCondition via selectAnalysisTransactions", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("returns null and explicit uncategorized rows only", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;

    const accountId = randomUUID();
    const now = new Date().toISOString();
    ctx.db
      .insert(accounts)
      .values({
        id: accountId,
        kind: "bank",
        connectionId: null,
        institutionCode: "leumi",
        displayName: "Household",
        numberLast4: "1111",
        currency: "ILS",
        scope: "household",
        ownerPersonId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    insertTxn(ctx.db, {
      accountId,
      categoryId: null,
      transactionDate: "2026-06-10",
      chargeDate: "2026-06-10",
      amountIls: 5000,
      descriptionNormalized: "investment transfer",
    });
    insertTxn(ctx.db, {
      accountId,
      categoryId: UNCATEGORIZED_CATEGORY_ID,
      transactionDate: "2026-06-11",
      chargeDate: "2026-06-11",
      amountIls: 20,
      descriptionNormalized: "atm fee",
    });
    insertTxn(ctx.db, {
      accountId,
      categoryId: "00000000-0000-4000-8000-000000000010",
      transactionDate: "2026-06-12",
      chargeDate: "2026-06-12",
      amountIls: 100,
      descriptionNormalized: "supermarket",
    });

    const rows = selectAnalysisTransactions(ctx.db, {
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      dateBasis: "transaction",
      categoryIds: [UNCATEGORIZED_CATEGORY_ID],
    });

    expect(rows.map((row) => row.descriptionNormalized).sort()).toEqual([
      "atm fee",
      "investment transfer",
    ]);
  });
});
