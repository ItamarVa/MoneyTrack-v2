import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeDb,
  connections,
  eq,
  initDb,
  isEncryptedSqliteAvailable,
  runMigrations,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { mapScraperTransaction, type ProviderAdapter } from "@moneytrack/providers";
import { buildIdentityHash, discriminateOccurrences } from "./identity.js";
import { normalizeDescription } from "./normalize-description.js";
import { importStatementFile, type StatementAccount } from "./statement-import.js";
import { runConnectionSync } from "./sync-runner.js";

// Synthetic data only (npm run privacy:check).
const CARD = "4321";
type Txn = StatementAccount["txns"][number];

/** amount > 0 is a charge (debit), amount < 0 a refund (credit). */
function txn(
  date: string,
  amount: number,
  description: string,
  extra: Partial<Txn> = {},
): Txn {
  return {
    type: "normal",
    date: `${date}T00:00:00.000Z`,
    processedDate: "2026-10-02T00:00:00.000Z",
    originalAmount: -amount,
    originalCurrency: "ILS",
    chargedAmount: -amount,
    chargedCurrency: "ILS",
    description,
    memo: "",
    status: "completed",
    ...extra,
  } as Txn;
}

function baseHash(date: string, amount: number, description: string): string {
  return buildIdentityHash({
    providerCode: "isracard",
    accountNumber: CARD,
    transactionDate: date,
    originalAmount: amount,
    originalCurrency: "ILS",
    normalizedDescription: normalizeDescription(description),
    installmentIndex: null,
  });
}

async function openTestDb(): Promise<{
  db: MoneyTrackDb;
  connectionId: string;
  dataDir: string;
  cleanup: () => void;
}> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-occurrence-"));
  closeDb();
  const db = await initDb({ dataDir, key: randomBytes(32), skipGuards: true });
  runMigrations();
  const connectionId = randomUUID();
  const now = new Date().toISOString();
  db.insert(connections)
    .values({
      id: connectionId,
      providerCode: "isracard",
      credentialRef: "moneytrack/test/occurrence",
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
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    deps: {
      getAdapter: () => adapter,
      loadCredentials: async () => ({ id: "000000000", card6Digits: "000000", password: "synthetic" }),
      dataDir: ctx.dataDir,
    },
  });
}

function statement(txns: Txn[]): StatementAccount[] {
  return [{ accountNumber: CARD, txns, chargeMonth: "2026-10" } as StatementAccount];
}

function allRows(db: MoneyTrackDb): Array<typeof transactions.$inferSelect> {
  return db
    .select()
    .from(transactions)
    .all()
    .sort((a, b) => a.identityHash.localeCompare(b.identityHash));
}

describe("discriminateOccurrences", () => {
  it("keeps the base hash for the first row and discriminates later repeats", () => {
    const out = discriminateOccurrences([
      { baseHash: "h1", direction: "debit", chargeDate: "2026-10-02" },
      { baseHash: "h2", direction: "debit", chargeDate: "2026-10-02" },
      { baseHash: "h1", direction: "debit", chargeDate: "2026-10-02" },
    ]);
    expect(out[0]).toBe("h1");
    expect(out[1]).toBe("h2");
    expect(out[2]).toMatch(/^[0-9a-f]{64}$/);
    expect(out[2]).not.toBe("h1");
  });

  it("gives the base hash to the debit whatever the order of a charge and its refund", () => {
    const debit = { baseHash: "h", direction: "debit" as const, chargeDate: "2026-10-02" };
    const credit = { baseHash: "h", direction: "credit" as const, chargeDate: "2026-10-02" };
    const a = discriminateOccurrences([credit, debit]);
    const b = discriminateOccurrences([debit, credit]);
    expect(a[1]).toBe("h");
    expect(b[0]).toBe("h");
    expect(a[0]).toBe(b[1]);
  });
});

describe.skipIf(!isEncryptedSqliteAvailable())("same-batch repeats keep separate rows", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("two identical purchases on the same day stay two rows, idempotently", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    // No identifier: byte-identical payloads, which also share one raw copy.
    const one = txn("2026-09-05", 1, "Synthetic Kiosk");

    await sync(ctx, [one, one]);
    const first = allRows(ctx.db);
    expect(first).toHaveLength(2);
    expect(first.map((r) => r.identityHash)).toContain(baseHash("2026-09-05", 1, "Synthetic Kiosk"));

    await sync(ctx, [one, one]);
    const second = allRows(ctx.db);
    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
  });

  it("a charge and its same-day full refund stay two rows, one debit and one credit", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const charge = txn("2026-09-07", 250.5, "Synthetic Store", { identifier: 501 });
    const refund = txn("2026-09-07", -250.5, "Synthetic Store", { identifier: 502 });

    await sync(ctx, [refund, charge]);
    const first = allRows(ctx.db);
    expect(first.map((r) => r.direction).sort()).toEqual(["credit", "debit"]);
    const debit = first.find((r) => r.direction === "debit")!;
    expect(debit.identityHash).toBe(baseHash("2026-09-07", 250.5, "Synthetic Store"));

    await sync(ctx, [charge, refund]);
    const second = allRows(ctx.db);
    expect(second.map((r) => [r.id, r.direction])).toEqual(first.map((r) => [r.id, r.direction]));
  });

  it("an existing pre-fix row is matched by its first occurrence, not duplicated", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const usd = txn("2026-09-09", 170.6, "Synthetic Cloud");

    // A single row in a batch is stored under the unchanged base formula (pre-fix state).
    await sync(ctx, [usd]);
    const [existing] = allRows(ctx.db);
    expect(existing!.identityHash).toBe(
      buildIdentityHash({
        providerCode: "isracard",
        accountNumber: CARD,
        transactionDate: "2026-09-09",
        originalAmount: 170.6,
        originalCurrency: "ILS",
        normalizedDescription: normalizeDescription("Synthetic Cloud"),
        installmentIndex: null,
      }),
    );

    await sync(ctx, [usd]);
    expect(allRows(ctx.db).map((r) => r.id)).toEqual([existing!.id]);

    await sync(ctx, [usd, usd]);
    const after = allRows(ctx.db);
    expect(after).toHaveLength(2);
    expect(after.map((r) => r.id)).toContain(existing!.id);
  }, 30_000);

  it("a posted refund does not convert a pending charge", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    await sync(ctx, [txn("2026-09-10", 80, "Synthetic Cafe", { status: "pending" as Txn["status"], chargedAmount: 0 })]);

    await sync(ctx, [txn("2026-09-11", -80, "Synthetic Cafe", { identifier: 777 })]);

    const rows = allRows(ctx.db);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.status === "pending")!.direction).toBe("debit");
    expect(rows.find((r) => r.status === "posted")!.direction).toBe("credit");
  });

  it("statement re-upload is idempotent and adds a previously collapsed repeat", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const one = txn("2026-09-05", 1, "Synthetic Kiosk", { identifier: 901 });
    const two = txn("2026-09-05", 1, "Synthetic Kiosk", { identifier: 902 });
    const charge = txn("2026-09-07", 99.9, "Synthetic Store", { identifier: 903 });
    const refund = txn("2026-09-07", -99.9, "Synthetic Store", { identifier: 904 });

    // Pre-fix state: each collapsed pair left one row under its base hash.
    await importStatementFile(ctx.db, ctx.connectionId, statement([one, refund]));
    const collapsed = allRows(ctx.db);
    expect(collapsed).toHaveLength(2);
    const keptIds = collapsed.map((r) => r.id);

    await importStatementFile(ctx.db, ctx.connectionId, statement([one, two, charge, refund]));
    const fixed = allRows(ctx.db);
    expect(fixed).toHaveLength(4);
    expect(fixed.map((r) => r.id)).toEqual(expect.arrayContaining(keptIds));
    const store = fixed.filter((r) => r.descriptionRaw === "Synthetic Store");
    expect(store.map((r) => r.direction).sort()).toEqual(["credit", "debit"]);

    await importStatementFile(ctx.db, ctx.connectionId, statement([one, two, charge, refund]));
    expect(allRows(ctx.db).map((r) => r.id)).toEqual(fixed.map((r) => r.id));
    expect(ctx.db.select().from(transactions).where(eq(transactions.source, "file")).all()).toHaveLength(4);
  }, 30_000);
});
