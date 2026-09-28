import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  accounts,
  categories,
  categorizationRules,
  closeDb,
  eq,
  initDb,
  merchantAliases,
  merchantCategoryLearned,
  merchants,
  providerCategoryMap,
  runMigrations,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { normalizeMerchant } from "./normalize.js";
import { isEncryptedSqliteAvailable } from "@moneytrack/db";
import normalizationFixture from "./fixtures/normalization.json" with { type: "json" };
import goldenFixture from "./fixtures/classify-golden.json" with { type: "json" };
import {
  classifyTransaction,
  getClassificationDetail,
  manualClassify,
} from "./classify.js";
import { UNCATEGORIZED_CATEGORY_ID, UNCATEGORIZED_CATEGORY_NAME } from "./constants.js";
import { getNormalizationVersion } from "./normalize.js";

describe("normalizeMerchant", () => {
  it("matches normalization golden file", () => {
    for (const row of normalizationFixture) {
      expect(normalizeMerchant(row.input)).toBe(row.expected);
    }
  });
});

describe.skipIf(!isEncryptedSqliteAvailable())("classify golden", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    closeDb();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  async function openDb(): Promise<MoneyTrackDb> {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-classify-"));
    const key = randomBytes(32);
    closeDb();
    const db = await initDb({ dataDir: tmpDir, key, skipGuards: true });
    runMigrations();
    return db;
  }

  it("classifies using golden expectations", async () => {
    const db = await openDb();
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

    const categoryIds: Record<string, string> = {};
    for (const rule of goldenFixture.rules) {
      const id = randomUUID();
      categoryIds[rule.categoryName] = id;
      db.insert(categories)
        .values({
          id,
          parentId: null,
          name: rule.categoryName,
          sortOrder: 0,
          createdAt: now,
        })
        .run();

      db.insert(categorizationRules)
        .values({
          id: randomUUID(),
          pattern: rule.pattern,
          categoryId: id,
          priority: rule.priority,
          enabled: true,
          createdAt: now,
        })
        .run();
    }

    for (const testCase of goldenFixture.cases) {
      const txId = randomUUID();
      db.insert(transactions)
        .values({
          id: txId,
          firstSeenRawId: null,
          accountId,
          cardId: null,
          identityHash: randomUUID(),
          transactionDate: "2026-01-15",
          chargeDate: "2026-01-15",
          status: "posted",
          direction: "debit",
          amountIls: -50,
          originalAmount: -50,
          originalCurrency: "ILS",
          fxRate: null,
          fxFeeIls: null,
          descriptionRaw: testCase.description,
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

      const outcome = classifyTransaction(db, txId);
      expect(outcome).not.toBeNull();

      const category = db
        .select()
        .from(categories)
        .where(eq(categories.id, outcome!.categoryId))
        .get();

      expect(category?.name).toBe(testCase.expectedCategory);
      expect(outcome?.decidedBy).toBe(testCase.expectedSource);
    }

    const uncategorized = db
      .select()
      .from(categories)
      .where(eq(categories.name, UNCATEGORIZED_CATEGORY_NAME))
      .get();
    expect(uncategorized).toBeTruthy();
  });
});

describe.skipIf(!isEncryptedSqliteAvailable())("provider classification pipeline", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    closeDb();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  async function openDb(): Promise<MoneyTrackDb> {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-classify-provider-"));
    const key = randomBytes(32);
    closeDb();
    const db = await initDb({ dataDir: tmpDir, key, skipGuards: true });
    runMigrations();
    return db;
  }

  function insertAccount(db: MoneyTrackDb, now: string): string {
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

  function insertCategory(db: MoneyTrackDb, name: string, now: string): string {
    const id = randomUUID();
    db.insert(categories)
      .values({
        id,
        parentId: null,
        name,
        sortOrder: 0,
        createdAt: now,
      })
      .run();
    return id;
  }

  function insertTransaction(
    db: MoneyTrackDb,
    accountId: string,
    descriptionRaw: string,
    now: string,
    options?: { providerCategory?: string | null },
  ): string {
    const id = randomUUID();
    db.insert(transactions)
      .values({
        id,
        firstSeenRawId: null,
        accountId,
        cardId: null,
        identityHash: randomUUID(),
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
        providerCategory: options?.providerCategory ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function seedMerchantWithLearned(
    db: MoneyTrackDb,
    descriptionRaw: string,
    categoryId: string,
    now: string,
  ): void {
    const merchantId = randomUUID();
    const normalized = normalizeMerchant(descriptionRaw);
    db.insert(merchants)
      .values({
        id: merchantId,
        canonicalName: normalized,
        createdAt: now,
      })
      .run();
    db.insert(merchantAliases)
      .values({
        id: randomUUID(),
        merchantId,
        rawDescriptor: descriptionRaw,
        normalizationVersion: getNormalizationVersion(),
        createdAt: now,
      })
      .run();
    db.insert(merchantCategoryLearned)
      .values({
        merchantId,
        categoryId,
        observationCount: 4,
        confidence: 0.8,
        lastSeen: now,
      })
      .run();
  }

  it("provider mapping wins over default", async () => {
    const db = await openDb();
    const now = new Date().toISOString();
    const accountId = insertAccount(db, now);
    const providerCategoryId = insertCategory(db, "Food", now);
    const providerLabel = "קטגוריית בדיקה ספק";

    db.insert(providerCategoryMap)
      .values({
        providerCategory: providerLabel,
        categoryId: providerCategoryId,
        updatedAt: now,
      })
      .run();

    const txId = insertTransaction(db, accountId, "RANDOM MERCHANT", now, {
      providerCategory: providerLabel,
    });

    const outcome = classifyTransaction(db, txId);
    expect(outcome?.categoryId).toBe(providerCategoryId);
    expect(outcome?.decidedBy).toBe("provider");
    expect(outcome?.ruleId).toBeNull();
    expect(outcome?.confidence).toBe(1);

    const detail = getClassificationDetail(db, txId);
    const providerStep = detail?.chain.find((step) => step.stage === "provider");
    expect(providerStep?.matched).toBe(true);
    expect(providerStep?.categoryId).toBe(providerCategoryId);
  });

  it("rule still beats provider", async () => {
    const db = await openDb();
    const now = new Date().toISOString();
    const accountId = insertAccount(db, now);
    const providerCategoryId = insertCategory(db, "Provider Food", now);
    const ruleCategoryId = insertCategory(db, "Rule Fuel", now);
    const providerLabel = "קטגוריית בדיקה חוק";

    db.insert(providerCategoryMap)
      .values({
        providerCategory: providerLabel,
        categoryId: providerCategoryId,
        updatedAt: now,
      })
      .run();

    db.insert(categorizationRules)
      .values({
        id: randomUUID(),
        pattern: "xyzzyrulebeat",
        categoryId: ruleCategoryId,
        priority: 10,
        enabled: true,
        createdAt: now,
      })
      .run();

    const txId = insertTransaction(db, accountId, "SHOP XYZZYRULEBEAT", now, {
      providerCategory: providerLabel,
    });

    const outcome = classifyTransaction(db, txId);
    expect(outcome?.categoryId).toBe(ruleCategoryId);
    expect(outcome?.decidedBy).toBe("rule");
  });

  it("learned still beats provider", async () => {
    const db = await openDb();
    const now = new Date().toISOString();
    const accountId = insertAccount(db, now);
    const providerCategoryId = insertCategory(db, "Provider Food", now);
    const learnedCategoryId = insertCategory(db, "Learned Cafe", now);
    const providerLabel = "קטגוריית בדיקה למידה";
    const description = "CAFE NORA";

    db.insert(providerCategoryMap)
      .values({
        providerCategory: providerLabel,
        categoryId: providerCategoryId,
        updatedAt: now,
      })
      .run();

    seedMerchantWithLearned(db, description, learnedCategoryId, now);

    const txId = insertTransaction(db, accountId, description, now, {
      providerCategory: providerLabel,
    });

    const outcome = classifyTransaction(db, txId);
    expect(outcome?.categoryId).toBe(learnedCategoryId);
    expect(outcome?.decidedBy).toBe("learned");
  });

  it("manual classification stays sacred", async () => {
    const db = await openDb();
    const now = new Date().toISOString();
    const accountId = insertAccount(db, now);
    const providerCategoryId = insertCategory(db, "Provider Food", now);
    const manualCategoryId = insertCategory(db, "Manual Pick", now);
    const providerLabel = "קטגוריית בדיקה ידני";

    db.insert(providerCategoryMap)
      .values({
        providerCategory: providerLabel,
        categoryId: providerCategoryId,
        updatedAt: now,
      })
      .run();

    const txId = insertTransaction(db, accountId, "LOCKED MERCHANT", now, {
      providerCategory: providerLabel,
    });

    manualClassify(db, txId, manualCategoryId);
    const outcome = classifyTransaction(db, txId);

    expect(outcome?.categoryId).toBe(manualCategoryId);
    expect(outcome?.decidedBy).toBe("manual");
    expect(outcome?.skippedManual).toBe(true);
  });

  it("null provider map category_id falls through to default", async () => {
    const db = await openDb();
    const now = new Date().toISOString();
    const accountId = insertAccount(db, now);
    const providerLabel = "קטגוריית בדיקה ריקה";

    db.insert(providerCategoryMap)
      .values({
        providerCategory: providerLabel,
        categoryId: null,
        updatedAt: now,
      })
      .run();

    const txId = insertTransaction(db, accountId, "MISC SHOP", now, {
      providerCategory: providerLabel,
    });

    const outcome = classifyTransaction(db, txId);
    expect(outcome?.categoryId).toBe(UNCATEGORIZED_CATEGORY_ID);
    expect(outcome?.decidedBy).toBe("default");
  });
});
