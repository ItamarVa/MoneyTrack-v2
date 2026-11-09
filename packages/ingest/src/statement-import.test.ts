import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  accounts,
  closeDb,
  connections,
  eq,
  initDb,
  isEncryptedSqliteAvailable,
  runMigrations,
  scrapeRuns,
  tags,
  transactionTags,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { mapScraperTransaction, type ProviderAdapter } from "@moneytrack/providers";
import {
  StatementImportError,
  importStatementFile,
  type StatementAccount,
} from "./statement-import.js";
import { runConnectionSync } from "./sync-runner.js";

// Synthetic data only (npm run privacy:check).
const CARD = "4321";
type Txn = StatementAccount["txns"][number];

function txn(date: string, chargeDate: string, amount: number, description: string, identifier: number): Txn {
  return {
    type: "normal",
    identifier,
    date: `${date}T00:00:00.000Z`,
    processedDate: `${chargeDate}T00:00:00.000Z`,
    originalAmount: -amount,
    originalCurrency: "ILS",
    chargedAmount: -amount,
    chargedCurrency: "ILS",
    description,
    memo: "",
    status: "completed",
  } as Txn;
}

function statement(month: string, txns: Txn[], card = CARD): StatementAccount {
  return { accountNumber: card, txns, chargeMonth: month } as StatementAccount;
}

const A = txn("2026-09-05", "2026-10-02", 10, "Synthetic Shop A", 1001);
const B = txn("2026-09-12", "2026-10-02", 20, "Synthetic Shop B", 1002);
const C = txn("2026-09-25", "2026-10-02", 30, "Synthetic Shop C", 1003);
const S = txn("2026-08-10", "2026-09-02", 40, "Synthetic Shop S", 1004);

async function openTestDb(providerCode = "isracard"): Promise<{
  db: MoneyTrackDb;
  connectionId: string;
  dataDir: string;
  cleanup: () => void;
}> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-statement-"));
  closeDb();
  const db = await initDb({ dataDir, key: randomBytes(32), skipGuards: true });
  runMigrations();
  const connectionId = randomUUID();
  const now = new Date().toISOString();
  db.insert(connections)
    .values({
      id: connectionId,
      providerCode,
      credentialRef: "moneytrack/test/statement",
      enabled: true,
      scheduleCron: null,
      lastRunId: null,
      puppeteerProfileDir: null,
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

async function sync(
  ctx: { db: MoneyTrackDb; connectionId: string; dataDir: string },
  txns: Txn[],
  startDate = new Date("2026-01-01T00:00:00.000Z"),
): Promise<void> {
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
    startDate,
    deps: {
      getAdapter: () => adapter,
      loadCredentials: async () => ({ id: "000000000", card6Digits: "000000", password: "synthetic" }),
      dataDir: ctx.dataDir,
    },
  });
}

function rowsByDescription(db: MoneyTrackDb): Map<string, typeof transactions.$inferSelect> {
  return new Map(db.select().from(transactions).all().map((row) => [row.descriptionRaw, row]));
}

describe.skipIf(!isEncryptedSqliteAvailable())("statement file import", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("first upload inserts file rows on this connection's card account", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;

    const result = await importStatementFile(ctx.db, ctx.connectionId, [statement("2026-10", [A, B])]);

    expect(result).toMatchObject({ ingested: 2, accounts: 1, skippedMonths: [] });
    const account = ctx.db.select().from(accounts).get()!;
    expect(account).toMatchObject({ connectionId: ctx.connectionId, kind: "credit_card", numberLast4: CARD });
    const rows = ctx.db.select().from(transactions).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.source === "file" && row.accountId === account.id)).toBe(true);
    const run = ctx.db.select().from(scrapeRuns).where(eq(scrapeRuns.id, result.runId)).get()!;
    expect(run).toMatchObject({ status: "imported", libraryVersion: "statement-file/1" });
  });

  it("a later upload replaces the month: removed row gone, kept row keeps id and note, new row added", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    await importStatementFile(ctx.db, ctx.connectionId, [statement("2026-10", [A, B])]);
    const before = rowsByDescription(ctx.db);
    const keptId = before.get("Synthetic Shop A")!.id;
    const removedId = before.get("Synthetic Shop B")!.id;
    ctx.db.update(transactions).set({ userNote: "synthetic note" }).where(eq(transactions.id, keptId)).run();
    const tagId = randomUUID();
    ctx.db.insert(tags).values({ id: tagId, name: "synthetic-tag", color: null, createdAt: new Date().toISOString() }).run();
    ctx.db.insert(transactionTags).values({ transactionId: removedId, tagId }).run();

    const result = await importStatementFile(ctx.db, ctx.connectionId, [statement("2026-10", [A, C])]);

    expect(result.ingested).toBe(2);
    const after = rowsByDescription(ctx.db);
    expect([...after.keys()].sort()).toEqual(["Synthetic Shop A", "Synthetic Shop C"]);
    expect(after.get("Synthetic Shop A")).toMatchObject({ id: keptId, userNote: "synthetic note", source: "file" });
    expect(ctx.db.select().from(transactionTags).all()).toHaveLength(0);
  });

  it("skips a month that sync already covers and leaves it untouched", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    await sync(ctx, [A]);

    const result = await importStatementFile(ctx.db, ctx.connectionId, [statement("2026-10", [A, B])]);

    expect(result).toMatchObject({ ingested: 0, accounts: 0, skippedMonths: ["2026-10"] });
    const rows = ctx.db.select().from(transactions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("sync");
  });

  it("a later sync takes over the month: matched file row becomes sync, unmatched file row is removed", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    await importStatementFile(ctx.db, ctx.connectionId, [statement("2026-10", [A, B])]);
    const fileAId = rowsByDescription(ctx.db).get("Synthetic Shop A")!.id;

    await sync(ctx, [A, C]);

    const after = rowsByDescription(ctx.db);
    expect([...after.keys()].sort()).toEqual(["Synthetic Shop A", "Synthetic Shop C"]);
    expect(after.get("Synthetic Shop A")).toMatchObject({ id: fileAId, source: "sync" });
    expect(after.get("Synthetic Shop C")!.source).toBe("sync");
  });

  it("a sync whose window may only partly cover a charge month does not remove file rows there", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    await importStatementFile(ctx.db, ctx.connectionId, [statement("2026-10", [A, B])]);

    await sync(ctx, [C], new Date("2026-09-20T00:00:00.000Z"));

    expect([...rowsByDescription(ctx.db).keys()].sort()).toEqual([
      "Synthetic Shop A",
      "Synthetic Shop B",
      "Synthetic Shop C",
    ]);
  });

  it("handles each charge month in one file independently", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    await sync(ctx, [S]);

    const result = await importStatementFile(ctx.db, ctx.connectionId, [
      statement("2026-09", [S, txn("2026-08-20", "2026-09-02", 50, "Synthetic Shop T", 1005)]),
      statement("2026-10", [A]),
    ]);
    expect(result).toMatchObject({ ingested: 1, accounts: 1, skippedMonths: ["2026-09"] });

    // Replacing October does not touch September.
    await importStatementFile(ctx.db, ctx.connectionId, [statement("2026-10", [B])]);
    const rows = rowsByDescription(ctx.db);
    expect([...rows.keys()].sort()).toEqual(["Synthetic Shop B", "Synthetic Shop S"]);
    expect(rows.get("Synthetic Shop S")!.source).toBe("sync");
  });

  it("refuses a connection whose provider has no statement format", async () => {
    const ctx = await openTestDb("max");
    cleanup = ctx.cleanup;
    await expect(
      importStatementFile(ctx.db, ctx.connectionId, [statement("2026-10", [A])]),
    ).rejects.toBeInstanceOf(StatementImportError);
    expect(ctx.db.select().from(transactions).all()).toHaveLength(0);
  });
});
