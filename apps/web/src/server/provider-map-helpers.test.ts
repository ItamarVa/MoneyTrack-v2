/**
 * Uncategorized-merchant queue filtering and provider-label listing (synthetic data only).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  accounts,
  closeDb,
  initDb,
  isEncryptedSqliteAvailable,
  merchants,
  providerCategoryMap,
  runMigrations,
  salarySources,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { listProviderCategoryMappings, listUncategorizedMerchants } from "./provider-map-helpers";

const UNCATEGORIZED = "00000000-0000-4000-8000-000000000001";

async function openDb(): Promise<{ db: MoneyTrackDb; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-provider-map-"));
  closeDb();
  const db = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
  runMigrations();
  return {
    db,
    cleanup: () => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

function addAccount(db: MoneyTrackDb): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(accounts)
    .values({
      id,
      kind: "cash",
      connectionId: null,
      institutionCode: "cash",
      displayName: "Test",
      numberLast4: null,
      currency: "ILS",
      ownerPersonId: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

function addMerchant(db: MoneyTrackDb, name: string): string {
  const id = randomUUID();
  db.insert(merchants).values({ id, canonicalName: name, createdAt: new Date().toISOString() }).run();
  return id;
}

function addTxn(
  db: MoneyTrackDb,
  accountId: string,
  merchantId: string,
  overrides: Partial<typeof transactions.$inferInsert> = {},
): void {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(transactions)
    .values({
      id,
      firstSeenRawId: null,
      accountId,
      cardId: null,
      identityHash: `hash-${id}`,
      transactionDate: "2026-01-15",
      chargeDate: "2026-01-15",
      status: "posted",
      direction: "debit",
      amountIls: -50,
      originalAmount: -50,
      originalCurrency: "ILS",
      fxRate: null,
      fxFeeIls: null,
      descriptionRaw: "synthetic",
      descriptionNormalized: "synthetic",
      merchantId,
      kind: "expense",
      purchaseId: null,
      installmentIndex: null,
      installmentTotal: null,
      excludedFromTotals: false,
      exclusionReason: null,
      userNote: null,
      categoryId: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
}

describe.skipIf(!isEncryptedSqliteAvailable())("provider-map-helpers", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("hides non-purchase rows from the uncategorized queue", async () => {
    const opened = await openDb();
    cleanup = opened.cleanup;
    const { db } = opened;
    const accountId = addAccount(db);

    const shop = addMerchant(db, "Shop A");
    const settlement = addMerchant(db, "Card Bill A");
    const transfer = addMerchant(db, "Transfer A");
    const loan = addMerchant(db, "Loan A");
    const excluded = addMerchant(db, "Excluded A");
    const employer = addMerchant(db, "Employer A");

    addTxn(db, accountId, shop);
    addTxn(db, accountId, settlement, { kind: "card_settlement" });
    addTxn(db, accountId, transfer, { kind: "transfer" });
    addTxn(db, accountId, loan, { kind: "loan_payment" });
    addTxn(db, accountId, excluded, { excludedFromTotals: true });
    addTxn(db, accountId, employer, { kind: "income", amountIls: 9000, direction: "credit" });

    const now = new Date().toISOString();
    db.insert(salarySources)
      .values({
        id: randomUUID(),
        displayName: "Salary A",
        merchantId: employer,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const result = listUncategorizedMerchants(db, UNCATEGORIZED);
    expect(result.map((m) => m.merchantName)).toEqual(["Shop A"]);
  });

  it("counts only remaining rows for a merchant with mixed rows", async () => {
    const opened = await openDb();
    cleanup = opened.cleanup;
    const { db } = opened;
    const accountId = addAccount(db);
    const mixed = addMerchant(db, "Mixed A");

    addTxn(db, accountId, mixed, { amountIls: -10 });
    addTxn(db, accountId, mixed, { amountIls: -20 });
    addTxn(db, accountId, mixed, { kind: "transfer", amountIls: -1000 });
    addTxn(db, accountId, mixed, { excludedFromTotals: true, amountIls: -500 });

    const [entry] = listUncategorizedMerchants(db, UNCATEGORIZED);
    expect(entry?.transactionCount).toBe(2);
    expect(entry?.totalAmountIls).toBe(30);
  });

  it("lists unmapped provider labels next to mapped ones without inserting rows", async () => {
    const opened = await openDb();
    cleanup = opened.cleanup;
    const { db } = opened;
    const accountId = addAccount(db);
    const merchantId = addMerchant(db, "Shop B");

    addTxn(db, accountId, merchantId, { providerCategory: "Label Mapped" });
    addTxn(db, accountId, merchantId, { providerCategory: "Label Unmapped" });
    addTxn(db, accountId, merchantId, { providerCategory: "Label Unmapped" });
    db.insert(providerCategoryMap)
      .values({
        providerCategory: "Label Mapped",
        categoryId: null,
        updatedAt: new Date().toISOString(),
      })
      .run();

    // Migrations seed some map rows; assert only on this test's labels.
    const entries = listProviderCategoryMappings(db).filter((e) =>
      e.providerCategory.startsWith("Label "),
    );
    expect(entries.map((e) => [e.providerCategory, e.categoryId, e.transactionCount])).toEqual([
      ["Label Mapped", null, 1],
      ["Label Unmapped", null, 2],
    ]);
    expect(
      db.select().from(providerCategoryMap).all().filter((r) => r.providerCategory.startsWith("Label ")),
    ).toHaveLength(1);
  });
});
