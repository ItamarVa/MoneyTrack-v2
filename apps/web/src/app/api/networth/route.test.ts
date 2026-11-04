import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accounts,
  closeDb,
  initDb,
  isEncryptedSqliteAvailable,
  runMigrations,
  type MoneyTrackDb,
} from "@moneytrack/db";

let activeDb: MoneyTrackDb;
vi.mock("@/server/guard-api", () => ({
  guardApi: async () => ({ db: activeDb, session: {} }),
}));

import { GET } from "./route";

// Synthetic data only.
describe.skipIf(!isEncryptedSqliteAvailable())("GET /api/networth", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-nw-route-"));
    closeDb();
    activeDb = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    for (const [kind, balance] of [
      ["bank", 11_000],
      ["credit_card", -13_000],
    ] as const) {
      activeDb
        .insert(accounts)
        .values({
          id: randomUUID(),
          kind,
          institutionCode: "manual",
          displayName: kind,
          currency: "ILS",
          balanceIls: balance,
          balanceDate: today,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("books card debt as a liability and flags a partial picture", async () => {
    const body = (await (await GET()).json()) as {
      snapshots: Array<{ totalAssetsIls: number; totalLiabilitiesIls: number; netWorthIls: number }>;
      partial: boolean;
      partialReasons: string[];
      cardDebtIls: number;
    };
    const latest = body.snapshots.at(-1)!;
    expect(latest.totalAssetsIls).toBe(11_000);
    expect(latest.totalLiabilitiesIls).toBe(13_000);
    expect(latest.netWorthIls).toBe(-2_000);
    expect(body.cardDebtIls).toBe(13_000);
    expect(body.partial).toBe(true);
    expect(body.partialReasons).toContain("no_savings");
  });
});
