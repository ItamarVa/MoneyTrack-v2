import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { accounts, transactions } from "@moneytrack/db";
import { closeDb, initDb, isEncryptedSqliteAvailable, runMigrations } from "@moneytrack/db";
import { pickCardCharge, queryCreditCardCharges, type ChargeRow } from "./credit-cards.js";

// Synthetic data only.
function row(chargeDate: string, amountIls: number, extra: Partial<ChargeRow> = {}): ChargeRow {
  return {
    chargeDate,
    amountIls,
    kind: "expense",
    direction: "debit",
    excludedFromTotals: false,
    ...extra,
  };
}

describe("pickCardCharge", () => {
  const today = "2026-11-04";

  it("sums the earliest charge date on or after today", () => {
    const charge = pickCardCharge(
      [row("2026-11-10", 100), row("2026-11-10", 50.5), row("2026-12-10", 999), row("2026-10-10", 70)],
      today,
    );
    expect(charge).toEqual({ kind: "upcoming", date: "2026-11-10", amountIls: 150.5, transactionCount: 2 });
  });

  it("treats a charge dated today as upcoming", () => {
    expect(pickCardCharge([row("2026-11-04", 30)], today).kind).toBe("upcoming");
  });

  it("falls back to the newest past charge when nothing is upcoming", () => {
    const charge = pickCardCharge([row("2026-09-10", 10), row("2026-10-10", 20)], today);
    expect(charge).toEqual({ kind: "last", date: "2026-10-10", amountIls: 20, transactionCount: 1 });
  });

  it("returns none for a card without billed rows", () => {
    expect(pickCardCharge([], today).kind).toBe("none");
  });

  it("nets refunds and ignores excluded and zero-amount (pending) rows", () => {
    const charge = pickCardCharge(
      [
        row("2026-11-10", 200),
        row("2026-11-10", 60, { direction: "credit" }),
        row("2026-11-10", 500, { excludedFromTotals: true }),
        row("2026-11-03", 0),
        row("2026-11-05", 0),
      ],
      today,
    );
    expect(charge).toEqual({ kind: "upcoming", date: "2026-11-10", amountIls: 140, transactionCount: 2 });
  });

  it("rounds float noise to agorot", () => {
    const charge = pickCardCharge([row("2026-11-10", 0.1), row("2026-11-10", 0.2)], today);
    expect(charge.amountIls).toBe(0.3);
  });
});

describe.skipIf(!isEncryptedSqliteAvailable())("queryCreditCardCharges", () => {
  it("reports household credit cards only, each with its own next charge", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-credit-"));
    closeDb();
    const db = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
    try {
      const now = new Date().toISOString();
      const ids = { cardA: randomUUID(), cardB: randomUUID(), bank: randomUUID(), business: randomUUID() };
      const accountRows = [
        { id: ids.cardA, kind: "credit_card", scope: "household", last4: "1111" },
        { id: ids.cardB, kind: "credit_card", scope: "household", last4: "2222" },
        { id: ids.bank, kind: "bank", scope: "household", last4: "3333" },
        { id: ids.business, kind: "credit_card", scope: "business", last4: "4444" },
      ] as const;
      for (const account of accountRows) {
        db.insert(accounts)
          .values({
            id: account.id,
            kind: account.kind,
            connectionId: null,
            institutionCode: "max",
            displayName: `Card ${account.last4}`,
            numberLast4: account.last4,
            currency: "ILS",
            scope: account.scope,
            ownerPersonId: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
      const insert = (accountId: string, chargeDate: string, amountIls: number) => {
        const id = randomUUID();
        db.insert(transactions)
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
      };
      insert(ids.cardA, "2026-11-10", 120);
      insert(ids.cardB, "2026-10-02", 80);
      insert(ids.bank, "2026-11-10", 5000);
      insert(ids.business, "2026-11-10", 7000);

      const result = queryCreditCardCharges(db, "2026-11-04");
      expect(result.map((card) => card.accountId).sort()).toEqual([ids.cardA, ids.cardB].sort());
      const a = result.find((card) => card.accountId === ids.cardA)!;
      const b = result.find((card) => card.accountId === ids.cardB)!;
      expect(a.charge).toMatchObject({ kind: "upcoming", date: "2026-11-10", amountIls: 120 });
      expect(b.charge).toMatchObject({ kind: "last", date: "2026-10-02", amountIls: 80 });
    } finally {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
