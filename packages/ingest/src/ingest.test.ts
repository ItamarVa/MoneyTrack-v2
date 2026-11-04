import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  accounts,
  connections,
  eq,
  scrapeRuns,
  transactions,
} from "@moneytrack/db";
import {
  closeDb,
  initDb,
  runMigrations,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { queryBreakdown, queryDashboardKpis, UNCATEGORIZED_LABEL } from "@moneytrack/engine";
import { mapScraperTransaction } from "@moneytrack/providers";
import { isEncryptedSqliteAvailable } from "@moneytrack/db";
import type {
  ProviderAdapter,
  ScrapeResult,
  ScraperAccountSnapshot,
} from "@moneytrack/providers";
import { buildIdentityHash } from "./identity.js";
import { normalizeDescription } from "./normalize-description.js";
import { resolveSyncStartDate, runConnectionSync } from "./sync-runner.js";
import fixtureTxns from "./fixtures/isracard-txns.json" with { type: "json" };
import postedPendingFixture from "./fixtures/isracard-posted-pending.json" with { type: "json" };


type ScraperTxn = (typeof fixtureTxns)[number];

function buildMockAccounts(txns: ScraperTxn[]): ScraperAccountSnapshot[] {
  return [
    {
      providerAccountNumber: "1234567890",
      balance: 1000,
      balanceDate: "2026-02-10",
      cardFrame: null,
      cardType: null,
      currency: "ILS",
      savingsAccount: false,
      transactions: txns.map((txn) => mapScraperTransaction("1234567890", txn)),
    },
  ];
}

function createMockAdapter(
  accountsData: ScraperAccountSnapshot[],
  failOnSecond = false,
  onScrape?: (startDate: Date) => void,
): ProviderAdapter {
  let calls = 0;
  return {
    companyId: "isracard",
    supportsOtp: false,
    async scrape(_connection, _credentials, options): Promise<ScrapeResult> {
      onScrape?.(options.startDate);
      calls += 1;
      if (failOnSecond && calls > 1) {
        return {
          ok: false,
          errorClass: "MOCK_FAILURE",
          errorMessageRedacted: "Simulated provider failure",
          libraryVersion: "mock-1.0.0",
        };
      }
      return {
        ok: true,
        accounts: accountsData,
        libraryVersion: "mock-1.0.0",
      };
    },
  };
}

async function openTestDb(): Promise<{
  db: MoneyTrackDb;
  dataDir: string;
  cleanup: () => void;
}> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-ingest-"));
  const key = randomBytes(32);
  closeDb();
  const db = await initDb({ dataDir: tmpDir, key, skipGuards: true });
  runMigrations();

  const now = new Date().toISOString();
  const connectionId = randomUUID();
  db.insert(connections)
    .values({
      id: connectionId,
      providerCode: "isracard",
      credentialRef: "moneytrack/test/conn",
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
    dataDir: tmpDir,
    cleanup: () => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

describe.skipIf(!isEncryptedSqliteAvailable())("ingest pipeline", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("buildIdentityHash is stable for the same inputs", () => {
    const normalized = normalizeDescription("WOLT DELIVERY ת\"א");
    const first = buildIdentityHash({
      providerCode: "isracard",
      accountNumber: "1234567890",
      transactionDate: "2026-01-15",
      originalAmount: 89.9,
      originalCurrency: "ILS",
      normalizedDescription: normalized,
      installmentIndex: null,
    });
    const second = buildIdentityHash({
      providerCode: "isracard",
      accountNumber: "1234567890",
      transactionDate: "2026-01-15",
      originalAmount: 89.9,
      originalCurrency: "ILS",
      normalizedDescription: normalized,
      installmentIndex: null,
    });
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("re-sync is idempotent (no duplicate transactions)", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const connection = ctx.db.select().from(connections).all()[0]!;
    const adapter = createMockAdapter(buildMockAccounts(fixtureTxns as ScraperTxn[]));

    await runConnectionSync(ctx.db, connection.id, {
      deps: {
        getAdapter: () => adapter,
        loadCredentials: async () => ({ id: "000000000", card6Digits: "123456", password: "test" }),
        dataDir: ctx.dataDir,
      },
    });

    const firstCount = ctx.db.select().from(transactions).all().length;
    expect(firstCount).toBe(3);

    await runConnectionSync(ctx.db, connection.id, {
      deps: {
        getAdapter: () => adapter,
        loadCredentials: async () => ({ id: "000000000", card6Digits: "123456", password: "test" }),
        dataDir: ctx.dataDir,
      },
    });

    const secondCount = ctx.db.select().from(transactions).all().length;
    expect(secondCount).toBe(firstCount);
  });

  it("merges pending into posted within the reconciliation window", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const connection = ctx.db.select().from(connections).all()[0]!;
    const pendingOnly = buildMockAccounts([fixtureTxns[1] as ScraperTxn]);
    const postedOnly = buildMockAccounts(postedPendingFixture as ScraperTxn[]);

    await runConnectionSync(ctx.db, connection.id, {
      deps: {
        getAdapter: () => createMockAdapter(pendingOnly),
        loadCredentials: async () => ({ id: "000000000", card6Digits: "123456", password: "test" }),
        dataDir: ctx.dataDir,
      },
    });

    const pendingRow = ctx.db.select().from(transactions).all()[0];
    expect(pendingRow?.status).toBe("pending");

    await runConnectionSync(ctx.db, connection.id, {
      deps: {
        getAdapter: () => createMockAdapter(postedOnly),
        loadCredentials: async () => ({ id: "000000000", card6Digits: "123456", password: "test" }),
        dataDir: ctx.dataDir,
      },
    });

    const rows = ctx.db.select().from(transactions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("posted");
  });

  it("isolates per-provider failure without losing prior ingested rows", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const connection = ctx.db.select().from(connections).all()[0]!;
    const adapter = createMockAdapter(buildMockAccounts(fixtureTxns as ScraperTxn[]), true);

    await runConnectionSync(ctx.db, connection.id, {
      deps: {
        getAdapter: () => adapter,
        loadCredentials: async () => ({ id: "000000000", card6Digits: "123456", password: "test" }),
        dataDir: ctx.dataDir,
      },
    });

    const before = ctx.db.select().from(transactions).all().length;
    expect(before).toBe(3);

    await expect(
      runConnectionSync(ctx.db, connection.id, {
        deps: {
          getAdapter: () => adapter,
          loadCredentials: async () => ({ id: "000000000", card6Digits: "123456", password: "test" }),
          dataDir: ctx.dataDir,
        },
      }),
    ).rejects.toThrow();

    const after = ctx.db.select().from(transactions).all().length;
    expect(after).toBe(before);

    const accountRows = ctx.db
      .select()
      .from(accounts)
      .where(eq(accounts.connectionId, connection.id))
      .all();
    expect(accountRows.length).toBeGreaterThan(0);
  });

  it("updates direction when a pending debit is re-synced as a credit", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const connection = ctx.db.select().from(connections).all()[0]!;
    const pendingDebit = {
      type: "normal",
      date: "2026-03-01T00:00:00.000Z",
      processedDate: "2026-03-01T00:00:00.000Z",
      originalAmount: -88,
      originalCurrency: "ILS",
      chargedAmount: -88,
      description: "REFUND TEST MERCHANT",
      status: "pending",
    };
    const postedCredit = {
      type: "normal",
      date: "2026-03-01T00:00:00.000Z",
      processedDate: "2026-03-03T00:00:00.000Z",
      originalAmount: 88,
      originalCurrency: "ILS",
      chargedAmount: 88,
      description: "REFUND TEST MERCHANT",
      status: "completed",
    };

    await runConnectionSync(ctx.db, connection.id, {
      deps: {
        getAdapter: () => createMockAdapter(buildMockAccounts([pendingDebit])),
        loadCredentials: async () => ({ id: "000000000", card6Digits: "123456", password: "test" }),
        dataDir: ctx.dataDir,
      },
    });

    expect(ctx.db.select().from(transactions).all()[0]?.direction).toBe("debit");

    await runConnectionSync(ctx.db, connection.id, {
      deps: {
        getAdapter: () => createMockAdapter(buildMockAccounts([postedCredit])),
        loadCredentials: async () => ({ id: "000000000", card6Digits: "123456", password: "test" }),
        dataDir: ctx.dataDir,
      },
    });

    const row = ctx.db.select().from(transactions).all()[0];
    expect(row?.status).toBe("posted");
    expect(row?.direction).toBe("credit");
  });

  it("queryDashboardKpis reports zero income for a card refund", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const connection = ctx.db.select().from(connections).all()[0]!;
    const cardCredit = {
      type: "normal",
      date: "2026-04-01T00:00:00.000Z",
      processedDate: "2026-04-01T00:00:00.000Z",
      originalAmount: 50,
      originalCurrency: "ILS",
      chargedAmount: 50,
      description: "MYSTERY CARD CREDIT",
      status: "completed",
    };

    await runConnectionSync(ctx.db, connection.id, {
      deps: {
        getAdapter: () => createMockAdapter(buildMockAccounts([cardCredit])),
        loadCredentials: async () => ({ id: "000000000", card6Digits: "123456", password: "test" }),
        dataDir: ctx.dataDir,
      },
    });

    const row = ctx.db.select().from(transactions).all()[0];
    expect(row?.kind).toBe("refund");
    expect(row?.direction).toBe("credit");

    const kpis = queryDashboardKpis(ctx.db, {
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
      dateBasis: "charge",
    });
    expect(kpis.totalIncomeIls).toBe(0);
  });

  it("stores provider_category when scraper payload has category", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const connection = ctx.db.select().from(connections).all()[0]!;
    const categorizedTxn = {
      type: "normal",
      date: "2026-06-01T00:00:00.000Z",
      processedDate: "2026-06-01T00:00:00.000Z",
      originalAmount: -75,
      originalCurrency: "ILS",
      chargedAmount: -75,
      description: "MAX TEST MERCHANT",
      category: "מסעדות ובתי קפה",
      status: "completed",
    };

    await runConnectionSync(ctx.db, connection.id, {
      deps: {
        getAdapter: () => createMockAdapter(buildMockAccounts([categorizedTxn])),
        loadCredentials: async () => ({ id: "000000000", card6Digits: "123456", password: "test" }),
        dataDir: ctx.dataDir,
      },
    });

    const row = ctx.db.select().from(transactions).all()[0];
    expect(row?.providerCategory).toBe("מסעדות ובתי קפה");
  });

  it("rebuilds rollups after classify so synced rows are not uncategorised in breakdown", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const connection = ctx.db.select().from(connections).all()[0]!;
    const seededFoodParentCategoryId = "00000000-0000-4000-8000-000000000010";

    const groceryTxn = {
      type: "normal",
      date: "2026-05-10T00:00:00.000Z",
      processedDate: "2026-05-10T00:00:00.000Z",
      originalAmount: -120,
      originalCurrency: "ILS",
      chargedAmount: -120,
      description: "SHUFERSAL ONLINE",
      status: "completed",
    };

    await runConnectionSync(ctx.db, connection.id, {
      deps: {
        getAdapter: () => createMockAdapter(buildMockAccounts([groceryTxn])),
        loadCredentials: async () => ({ id: "000000000", card6Digits: "123456", password: "test" }),
        dataDir: ctx.dataDir,
      },
    });

    const rows = queryBreakdown(
      ctx.db,
      {
        dateFrom: "2026-05-01",
        dateTo: "2026-05-31",
        dateBasis: "charge",
      },
      "category",
    );

    expect(
      rows.some(
        (row) => row.categoryId === seededFoodParentCategoryId && row.amountIls === 120,
      ),
    ).toBe(true);
    expect(rows.some((row) => row.categoryName === UNCATEGORIZED_LABEL && row.amountIls === 120)).toBe(
      false,
    );
  });
});

describe.skipIf(!isEncryptedSqliteAvailable())("resolveSyncStartDate", () => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  let ctx: Awaited<ReturnType<typeof openTestDb>> | undefined;

  afterEach(() => {
    ctx?.cleanup();
    ctx = undefined;
  });

  it("uses a 365-day floor when there is no successful run", async () => {
    ctx = await openTestDb();
    const connection = ctx.db.select().from(connections).get()!;
    const start = resolveSyncStartDate(ctx.db, connection.id);
    const floor = Date.now() - 365 * MS_PER_DAY;
    expect(Math.abs(start.getTime() - floor)).toBeLessThan(5_000);
  });

  it("uses last successful run minus 60 days", async () => {
    ctx = await openTestDb();
    const connection = ctx.db.select().from(connections).get()!;
    const successStarted = "2026-06-15T10:00:00.000Z";
    dbInsertSuccessRun(ctx.db, connection.id, successStarted);

    const start = resolveSyncStartDate(ctx.db, connection.id);
    const expected = new Date(new Date(successStarted).getTime() - 60 * MS_PER_DAY);
    expect(start.toISOString()).toBe(expected.toISOString());
  });

  it("honors an explicit startDate override", async () => {
    ctx = await openTestDb();
    const connection = ctx.db.select().from(connections).get()!;
    const override = new Date("2025-03-01T00:00:00.000Z");
    expect(resolveSyncStartDate(ctx.db, connection.id, override)).toEqual(override);
  });

  it("passes incremental startDate to the adapter on a later sync", async () => {
    ctx = await openTestDb();
    const connection = ctx.db.select().from(connections).get()!;
    const mockAccounts = buildMockAccounts(fixtureTxns.slice(0, 1));
    const deps = {
      dataDir: ctx.dataDir,
      getAdapter: () => createMockAdapter(mockAccounts),
      loadCredentials: async () => ({ id: "u", password: "p" }),
    };

    await runConnectionSync(ctx.db, connection.id, { deps });
    const successStarted = "2026-06-15T10:00:00.000Z";
    ctx.db
      .update(scrapeRuns)
      .set({ status: "success", finishedAt: successStarted, startedAt: successStarted })
      .where(eq(scrapeRuns.connectionId, connection.id))
      .run();

    let captured: Date | undefined;
    await runConnectionSync(ctx.db, connection.id, {
      deps: {
        ...deps,
        getAdapter: () => createMockAdapter(mockAccounts, false, (startDate) => {
          captured = startDate;
        }),
      },
    });

    const expected = new Date(new Date(successStarted).getTime() - 60 * MS_PER_DAY);
    expect(captured?.toISOString()).toBe(expected.toISOString());
  });
});

function dbInsertSuccessRun(
  db: MoneyTrackDb,
  connectionId: string,
  startedAt: string,
): void {
  db.insert(scrapeRuns)
    .values({
      id: randomUUID(),
      connectionId,
      providerCode: "isracard",
      startedAt,
      finishedAt: startedAt,
      status: "success",
      errorClass: null,
      errorMessageRedacted: null,
      libraryVersion: "mock",
    })
    .run();
}
