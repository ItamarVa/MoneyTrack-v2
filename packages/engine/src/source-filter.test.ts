import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { accounts, cards, people, transactions } from "@moneytrack/db";
import { closeDb, initDb, isEncryptedSqliteAvailable, runMigrations, type MoneyTrackDb } from "@moneytrack/db";
import { selectAnalysisTransactions } from "./analysis-filter.js";

async function openTestDb(): Promise<{ db: MoneyTrackDb; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-source-filter-"));
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
    cardId?: string | null;
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
      cardId: fields.cardId ?? null,
      categoryId: null,
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

type SourceFixture = {
  householdBankId: string;
  businessBankId: string;
  settlementAccountId: string;
  cardId: string;
};

function seedSourceFixture(db: MoneyTrackDb): SourceFixture {
  const now = new Date().toISOString();
  const personId = randomUUID();
  db.insert(people)
    .values({ id: personId, displayName: "Owner", isChild: false, createdAt: now, updatedAt: now })
    .run();

  const householdBankId = randomUUID();
  const businessBankId = randomUUID();
  const settlementAccountId = randomUUID();
  for (const row of [
    {
      id: householdBankId,
      kind: "bank" as const,
      displayName: "Household Checking",
      numberLast4: "1111",
      scope: "household" as const,
    },
    {
      id: businessBankId,
      kind: "bank" as const,
      displayName: "Business Checking",
      numberLast4: "2222",
      scope: "business" as const,
    },
    {
      id: settlementAccountId,
      kind: "credit_card" as const,
      displayName: "Visa Settlement",
      numberLast4: "3333",
      scope: "household" as const,
    },
  ]) {
    db.insert(accounts)
      .values({
        id: row.id,
        kind: row.kind,
        connectionId: null,
        institutionCode: "leumi",
        displayName: row.displayName,
        numberLast4: row.numberLast4,
        currency: "ILS",
        scope: row.scope,
        ownerPersonId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  const cardId = randomUUID();
  db.insert(cards)
    .values({
      id: cardId,
      settlementAccountId,
      last4: "4444",
      cardholderPersonId: personId,
      brand: "visa",
      displayName: "Household Visa",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  insertTxn(db, {
    accountId: householdBankId,
    transactionDate: "2026-06-10",
    chargeDate: "2026-06-10",
    amountIls: 100,
    descriptionNormalized: "household transfer",
  });
  insertTxn(db, {
    accountId: businessBankId,
    transactionDate: "2026-06-11",
    chargeDate: "2026-06-11",
    amountIls: 200,
    descriptionNormalized: "business expense",
  });
  insertTxn(db, {
    accountId: settlementAccountId,
    cardId,
    transactionDate: "2026-06-12",
    chargeDate: "2026-06-12",
    amountIls: 50,
    descriptionNormalized: "card purchase",
  });

  return { householdBankId, businessBankId, settlementAccountId, cardId };
}

describe.skipIf(!isEncryptedSqliteAvailable())("sourceMatchCondition via selectAnalysisTransactions", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("filters by account id only", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const fixture = seedSourceFixture(ctx.db);

    const rows = selectAnalysisTransactions(ctx.db, {
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      dateBasis: "transaction",
      accountIds: [fixture.householdBankId],
    });

    expect(rows.map((row) => row.descriptionNormalized)).toEqual(["household transfer"]);
  });

  it("filters by card id only", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const fixture = seedSourceFixture(ctx.db);

    const rows = selectAnalysisTransactions(ctx.db, {
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      dateBasis: "transaction",
      cardIds: [fixture.cardId],
    });

    expect(rows.map((row) => row.descriptionNormalized)).toEqual(["card purchase"]);
  });

  it("returns the union when account and card ids are both set", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const fixture = seedSourceFixture(ctx.db);

    const rows = selectAnalysisTransactions(ctx.db, {
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      dateBasis: "transaction",
      accountIds: [fixture.householdBankId],
      cardIds: [fixture.cardId],
    });

    expect(rows.map((row) => row.descriptionNormalized).sort()).toEqual([
      "card purchase",
      "household transfer",
    ]);
  });

  it("keeps the household scope guard when no source ids are set", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    seedSourceFixture(ctx.db);

    const rows = selectAnalysisTransactions(ctx.db, {
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      dateBasis: "transaction",
    });

    expect(rows.map((row) => row.descriptionNormalized).sort()).toEqual([
      "card purchase",
      "household transfer",
    ]);
  });
});
