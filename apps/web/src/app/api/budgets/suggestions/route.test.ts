import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  categories,
  closeDb,
  initDb,
  isEncryptedSqliteAvailable,
  rollupMonthly,
  runMigrations,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { lastFullMonths } from "@moneytrack/engine";

let activeDb: MoneyTrackDb;
vi.mock("@/server/guard-api", () => ({
  guardApi: async () => ({ db: activeDb, session: { user: { id: null } } }),
}));

import { GET } from "./route";

const NOW = "2026-01-01T00:00:00.000Z";
const CARD_BILL = "00000000-0000-4000-8000-0000000000c3";

describe.skipIf(!isEncryptedSqliteAvailable())("GET /api/budgets/suggestions", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-budget-sugg-"));
    closeDb();
    activeDb = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function addCategory(name: string, parentId: string | null = null): string {
    const id = randomUUID();
    activeDb.insert(categories).values({ id, parentId, name, sortOrder: 0, createdAt: NOW }).run();
    return id;
  }

  function addRollup(
    period: string,
    categoryId: string,
    total: number,
    cardId: string | null = null,
    dateBasis = "charge",
  ): void {
    activeDb
      .insert(rollupMonthly)
      .values({
        period,
        dateBasis,
        categoryId,
        cardId,
        personId: null,
        totalAmountIls: total,
        transactionCount: 1,
        computedAt: NOW,
      })
      .run();
  }

  it("sums bank and card rows, rounds up to 50 and drops one-month and system categories", async () => {
    const months = lastFullMonths(new Date());
    const food = addCategory("Synthetic food");
    const groceries = addCategory("Synthetic groceries", food);
    const rare = addCategory("Synthetic rare");

    addRollup(months[0]!, groceries, 200);
    addRollup(months[0]!, groceries, 100, "card-1");
    addRollup(months[1]!, food, 301);
    addRollup(months[2]!, groceries, 1, null, "transaction");
    addRollup(months[2]!, rare, 900);
    addRollup(months[1]!, CARD_BILL, 5000);
    addRollup(months[2]!, CARD_BILL, 5000);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      months: string[];
      suggestions: Array<{ categoryId: string; suggestedIls: number; activeMonths: number }>;
    };
    expect(body.months).toEqual(months);
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0]).toMatchObject({
      categoryId: food,
      activeMonths: 2,
      suggestedIls: 250, // (300 + 301) / 3 = 200.33 -> 250
    });
  });
});
