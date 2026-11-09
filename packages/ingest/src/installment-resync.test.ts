import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  accounts,
  cards,
  closeDb,
  connections,
  initDb,
  isEncryptedSqliteAvailable,
  people,
  runMigrations,
  transactionRevisions,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { mapScraperTransaction, type ProviderAdapter } from "@moneytrack/providers";
import { importStatementFile, type StatementAccount } from "./statement-import.js";
import { runConnectionSync } from "./sync-runner.js";

// Synthetic data only (npm run privacy:check). Purchase 2026-03-15 in 3 slices of 100; the
// scraper reports slice n dated purchase + (n - 1) months.
const CARD = "4321";
type Txn = StatementAccount["txns"][number];

function slice(index: number, scraperDate: string, chargeDate: string): Txn {
  return {
    type: "installments",
    date: `${scraperDate}T00:00:00.000Z`,
    processedDate: `${chargeDate}T00:00:00.000Z`,
    originalAmount: -100,
    originalCurrency: "ILS",
    chargedAmount: -100,
    chargedCurrency: "ILS",
    description: "Synthetic Furniture",
    memo: "",
    installments: { number: index, total: 3 },
    status: "completed",
  } as Txn;
}

function normal(date: string, chargeDate: string, status: "pending" | "completed"): Txn {
  return {
    type: "normal",
    date: `${date}T00:00:00.000Z`,
    processedDate: `${chargeDate}T00:00:00.000Z`,
    originalAmount: -50,
    originalCurrency: "ILS",
    chargedAmount: -50,
    chargedCurrency: "ILS",
    description: "Synthetic Grocer",
    memo: "",
    status,
  } as Txn;
}

const SLICE2 = slice(2, "2026-04-15", "2026-05-02");
const SLICE3 = slice(3, "2026-05-15", "2026-06-02");

async function openTestDb(): Promise<{
  db: MoneyTrackDb;
  connectionId: string;
  dataDir: string;
  cleanup: () => void;
}> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-installment-"));
  closeDb();
  const db = await initDb({ dataDir, key: randomBytes(32), skipGuards: true });
  runMigrations();
  const now = new Date().toISOString();
  const connectionId = randomUUID();
  db.insert(connections)
    .values({
      id: connectionId,
      providerCode: "isracard",
      credentialRef: "moneytrack/test/installments",
      enabled: true,
      scheduleCron: null,
      lastRunId: null,
      puppeteerProfileDir: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  // processInstallments only reverses slices whose card it can resolve.
  const personId = randomUUID();
  db.insert(people).values({ id: personId, displayName: "Synthetic Holder", createdAt: now, updatedAt: now }).run();
  const bankId = randomUUID();
  db.insert(accounts)
    .values({
      id: bankId,
      kind: "bank",
      connectionId: null,
      institutionCode: "synthetic-bank",
      displayName: "Synthetic Bank",
      numberLast4: "9999",
      currency: "ILS",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(cards)
    .values({
      id: randomUUID(),
      settlementAccountId: bankId,
      last4: CARD,
      cardholderPersonId: personId,
      displayName: "Synthetic Card",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return {
    db,
    connectionId,
    dataDir,
    cleanup: () => {
      closeDb();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

async function sync(ctx: { db: MoneyTrackDb; connectionId: string; dataDir: string }, txns: Txn[]) {
  const adapter: ProviderAdapter = {
    companyId: "isracard",
    supportsOtp: false,
    async scrape() {
      return {
        ok: true,
        libraryVersion: "mock-1.0.0",
        accounts: [
          {
            providerAccountNumber: CARD,
            balance: null,
            balanceDate: null,
            cardFrame: null,
            cardType: null,
            currency: "ILS",
            savingsAccount: false,
            transactions: txns.map((t) => mapScraperTransaction(CARD, t)),
          },
        ],
      };
    },
  };
  await runConnectionSync(ctx.db, ctx.connectionId, {
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    deps: {
      getAdapter: () => adapter,
      loadCredentials: async () => ({ id: "000000000", card6Digits: "000000", password: "synthetic" }),
      dataDir: ctx.dataDir,
    },
  });
}

function sliceRow(db: MoneyTrackDb, index: number) {
  return db.select().from(transactions).all().find((row) => row.installmentIndex === index);
}

function dateRevisions(db: MoneyTrackDb, transactionId: string) {
  return db
    .select()
    .from(transactionRevisions)
    .all()
    .filter((row) => row.transactionId === transactionId && row.fieldName === "transactionDate");
}

describe.skipIf(!isEncryptedSqliteAvailable())("installment purchase date across re-syncs", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("keeps the reversed purchase date when a slice is synced again", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;

    await sync(ctx, [SLICE2, normal("2026-04-20", "2026-05-02", "pending")]);
    const first = sliceRow(ctx.db, 2)!;
    expect(first.transactionDate).toBe("2026-03-15");
    expect(first.purchaseId).not.toBeNull();
    const identityHash = first.identityHash;

    await sync(ctx, [SLICE2, SLICE3, normal("2026-04-21", "2026-05-02", "completed")]);
    const again = sliceRow(ctx.db, 2)!;
    expect(again.id).toBe(first.id);
    expect(again.transactionDate).toBe("2026-03-15");
    expect(again.identityHash).toBe(identityHash);
    expect(dateRevisions(ctx.db, again.id)).toHaveLength(0);

    const third = sliceRow(ctx.db, 3)!;
    expect(third.transactionDate).toBe("2026-03-15");
    expect(third.purchaseId).toBe(again.purchaseId);

    // A non-installment row still takes the provider's new date.
    const grocer = ctx.db.select().from(transactions).all().find((row) => row.installmentIndex === null)!;
    expect(grocer.status).toBe("posted");
    expect(grocer.transactionDate).toBe("2026-04-21");
    expect(dateRevisions(ctx.db, grocer.id)).toHaveLength(1);
  });

  it("keeps the reversed purchase date when a statement file is imported again", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const file = [{ accountNumber: CARD, chargeMonth: "2026-05", txns: [SLICE2] } as StatementAccount];

    await importStatementFile(ctx.db, ctx.connectionId, file);
    const first = sliceRow(ctx.db, 2)!;
    expect(first.source).toBe("file");
    expect(first.transactionDate).toBe("2026-03-15");

    await importStatementFile(ctx.db, ctx.connectionId, file);
    const again = sliceRow(ctx.db, 2)!;
    expect(again.id).toBe(first.id);
    expect(again.transactionDate).toBe("2026-03-15");
    expect(dateRevisions(ctx.db, again.id)).toHaveLength(0);
  });
});
