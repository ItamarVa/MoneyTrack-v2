import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accounts,
  closeDb,
  initDb,
  isEncryptedSqliteAvailable,
  runMigrations,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";

let activeDb: MoneyTrackDb;
vi.mock("@/server/guard-api", () => ({
  guardApi: async () => ({ db: activeDb, session: {} }),
}));

import { GET } from "./route";

// Synthetic data only. Owner decision 2026-11-04 (revised): the dashboard shows what was
// CHARGED in a month (charge date) by default.
describe.skipIf(!isEncryptedSqliteAvailable())("GET /api/dashboard/home date basis", () => {
  let tmpDir: string;
  let accountId: string;

  type RowOptions = {
    kind?: string;
    direction?: string;
    excludedFromTotals?: boolean;
    description?: string;
  };

  function insertExpense(
    transactionDate: string,
    chargeDate: string,
    amountIls: number,
    options: RowOptions = {},
  ): void {
    const id = randomUUID();
    const now = new Date().toISOString();
    activeDb
      .insert(transactions)
      .values({
        id,
        firstSeenRawId: null,
        accountId,
        cardId: null,
        categoryId: null,
        identityHash: createHash("sha256").update(id).digest("hex"),
        status: "posted",
        transactionDate,
        chargeDate,
        amountIls,
        originalAmount: amountIls,
        originalCurrency: "ILS",
        fxRate: null,
        fxFeeIls: null,
        direction: options.direction ?? "debit",
        kind: options.kind ?? "expense",
        descriptionRaw: "SYNTHETIC SHOP",
        descriptionNormalized: options.description ?? "synthetic shop",
        merchantId: null,
        purchaseId: null,
        installmentIndex: null,
        installmentTotal: null,
        excludedFromTotals: options.excludedFromTotals ?? false,
        exclusionReason: null,
        userNote: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  type HomeBody = {
    usualMonth: { medianIls: number; monthsUsed: number; comparedThroughDay: number | null } | null;
    topCategories: Array<{ categoryName: string; amountIls: number }>;
    latestPeriodWithData: string | null;
    recentTransactions: Array<{ transactionDate: string; descriptionNormalized: string }>;
  };

  async function fullHomeFor(period: string): Promise<HomeBody> {
    const response = await GET(new Request(`http://localhost/api/dashboard/home?period=${period}`));
    return (await response.json()) as HomeBody;
  }

  async function homeFor(period: string): Promise<{ totalExpensesIls: number }> {
    const response = await GET(new Request(`http://localhost/api/dashboard/home?period=${period}`));
    return (await response.json()) as { totalExpensesIls: number };
  }

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-home-"));
    closeDb();
    activeDb = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
    accountId = randomUUID();
    const now = new Date().toISOString();
    activeDb
      .insert(accounts)
      .values({
        id: accountId,
        kind: "credit_card",
        connectionId: null,
        institutionCode: "isracard",
        displayName: "Synthetic Card",
        numberLast4: "0000",
        currency: "ILS",
        ownerPersonId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => {
    vi.useRealTimers();
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("counts a purchase made in October and charged in November in November", async () => {
    insertExpense("2026-10-20", "2026-11-10", 300);

    expect((await homeFor("2026-10")).totalExpensesIls).toBe(0);
    expect((await homeFor("2026-11")).totalExpensesIls).toBe(300);
  });

  it("compares a month against the previous month on the same basis", async () => {
    insertExpense("2026-09-25", "2026-10-10", 100);
    insertExpense("2026-10-05", "2026-11-10", 200);

    const response = await GET(
      new Request("http://localhost/api/dashboard/home?period=2026-11"),
    );
    const body = (await response.json()) as {
      totalExpensesIls: number;
      previousPeriod: { totalExpensesIls: number };
    };
    expect(body.totalExpensesIls).toBe(200);
    expect(body.previousPeriod.totalExpensesIls).toBe(100);
  });

  it("sums the whole history for period=all and reports no month-over-month change", async () => {
    insertExpense("2025-01-10", "2025-02-10", 50);
    insertExpense("2026-09-25", "2026-10-10", 100);
    insertExpense("2026-10-05", "2026-11-10", 200);

    const response = await GET(new Request("http://localhost/api/dashboard/home?period=all"));
    const body = (await response.json()) as {
      periodLabel: string;
      totalExpensesIls: number;
      monthlySeries: Array<{ period: string }>;
      previousPeriod: { expensesChangePct: number | null; netChangePct: number | null };
    };
    expect(body.periodLabel).toBe("כל התקופה");
    expect(body.totalExpensesIls).toBe(350);
    expect(body.monthlySeries[0]?.period).toBe("2025-02");
    expect(body.previousPeriod.expensesChangePct).toBeNull();
    expect(body.previousPeriod.netChangePct).toBeNull();
  });

  it("uses the median of the previous six full months as the usual month", async () => {
    // Apr..Sep 2026: median of 1000, 2000, 3000, 4000, 5000, 100000 is 3500 (a mean would be 19167).
    [1000, 2000, 3000, 4000, 5000, 100000].forEach((amount, index) => {
      insertExpense(`2026-0${index + 4}-15`, `2026-0${index + 4}-15`, amount);
    });
    insertExpense("2026-10-05", "2026-10-05", 4200);

    const body = await fullHomeFor("2026-10");
    expect(body.usualMonth).toEqual({ medianIls: 3500, monthsUsed: 6, comparedThroughDay: null });
  });

  it("gives no usual month with fewer than two earlier months, and none for the all-period view", async () => {
    insertExpense("2026-09-15", "2026-09-15", 1000);
    insertExpense("2026-10-05", "2026-10-05", 400);

    expect((await fullHomeFor("2026-10")).usualMonth).toBeNull();
    expect((await fullHomeFor("all")).usualMonth).toBeNull();
  });

  it("compares the month in progress with the same days of earlier months", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 10, 12));
    insertExpense("2026-09-03", "2026-09-03", 100);
    insertExpense("2026-09-20", "2026-09-20", 900);
    insertExpense("2026-10-02", "2026-10-02", 300);
    insertExpense("2026-10-25", "2026-10-25", 1700);
    insertExpense("2026-11-05", "2026-11-05", 500);

    const body = await fullHomeFor("2026-11");
    // Days 1-10 of Sep and Oct: 100 and 300. A whole-month median would be 1500.
    expect(body.usualMonth).toEqual({ medianIls: 200, monthsUsed: 2, comparedThroughDay: 10 });
  });

  it("returns the newest month with data only when the selected month is empty", async () => {
    insertExpense("2026-07-10", "2026-07-10", 100);
    insertExpense("2026-09-10", "2026-09-10", 200);

    expect((await fullHomeFor("2026-10")).latestPeriodWithData).toBe("2026-09");
    expect((await fullHomeFor("2026-09")).latestPeriodWithData).toBeNull();
    expect((await fullHomeFor("all")).latestPeriodWithData).toBeNull();
  });

  it("returns null for latestPeriodWithData when there is no data at all", async () => {
    expect((await fullHomeFor("2026-10")).latestPeriodWithData).toBeNull();
  });

  it("lists only expenses charged in the selected period, newest first, at most eight", async () => {
    insertExpense("2026-10-02", "2026-10-02", 10, { description: "kept oldest" });
    for (let day = 3; day <= 10; day += 1) {
      const date = `2026-10-${String(day).padStart(2, "0")}`;
      insertExpense(date, date, 10, { description: `kept ${date}` });
    }
    insertExpense("2026-10-20", "2026-10-20", 99, { kind: "card_settlement", description: "bill" });
    insertExpense("2026-10-21", "2026-10-21", 99, { kind: "transfer", description: "transfer" });
    insertExpense("2026-10-22", "2026-10-22", 99, { kind: "loan_payment", description: "loan" });
    insertExpense("2026-10-23", "2026-10-23", 99, {
      kind: "income",
      direction: "credit",
      description: "pay",
    });
    insertExpense("2026-10-24", "2026-10-24", 99, {
      kind: "refund",
      direction: "credit",
      description: "refund",
    });
    insertExpense("2026-10-25", "2026-10-25", 99, { excludedFromTotals: true, description: "excluded" });
    insertExpense("2026-09-30", "2026-09-30", 99, { description: "other month" });

    const rows = (await fullHomeFor("2026-10")).recentTransactions;
    expect(rows).toHaveLength(8);
    expect(rows[0]?.transactionDate).toBe("2026-10-10");
    expect(rows.every((row) => row.descriptionNormalized.startsWith("kept"))).toBe(true);
    expect(rows.map((row) => row.transactionDate)).toEqual(
      [...rows.map((row) => row.transactionDate)].sort().reverse(),
    );
  });

  it("returns the biggest expense categories of the period", async () => {
    insertExpense("2026-10-02", "2026-10-02", 300);
    insertExpense("2026-10-03", "2026-10-03", 50);

    const body = await fullHomeFor("2026-10");
    expect(body.topCategories).toHaveLength(1);
    expect(body.topCategories[0]?.amountIls).toBe(350);
  });

  it("flags net worth as partial when there is no savings account or holding", async () => {
    const response = await GET(new Request("http://localhost/api/dashboard/home?period=2026-10"));
    const body = (await response.json()) as {
      netWorthPartial: boolean;
      netWorthPartialReasons: string[];
    };
    expect(body.netWorthPartial).toBe(true);
    expect(body.netWorthPartialReasons).toContain("no_savings");
  });
});
