/**
 * queryBreakdown coverage for every BreakdownDimension.
 * Seeds a small fixture with people, cards, merchants, tags, and parent/child categories.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  accounts,
  cards,
  categorizationDecisions,
  merchants,
  people,
  tags,
  transactionTags,
  transactions,
} from "@moneytrack/db";
import { closeDb, initDb, isEncryptedSqliteAvailable, runMigrations, type MoneyTrackDb } from "@moneytrack/db";
import { GENERAL_PERSON_LABEL, queryBreakdown, recomputeRollups, UNCATEGORIZED_CATEGORY_ID, UNCATEGORIZED_LABEL, UNKNOWN_LABEL } from "./index.js";

const FOOD_PARENT = "00000000-0000-4000-8000-000000000010";
const FOOD_CHILD = "00000000-0000-4000-8000-000000000011";
const REST_PARENT = "00000000-0000-4000-8000-000000000020";
const REST_CHILD = "00000000-0000-4000-8000-000000000021";

function nowIso(): string {
  return new Date().toISOString();
}

async function openTestDb(): Promise<{ db: MoneyTrackDb; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-breakdown-"));
  const key = randomBytes(32);
  closeDb();
  const db = await initDb({ dataDir: tmpDir, key, skipGuards: true });
  runMigrations();
  return {
    db,
    cleanup: () => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

function insertTxn(
  db: MoneyTrackDb,
  fields: Partial<typeof transactions.$inferInsert> & {
    accountId: string;
    transactionDate: string;
    chargeDate: string;
    amountIls: number;
    direction: "debit" | "credit";
    kind: string;
    descriptionRaw: string;
    descriptionNormalized: string;
  },
): string {
  const id = randomUUID();
  const now = nowIso();
  const identityHash = createHash("sha256")
    .update(
      `${fields.accountId}|${fields.transactionDate}|${fields.amountIls}|${fields.descriptionNormalized}|${id}`,
    )
    .digest("hex");

  db.insert(transactions)
    .values({
      id,
      firstSeenRawId: null,
      cardId: fields.cardId ?? null,
      identityHash,
      status: "posted",
      originalAmount: fields.originalAmount ?? fields.amountIls,
      originalCurrency: fields.originalCurrency ?? "ILS",
      fxRate: null,
      fxFeeIls: null,
      merchantId: fields.merchantId ?? null,
      purchaseId: null,
      installmentIndex: null,
      installmentTotal: null,
      excludedFromTotals: false,
      exclusionReason: null,
      userNote: null,
      createdAt: now,
      updatedAt: now,
      ...fields,
    })
    .run();
  return id;
}

type Fixture = {
  personA: string;
  personB: string;
  bankA: string;
  cardAccountA: string;
  cardAccountB: string;
  cardA: string;
  cardB: string;
  merchantA: string;
  merchantB: string;
  tagA: string;
  tagB: string;
};

function seedBreakdownFixture(db: MoneyTrackDb): Fixture {
  const now = nowIso();
  const personA = randomUUID();
  const personB = randomUUID();
  db.insert(people)
    .values({ id: personA, displayName: "Alice", isChild: false, createdAt: now, updatedAt: now })
    .run();
  db.insert(people)
    .values({ id: personB, displayName: "Bob", isChild: false, createdAt: now, updatedAt: now })
    .run();

  const bankA = randomUUID();
  const cardAccountA = randomUUID();
  const cardAccountB = randomUUID();
  for (const row of [
    { id: bankA, kind: "bank" as const, displayName: "Checking", last4: "1111" },
    { id: cardAccountA, kind: "credit_card" as const, displayName: "Alice Card Acct", last4: "2222" },
    { id: cardAccountB, kind: "credit_card" as const, displayName: "Bob Card Acct", last4: "3333" },
  ]) {
    db.insert(accounts)
      .values({
        id: row.id,
        kind: row.kind,
        connectionId: null,
        institutionCode: "leumi",
        displayName: row.displayName,
        numberLast4: row.last4,
        currency: "ILS",
        ownerPersonId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  const cardA = randomUUID();
  const cardB = randomUUID();
  db.insert(cards)
    .values({
      id: cardA,
      settlementAccountId: bankA,
      last4: "4444",
      cardholderPersonId: personA,
      brand: "visa",
      displayName: "Alice Visa",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(cards)
    .values({
      id: cardB,
      settlementAccountId: bankA,
      last4: "5555",
      cardholderPersonId: personB,
      brand: "mastercard",
      displayName: "Bob Mastercard",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const merchantA = randomUUID();
  const merchantB = randomUUID();
  db.insert(merchants)
    .values({ id: merchantA, canonicalName: "Shufersal", createdAt: now })
    .run();
  db.insert(merchants)
    .values({ id: merchantB, canonicalName: "Cafe Greg", createdAt: now })
    .run();

  const tagA = randomUUID();
  const tagB = randomUUID();
  db.insert(tags)
    .values({ id: tagA, name: "groceries", color: "#008000", createdAt: now })
    .run();
  db.insert(tags)
    .values({ id: tagB, name: "dining", color: "#ff6600", createdAt: now })
    .run();

  const txnAlice = insertTxn(db, {
    accountId: cardAccountA,
    cardId: cardA,
    categoryId: FOOD_CHILD,
    merchantId: merchantA,
    transactionDate: "2026-01-15",
    chargeDate: "2026-01-15",
    amountIls: 100,
    direction: "debit",
    kind: "expense",
    descriptionRaw: "SHUFERSAL",
    descriptionNormalized: "shufersal",
  });
  db.insert(transactionTags)
    .values({ transactionId: txnAlice, tagId: tagA })
    .run();
  db.insert(categorizationDecisions)
    .values({
      id: randomUUID(),
      transactionId: txnAlice,
      decidedBy: "test",
      ruleId: null,
      confidence: 1,
      previousCategoryId: null,
      categoryId: FOOD_CHILD,
      decidedAt: now,
    })
    .run();

  const txnBob = insertTxn(db, {
    accountId: cardAccountB,
    cardId: cardB,
    categoryId: REST_CHILD,
    merchantId: merchantB,
    transactionDate: "2026-02-10",
    chargeDate: "2026-02-10",
    amountIls: 50,
    direction: "debit",
    kind: "expense",
    descriptionRaw: "GREG CAFE",
    descriptionNormalized: "greg cafe",
  });
  db.insert(transactionTags)
    .values({ transactionId: txnBob, tagId: tagB })
    .run();
  db.insert(categorizationDecisions)
    .values({
      id: randomUUID(),
      transactionId: txnBob,
      decidedBy: "test",
      ruleId: null,
      confidence: 1,
      previousCategoryId: null,
      categoryId: REST_CHILD,
      decidedAt: now,
    })
    .run();

  insertTxn(db, {
    accountId: bankA,
    transactionDate: "2026-01-20",
    chargeDate: "2026-01-20",
    amountIls: 30,
    direction: "debit",
    kind: "expense",
    descriptionRaw: "ATM FEE",
    descriptionNormalized: "atm fee",
  });

  recomputeRollups(db, new Set(["2026-01", "2026-02"]));

  return {
    personA,
    personB,
    bankA,
    cardAccountA,
    cardAccountB,
    cardA,
    cardB,
    merchantA,
    merchantB,
    tagA,
    tagB,
  };
}

const baseFilter = {
  dateFrom: "2026-01-01",
  dateTo: "2026-02-28",
  dateBasis: "transaction" as const,
};

function amountFor(rows: ReturnType<typeof queryBreakdown>, key: string | null): number {
  const row = rows.find((entry) => entry.categoryId === key);
  expect(row).toBeDefined();
  return Math.abs(row!.amountIls);
}

function amountForName(rows: ReturnType<typeof queryBreakdown>, name: string): number {
  const row = rows.find((entry) => entry.categoryName === name);
  expect(row).toBeDefined();
  return Math.abs(row!.amountIls);
}

describe.skipIf(!isEncryptedSqliteAvailable())("queryBreakdown dimensions", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("groups by parent category", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    seedBreakdownFixture(ctx.db);

    // amountMin forces the transaction scan path (rollup rows store expenses as positive).
    const rows = queryBreakdown(ctx.db, { ...baseFilter, amountMin: 0 }, "category");
    expect(amountFor(rows, FOOD_PARENT)).toBe(100);
    expect(amountFor(rows, REST_PARENT)).toBe(50);
    expect(amountFor(rows, UNCATEGORIZED_CATEGORY_ID)).toBe(30);
  });

  it("groups by subcategory", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    seedBreakdownFixture(ctx.db);

    const rows = queryBreakdown(ctx.db, baseFilter, "subcategory");
    expect(amountFor(rows, FOOD_CHILD)).toBe(100);
    expect(amountFor(rows, REST_CHILD)).toBe(50);
    expect(amountFor(rows, UNCATEGORIZED_CATEGORY_ID)).toBe(30);
  });

  it("groups by cardholder person", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const fixture = seedBreakdownFixture(ctx.db);

    const rows = queryBreakdown(ctx.db, baseFilter, "person");
    expect(amountFor(rows, fixture.personA)).toBe(100);
    expect(amountFor(rows, fixture.personB)).toBe(50);
    expect(amountForName(rows, GENERAL_PERSON_LABEL)).toBe(30);
  });

  it("groups by card", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const fixture = seedBreakdownFixture(ctx.db);

    const rows = queryBreakdown(ctx.db, baseFilter, "card");
    expect(amountFor(rows, fixture.cardA)).toBe(100);
    expect(amountFor(rows, fixture.cardB)).toBe(50);
  });

  it("groups by account", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const fixture = seedBreakdownFixture(ctx.db);

    const rows = queryBreakdown(ctx.db, baseFilter, "account");
    expect(amountFor(rows, fixture.cardAccountA)).toBe(100);
    expect(amountFor(rows, fixture.cardAccountB)).toBe(50);
    expect(amountFor(rows, fixture.bankA)).toBe(30);
  });

  it("groups by merchant", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const fixture = seedBreakdownFixture(ctx.db);

    const rows = queryBreakdown(ctx.db, baseFilter, "merchant");
    expect(amountFor(rows, fixture.merchantA)).toBe(100);
    expect(amountFor(rows, fixture.merchantB)).toBe(50);
    expect(amountForName(rows, UNKNOWN_LABEL)).toBe(30);
  });

  it("groups by tag, counting untagged once", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const fixture = seedBreakdownFixture(ctx.db);

    const rows = queryBreakdown(ctx.db, baseFilter, "tag");
    expect(amountFor(rows, fixture.tagA)).toBe(100);
    expect(amountFor(rows, fixture.tagB)).toBe(50);
    expect(amountForName(rows, UNKNOWN_LABEL)).toBe(30);
  });

  it("honours a range narrower than a month", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    seedBreakdownFixture(ctx.db);

    // Rollups are keyed by month, so this range must not take the rollup fast
    // path — otherwise the 2026-01-20 ATM fee leaks in.
    const rows = queryBreakdown(
      ctx.db,
      { dateFrom: "2026-01-01", dateTo: "2026-01-16", dateBasis: "transaction" },
      "category",
    );
    expect(amountFor(rows, FOOD_PARENT)).toBe(100);
    expect(rows.some((row) => row.categoryName === UNCATEGORIZED_LABEL)).toBe(false);
  });

  it("groups by calendar month", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    seedBreakdownFixture(ctx.db);

    const rows = queryBreakdown(ctx.db, baseFilter, "month");
    expect(rows.every((row) => row.categoryId === null)).toBe(true);
    expect(amountForName(rows, "2026-01")).toBe(130);
    expect(amountForName(rows, "2026-02")).toBe(50);
  });

  it("includes parent and child transactions when filtering by parent categoryIds", async () => {
    const ctx = await openTestDb();
    cleanup = ctx.cleanup;
    const fixture = seedBreakdownFixture(ctx.db);

    insertTxn(ctx.db, {
      accountId: fixture.bankA,
      categoryId: FOOD_PARENT,
      merchantId: fixture.merchantA,
      transactionDate: "2026-01-05",
      chargeDate: "2026-01-05",
      amountIls: 75,
      direction: "debit",
      kind: "expense",
      descriptionRaw: "MARKET STALL",
      descriptionNormalized: "market stall",
    });
    recomputeRollups(ctx.db, new Set(["2026-01"]));

    const rows = queryBreakdown(
      ctx.db,
      {
        ...baseFilter,
        categoryIds: [FOOD_PARENT],
        amountMin: 0,
      },
      "merchant",
    );
    expect(amountFor(rows, fixture.merchantA)).toBe(175);
  });
});
