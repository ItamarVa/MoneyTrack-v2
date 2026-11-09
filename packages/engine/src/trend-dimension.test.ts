/**
 * queryCategoryTrend grouping by person and by card (synthetic data only).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { accounts, cards, eq, people, transactions } from "@moneytrack/db";
import type { AnalysisFilter } from "@moneytrack/contracts";
import { closeDb, initDb, isEncryptedSqliteAvailable, runMigrations, type MoneyTrackDb } from "@moneytrack/db";
import { GENERAL_PERSON_LABEL, queryCategoryTrend, queryBreakdown } from "./index.js";

const FILTER = { dateFrom: "2026-01-01", dateTo: "2026-01-31", dateBasis: "transaction" } as AnalysisFilter;

function insertTxn(db: MoneyTrackDb, accountId: string, cardId: string | null, amountIls: number): void {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(transactions)
    .values({
      id,
      accountId,
      firstSeenRawId: null,
      cardId,
      identityHash: createHash("sha256").update(id).digest("hex"),
      status: "posted",
      transactionDate: "2026-01-15",
      chargeDate: "2026-01-15",
      amountIls,
      originalAmount: amountIls,
      originalCurrency: "ILS",
      fxRate: null,
      fxFeeIls: null,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "SYNTHETIC",
      descriptionNormalized: "synthetic",
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

describe.skipIf(!isEncryptedSqliteAvailable())("queryCategoryTrend dimension", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function seed(): Promise<{ db: MoneyTrackDb; alice: string; cardA: string; cardB: string; bank: string }> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-trend-dim-"));
    closeDb();
    const db = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
    cleanup = () => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    };
    const now = new Date().toISOString();
    const alice = randomUUID();
    const bob = randomUUID();
    for (const [id, name] of [[alice, "Alice"], [bob, "Bob"]] as const) {
      db.insert(people).values({ id, displayName: name, isChild: false, createdAt: now, updatedAt: now }).run();
    }
    const bank = randomUUID();
    db.insert(accounts)
      .values({
        id: bank, kind: "bank", connectionId: null, institutionCode: "leumi", displayName: "Checking",
        numberLast4: "1111", currency: "ILS", ownerPersonId: null, createdAt: now, updatedAt: now,
      })
      .run();
    const cardA = randomUUID();
    const cardB = randomUUID();
    for (const [id, last4, holder, name] of [[cardA, "4444", alice, "Alice Visa"], [cardB, "5555", bob, "Bob MC"]] as const) {
      db.insert(cards)
        .values({
          id, settlementAccountId: bank, last4, cardholderPersonId: holder, brand: "visa",
          displayName: name, createdAt: now, updatedAt: now,
        })
        .run();
    }
    insertTxn(db, bank, cardA, 100);
    insertTxn(db, bank, cardA, 20);
    insertTxn(db, bank, cardB, 50);
    insertTxn(db, bank, null, 30);
    return { db, alice, cardA, cardB, bank };
  }

  it("groups by person, cardless owner-less spend is General", async () => {
    const { db, alice } = await seed();
    const [row] = queryCategoryTrend(db, FILTER, "person");
    expect(row?.period).toBe("2026-01");
    expect(row?.segments).toEqual([
      { categoryId: alice, categoryName: "Alice", amountIls: 120 },
      { categoryId: expect.any(String), categoryName: "Bob", amountIls: 50 },
      { categoryId: null, categoryName: GENERAL_PERSON_LABEL, amountIls: 30 },
    ]);
  });

  it("groups by card; card-less spend falls back to its account", async () => {
    const { db, cardA, cardB, bank } = await seed();
    const [row] = queryCategoryTrend(db, FILTER, "card");
    expect(row?.segments).toEqual([
      { categoryId: cardA, categoryName: "Alice Visa", amountIls: 120 },
      { categoryId: cardB, categoryName: "Bob MC", amountIls: 50 },
      { categoryId: bank, categoryName: "Checking", amountIls: 30 },
    ]);
  });

  it("card mode with null cardId groups per account by account name", async () => {
    const { db } = await seed();
    const now = new Date().toISOString();
    const maxId = randomUUID();
    db.insert(accounts)
      .values({
        id: maxId, kind: "credit_card", connectionId: null, institutionCode: "max", displayName: "max 1234",
        numberLast4: "1234", currency: "ILS", ownerPersonId: null, createdAt: now, updatedAt: now,
      })
      .run();
    insertTxn(db, maxId, null, 500);
    const [row] = queryCategoryTrend(db, FILTER, "card");
    expect(row?.segments[0]).toEqual({ categoryId: maxId, categoryName: "max 1234", amountIls: 500 });
  });

  it("defaults to category grouping", async () => {
    const { db } = await seed();
    const [row] = queryCategoryTrend(db, FILTER);
    expect(row?.segments).toHaveLength(1);
  });

  it("null-cardId txn on an account with one linked card resolves to that cardholder", async () => {
    const { db, alice } = await seed();
    const now = new Date().toISOString();
    const cc = randomUUID();
    db.insert(accounts)
      .values({
        id: cc, kind: "credit_card", connectionId: null, institutionCode: "max", displayName: "max 9999",
        numberLast4: "9999", currency: "ILS", ownerPersonId: null, createdAt: now, updatedAt: now,
      })
      .run();
    db.insert(cards)
      .values({
        id: randomUUID(), settlementAccountId: cc, last4: "9999", cardholderPersonId: alice, brand: "visa",
        displayName: "Alice Max", createdAt: now, updatedAt: now,
      })
      .run();
    insertTxn(db, cc, null, 700);
    const [row] = queryCategoryTrend(db, FILTER, "person");
    expect(row?.segments[0]).toEqual({ categoryId: alice, categoryName: "Alice", amountIls: 820 });
    const people = queryBreakdown(db, { ...FILTER, personIds: [alice] }, "person");
    expect(people.find((r) => r.categoryId === alice)?.amountIls).toBe(820);
    const [cardRow] = queryCategoryTrend(db, FILTER, "card");
    expect(cardRow?.segments.find((s) => s.categoryId === cc)).toEqual({
      categoryId: cc, categoryName: "Alice Max", amountIls: 700,
    });
  });

  it("two cards on one account fall back to the account owner; explicit cardId wins", async () => {
    const { db, alice, bank } = await seed();
    const now = new Date().toISOString();
    const carol = randomUUID();
    db.insert(people).values({ id: carol, displayName: "Carol", isChild: false, createdAt: now, updatedAt: now }).run();
    db.update(accounts).set({ ownerPersonId: carol }).where(eq(accounts.id, bank)).run();
    const [row] = queryCategoryTrend(db, FILTER, "person");
    // The cardless 30 now belongs to the account owner; explicit card holders unchanged.
    expect(row?.segments).toEqual([
      { categoryId: alice, categoryName: "Alice", amountIls: 120 },
      { categoryId: expect.any(String), categoryName: "Bob", amountIls: 50 },
      { categoryId: carol, categoryName: "Carol", amountIls: 30 },
    ]);
  });
});
