/**
 * Verifies migration-seeded Israeli chain rules classify transactions as expected.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { classifyTransaction } from "@moneytrack/classify";
import {
  accounts,
  categories,
  categorizationRules,
  closeDb,
  eq,
  getSqlite,
  initDb,
  isEncryptedSqliteAvailable,
  runMigrations,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";

const FOOD_CHAIN_CATEGORY = "00000000-0000-4000-8000-000000000011";
const FUEL_CATEGORY = "00000000-0000-4000-8000-000000000031";
const TELECOM_CATEGORY = "00000000-0000-4000-8000-000000000052";
const UTILITIES_CATEGORY = "00000000-0000-4000-8000-000000000051";
const PHARMACY_CATEGORY = "00000000-0000-4000-8000-000000000061";
const TRANSIT_CATEGORY = "00000000-0000-4000-8000-000000000032";
const ENTERTAINMENT_CATEGORY = "00000000-0000-4000-8000-000000000091";
const CLOTHING_CATEGORY = "00000000-0000-4000-8000-0000000000a1";
const CARD_BILL_CATEGORY = "00000000-0000-4000-8000-0000000000c3";
const UNCATEGORIZED_CATEGORY = "00000000-0000-4000-8000-000000000001";
const DISABLED_SEED_IDS = [
  "00000000-0000-4000-8000-000000000107",
  "00000000-0000-4000-8000-00000000010d",
  "00000000-0000-4000-8000-00000000010f",
  "00000000-0000-4000-8000-000000000110",
  "00000000-0000-4000-8000-000000000111",
];
const MIGRATION_0010 = path.resolve(
  __dirname,
  "../../../../packages/db/drizzle/0010_hebrew_seed_rules.sql",
);

function insertCashAccount(db: MoneyTrackDb): string {
  const now = new Date().toISOString();
  const accountId = randomUUID();
  db.insert(accounts)
    .values({
      id: accountId,
      kind: "cash",
      connectionId: null,
      institutionCode: "cash",
      displayName: "Cash",
      numberLast4: null,
      currency: "ILS",
      ownerPersonId: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return accountId;
}

async function openSeededDb(): Promise<{ db: MoneyTrackDb; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-seeded-rules-"));
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

function insertTxn(db: MoneyTrackDb, accountId: string, descriptionRaw: string): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  const identityHash = createHash("sha256")
    .update(`${accountId}|2026-01-15|-50|${descriptionRaw}|${id}`)
    .digest("hex");

  db.insert(transactions)
    .values({
      id,
      firstSeenRawId: null,
      accountId,
      cardId: null,
      identityHash,
      transactionDate: "2026-01-15",
      chargeDate: "2026-01-15",
      status: "posted",
      direction: "debit",
      amountIls: -50,
      originalAmount: -50,
      originalCurrency: "ILS",
      fxRate: null,
      fxFeeIls: null,
      descriptionRaw,
      descriptionNormalized: "",
      merchantId: null,
      kind: "expense",
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

  return id;
}

describe.skipIf(!isEncryptedSqliteAvailable())("seeded categorization rules", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("loads the seeded rule and category tree from migrations", async () => {
    const opened = await openSeededDb();
    cleanup = opened.cleanup;

    const rules = opened.db.select().from(categorizationRules).all();
    expect(rules.length).toBeGreaterThanOrEqual(18);

    const foodParent = opened.db
      .select()
      .from(categories)
      .where(eq(categories.id, "00000000-0000-4000-8000-000000000010"))
      .get();
    expect(foodParent?.name).toBe("מזון וסופר");
  });

  it("matches major Israeli chain descriptors from the seed", async () => {
    const opened = await openSeededDb();
    cleanup = opened.cleanup;
    const now = new Date().toISOString();
    const accountId = randomUUID();

    opened.db
      .insert(accounts)
      .values({
        id: accountId,
        kind: "cash",
        connectionId: null,
        institutionCode: "cash",
        displayName: "Cash",
        numberLast4: null,
        currency: "ILS",
        ownerPersonId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const cases = [
      { description: "SHUFERSAL ONLINE", expectedCategoryId: FOOD_CHAIN_CATEGORY },
      { description: "PAZ YELLOW", expectedCategoryId: FUEL_CATEGORY },
      { description: "CELLCOM MONTHLY", expectedCategoryId: TELECOM_CATEGORY },
    ];

    for (const testCase of cases) {
      const txId = insertTxn(opened.db, accountId, testCase.description);
      const outcome = classifyTransaction(opened.db, txId);
      expect(outcome?.categoryId).toBe(testCase.expectedCategoryId);
      expect(outcome?.decidedBy).toBe("rule");
    }
  });

  it("matches Hebrew chains in the form they reach the rules after normalization", async () => {
    const opened = await openSeededDb();
    cleanup = opened.cleanup;
    const accountId = insertCashAccount(opened.db);

    const cases: Array<[string, string]> = [
      ["שופרסל דיל סניף 123", FOOD_CHAIN_CATEGORY],
      ["יוחננוף", FOOD_CHAIN_CATEGORY],
      ["ויקטורי", FOOD_CHAIN_CATEGORY],
      ["אושר עד", FOOD_CHAIN_CATEGORY],
      ["טיב טעם", FOOD_CHAIN_CATEGORY],
      ["מגה בעיר", FOOD_CHAIN_CATEGORY],
      ["רמי לוי שיווק", FOOD_CHAIN_CATEGORY],
      ["SUPER PHARM ISRAEL", PHARMACY_CATEGORY],
      ["Super-Pharm", PHARMACY_CATEGORY],
      ["סופר-פארם", PHARMACY_CATEGORY],
      ["ניו-פארם", PHARMACY_CATEGORY],
      ["GOOD PHARM", PHARMACY_CATEGORY],
      ["פז ילו", FUEL_CATEGORY],
      ["דלק מוטור", FUEL_CATEGORY],
      ["תחנת דלק", FUEL_CATEGORY],
      ["סונול", FUEL_CATEGORY],
      ["דור אלון", FUEL_CATEGORY],
      ["פרטנר", TELECOM_CATEGORY],
      ["סלקום", TELECOM_CATEGORY],
      ["הוט מובייל", TELECOM_CATEGORY],
      ["HOT MOBILE", TELECOM_CATEGORY],
      ["בזק", TELECOM_CATEGORY],
      ["פלאפון", TELECOM_CATEGORY],
      ["גולן טלקום", TELECOM_CATEGORY],
      ["חברת החשמל לישראל", UTILITIES_CATEGORY],
      ["מי אביבים", UTILITIES_CATEGORY],
      ["רכבת ישראל", TRANSIT_CATEGORY],
      ["רב קו", TRANSIT_CATEGORY],
      ["MOOVIT", TRANSIT_CATEGORY],
      ["NETFLIX.COM", ENTERTAINMENT_CATEGORY],
      ["GOOGLE ONE", ENTERTAINMENT_CATEGORY],
      ["SPOTIFY", ENTERTAINMENT_CATEGORY],
      ["APPLE.COM/BILL", ENTERTAINMENT_CATEGORY],
      ["DISNEY PLUS", ENTERTAINMENT_CATEGORY],
      ["SHEIN.COM", CLOTHING_CATEGORY],
    ];

    for (const [description, expected] of cases) {
      const txId = insertTxn(opened.db, accountId, description);
      const outcome = classifyTransaction(opened.db, txId);
      expect(outcome?.categoryId, description).toBe(expected);
      expect(outcome?.decidedBy, description).toBe("rule");
    }
  });

  it("does not let short seeded tokens fire inside unrelated words", async () => {
    const opened = await openSeededDb();
    cleanup = opened.cleanup;
    const accountId = insertCashAccount(opened.db);

    const cases = [
      "HOTEL ISRAEL",
      "HOTEL PAZ DEAD SEA",
      "מפזר אוויר",
      "הוטל ים המלח",
      "BOTTLED WATER SHOP",
      "ELECTRIC SCOOTER STORE",
    ];

    for (const description of cases) {
      const txId = insertTxn(opened.db, accountId, description);
      const outcome = classifyTransaction(opened.db, txId);
      expect(outcome?.categoryId, description).toBe(UNCATEGORIZED_CATEGORY);
      expect(outcome?.decidedBy, description).toBe("default");
    }

    const disabled = opened.db
      .select({ id: categorizationRules.id, enabled: categorizationRules.enabled })
      .from(categorizationRules)
      .all()
      .filter((rule) => DISABLED_SEED_IDS.includes(rule.id));
    expect(disabled).toHaveLength(DISABLED_SEED_IDS.length);
    expect(disabled.every((rule) => rule.enabled === false)).toBe(true);
  });

  it("applies 0010 a second time without error or duplicate rules", async () => {
    const opened = await openSeededDb();
    cleanup = opened.cleanup;
    const before = opened.db.select().from(categorizationRules).all().length;
    const sqlite = getSqlite();

    for (const statement of fs.readFileSync(MIGRATION_0010, "utf8").split("--> statement-breakpoint")) {
      sqlite.exec(statement);
    }

    expect(opened.db.select().from(categorizationRules).all()).toHaveLength(before);
  });

  it("keeps the unconnected card-bill bucket top level", async () => {
    const opened = await openSeededDb();
    cleanup = opened.cleanup;

    const bucket = opened.db
      .select()
      .from(categories)
      .where(eq(categories.id, CARD_BILL_CATEGORY))
      .get();
    expect(bucket?.name).toBe("חיובי כרטיס אשראי ללא פירוט");
    expect(bucket?.parentId).toBeNull();
  });
});
