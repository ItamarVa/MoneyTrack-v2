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
  initDb,
  isEncryptedSqliteAvailable,
  runMigrations,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";

const FOOD_CHAIN_CATEGORY = "00000000-0000-4000-8000-000000000011";
const FUEL_CATEGORY = "00000000-0000-4000-8000-000000000031";
const TELECOM_CATEGORY = "00000000-0000-4000-8000-000000000052";

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
});
