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
import type { ReconciliationMonth } from "@moneytrack/engine";

type Body = { today: string; cards: { accountId: string; months: ReconciliationMonth[] }[] };

let activeDb: MoneyTrackDb;
vi.mock("@/server/guard-api", () => ({
  guardApi: async () => ({ db: activeDb, session: {} }),
}));

import { GET } from "./route";

// Synthetic data only.
describe.skipIf(!isEncryptedSqliteAvailable())("GET /api/credit/reconciliation", () => {
  let tmpDir: string;
  let cardId: string;
  let bankId: string;

  function insertRow(accountId: string, chargeDate: string, amountIls: number, kind = "expense", description = "SYNTHETIC SHOP"): void {
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
        transactionDate: kind === "card_settlement" ? chargeDate : "2026-10-20",
        chargeDate,
        amountIls,
        originalAmount: amountIls,
        originalCurrency: "ILS",
        fxRate: null,
        fxFeeIls: null,
        direction: "debit",
        kind,
        descriptionRaw: description,
        descriptionNormalized: description.toLowerCase(),
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-credit-recon-"));
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

  async function recon(query: string): Promise<Response> {
    return GET(new Request(`http://localhost/api/credit/reconciliation${query}`));
  }

  it("compares each charged month's bank debit with the card rows", async () => {
    insertRow(bankId, "2026-01-05", 1, "expense", "SYNTHETIC FEE");
    insertRow(cardId, "2026-09-10", 250);
    insertRow(bankId, "2026-09-10", 250, "card_settlement", "SYNTH MAX IT 1111");
    insertRow(cardId, "2026-10-10", 100);
    insertRow(bankId, "2026-10-03", 40, "card_settlement", "SYNTH MAX IT OLD");
    insertRow(bankId, "2026-10-10", 180, "card_settlement", "SYNTH MAX IT 1111");
    insertRow(cardId, "2026-11-10", 70);

    const response = await recon("?from=2026-09&to=2026-11&today=2026-11-04");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Body;
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]?.accountId).toBe(cardId);
    expect(body.cards[0]?.months.map((m) => [m.month, m.status, m.diff])).toEqual([
      ["2026-09", "match", 0],
      ["2026-10", "mismatch", 80],
      ["2026-11", "open", null],
    ]);
    expect(body.cards[0]?.months[1]?.debits).toEqual([
      { id: expect.any(String), date: "2026-10-10", amount: 180, description: "SYNTH MAX IT 1111" },
    ]);
    expect(body.cards[0]?.months[1]?.extras).toEqual([
      { id: expect.any(String), date: "2026-10-03", amount: 40, description: "SYNTH MAX IT OLD" },
    ]);
  });

  it("says no_details before the scraped card has complete details", async () => {
    insertRow(bankId, "2026-01-05", 1, "expense", "SYNTHETIC FEE");
    insertRow(bankId, "2026-07-10", 900, "card_settlement", "SYNTH MAX IT 1111");
    insertRow(cardId, "2026-09-10", 40);
    insertRow(bankId, "2026-09-10", 250, "card_settlement", "SYNTH MAX IT 1111");
    insertRow(cardId, "2026-10-10", 100);
    insertRow(bankId, "2026-10-10", 100, "card_settlement", "SYNTH MAX IT 1111");

    const body = (await (await recon("?from=2026-07&to=2026-10&today=2026-11-04")).json()) as Body;
    expect(body.cards[0]?.months.map((m) => [m.month, m.status])).toEqual([
      ["2026-07", "no_details"],
      ["2026-09", "no_details"],
      ["2026-10", "match"],
    ]);
  });

  it("rejects a malformed or reversed window", async () => {
    expect((await recon("?from=2026-13")).status).toBe(400);
    expect((await recon("?from=2026-10&to=2026-09")).status).toBe(400);
  });
});
