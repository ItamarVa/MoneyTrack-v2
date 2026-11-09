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
  salarySources,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";

let activeDb: MoneyTrackDb;
vi.mock("@/server/guard-api", () => ({
  guardApi: async () => ({ db: activeDb, session: {} }),
}));

import { GET } from "./route";

// Synthetic data only. Income drill-downs must bucket by reporting period like the ring.
describe.skipIf(!isEncryptedSqliteAvailable())("GET /api/transactions income drill-down", () => {
  let tmpDir: string;
  let accountId: string;
  let sourceId: string;

  function insertIncome(chargeDate: string, reportingPeriod: string): string {
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
        transactionDate: chargeDate,
        chargeDate,
        amountIls: 10_000,
        originalAmount: 10_000,
        originalCurrency: "ILS",
        fxRate: null,
        fxFeeIls: null,
        direction: "credit",
        kind: "income",
        descriptionRaw: "SYNTHETIC PAYROLL",
        descriptionNormalized: "synthetic payroll",
        merchantId: null,
        purchaseId: null,
        installmentIndex: null,
        installmentTotal: null,
        excludedFromTotals: false,
        exclusionReason: null,
        userNote: null,
        reportingPeriod,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  async function list(qs: string): Promise<string[]> {
    const response = await GET(new Request(`http://localhost/api/transactions?${qs}`));
    const body = (await response.json()) as { items: Array<{ id: string }> };
    return body.items.map((item) => item.id);
  }

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-txn-list-"));
    closeDb();
    activeDb = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
    accountId = randomUUID();
    sourceId = randomUUID();
    const now = new Date().toISOString();
    activeDb
      .insert(accounts)
      .values({
        id: accountId,
        kind: "bank",
        connectionId: null,
        institutionCode: "test",
        displayName: "Synthetic Bank",
        numberLast4: "0000",
        currency: "ILS",
        ownerPersonId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    activeDb
      .insert(salarySources)
      .values({
        id: sourceId,
        displayName: "Salary",
        personId: null,
        merchantId: null,
        accountId,
        matchPattern: "payroll",
        sortOrder: 0,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists a salary charged 30 Sep under October when drilling into October", async () => {
    const id = insertIncome("2026-09-30", "2026-10");
    const base = "dateBasis=charge&dateFrom=2026-10-01&dateTo=2026-10-31";

    expect(await list(`${base}&salaryScope=${sourceId}`)).toEqual([id]);
    expect(await list(`${base}&kinds=income`)).toEqual([id]);
    expect(await list(`dateBasis=charge&dateFrom=2026-09-01&dateTo=2026-09-30&salaryScope=${sourceId}`)).toEqual([]);
  });
});
