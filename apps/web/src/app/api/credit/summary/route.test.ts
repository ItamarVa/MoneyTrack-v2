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
import type { CreditSummaryResponse } from "@/components/credit/credit-types";

let activeDb: MoneyTrackDb;
vi.mock("@/server/guard-api", () => ({
  guardApi: async () => ({ db: activeDb, session: {} }),
}));

import { GET } from "./route";

// Synthetic data only.
describe.skipIf(!isEncryptedSqliteAvailable())("GET /api/credit/summary", () => {
  let tmpDir: string;
  let cardId: string;
  let bankId: string;

  function insertRow(accountId: string, chargeDate: string, amountIls: number): void {
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
        transactionDate: "2026-10-20",
        chargeDate,
        amountIls,
        originalAmount: amountIls,
        originalCurrency: "ILS",
        fxRate: null,
        fxFeeIls: null,
        direction: "debit",
        kind: "expense",
        descriptionRaw: "SYNTHETIC SHOP",
        descriptionNormalized: "synthetic shop",
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

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-credit-route-"));
    closeDb();
    activeDb = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
    const now = new Date().toISOString();
    cardId = randomUUID();
    bankId = randomUUID();
    for (const [id, kind, last4] of [
      [cardId, "credit_card", "1111"],
      [bankId, "bank", "2222"],
    ] as const) {
      activeDb
        .insert(accounts)
        .values({
          id,
          kind,
          connectionId: null,
          institutionCode: "max",
          displayName: `Account ${last4}`,
          numberLast4: last4,
          currency: "ILS",
          scope: "household",
          ownerPersonId: null,
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

  async function summary(query: string): Promise<Response> {
    return GET(new Request(`http://localhost/api/credit/summary${query}`));
  }

  it("returns the next charge for credit cards only, using the day the client sends", async () => {
    insertRow(cardId, "2026-11-10", 250);
    insertRow(cardId, "2026-12-10", 999);
    insertRow(bankId, "2026-11-10", 5000);

    const response = await summary("?today=2026-11-04");
    expect(response.status).toBe(200);
    const body = (await response.json()) as CreditSummaryResponse;
    expect(body.today).toBe("2026-11-04");
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]).toMatchObject({
      accountId: cardId,
      charge: { kind: "upcoming", date: "2026-11-10", amountIls: 250, transactionCount: 1 },
    });
  });

  it("moves to the following charge once the date has passed", async () => {
    insertRow(cardId, "2026-11-10", 250);
    insertRow(cardId, "2026-12-10", 999);
    const body = (await (await summary("?today=2026-11-11")).json()) as CreditSummaryResponse;
    expect(body.cards[0]?.charge).toMatchObject({ date: "2026-12-10", amountIls: 999 });
  });

  it("rejects a malformed day", async () => {
    expect((await summary("?today=yesterday")).status).toBe(400);
  });
});
