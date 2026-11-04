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
  getSqlite,
  initDb,
  jobs,
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
import { SYSTEM_CATEGORY_IDS } from "./system-categories.js";
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

describe.skipIf(!isEncryptedSqliteAvailable())("kind stage, tiebreak, learned threshold, migration 0009", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    closeDb();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  async function openDb(): Promise<MoneyTrackDb> {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-classify-kind-"));
    closeDb();
    const db = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
    return db;
  }

  function insertAccount(db: MoneyTrackDb, kind: string): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.insert(accounts)
      .values({
        id,
        kind,
        connectionId: null,
        institutionCode: kind,
        displayName: "Test",
        numberLast4: null,
        currency: "ILS",
        ownerPersonId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertTxn(
    db: MoneyTrackDb,
    accountId: string,
    description: string,
    extra: { kind?: string; direction?: string; exclusionReason?: string | null } = {},
  ): string {
    const id = randomUUID();
    const now = new Date().toISOString();
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
        direction: extra.direction ?? "debit",
        amountIls: 50,
        originalAmount: 50,
        originalCurrency: "ILS",
        fxRate: null,
        fxFeeIls: null,
        descriptionRaw: description,
        descriptionNormalized: "",
        merchantId: null,
        kind: extra.kind ?? "expense",
        purchaseId: null,
        installmentIndex: null,
        installmentTotal: null,
        excludedFromTotals: false,
        exclusionReason: extra.exclusionReason ?? null,
        userNote: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertCategory(db: MoneyTrackDb, name: string): string {
    const id = randomUUID();
    db.insert(categories)
      .values({ id, parentId: null, name, sortOrder: 0, createdAt: new Date().toISOString() })
      .run();
    return id;
  }

  function categoryName(db: MoneyTrackDb, id: string): string | undefined {
    return db.select().from(categories).where(eq(categories.id, id)).get()?.name;
  }

  it("classifies bank-account kinds per golden kindCases", async () => {
    const db = await openDb();
    const accountIds: Record<string, string> = {
      bank: insertAccount(db, "bank"),
      credit_card: insertAccount(db, "credit_card"),
    };
    for (const testCase of goldenFixture.kindCases as Array<{
      family: string;
      description?: string;
      descriptionParts?: string[];
      accountKind: string;
      direction: string;
      kind: string;
      exclusionReason?: string;
      expectedCategory: string;
      expectedSource: string;
    }>) {
      const txId = insertTxn(db, accountIds[testCase.accountKind]!, testCase.description ?? testCase.descriptionParts!.join(" "), {
        kind: testCase.kind,
        direction: testCase.direction,
        exclusionReason: testCase.exclusionReason ?? null,
      });
      const outcome = classifyTransaction(db, txId);
      expect(categoryName(db, outcome!.categoryId), testCase.family).toBe(testCase.expectedCategory);
      expect(outcome?.decidedBy, testCase.family).toBe(testCase.expectedSource);
    }
  });

  it("kind stage ranks below manual and rule, above provider", async () => {
    const db = await openDb();
    const bank = insertAccount(db, "bank");
    const now = new Date().toISOString();
    const mine = insertCategory(db, "Mine");

    const manualTx = insertTxn(db, bank, "משכורת ידנית", { kind: "income", direction: "credit" });
    manualClassify(db, manualTx, mine);
    expect(classifyTransaction(db, manualTx)?.categoryId).toBe(mine);

    db.insert(categorizationRules)
      .values({ id: randomUUID(), pattern: "משכורת כלל", categoryId: mine, priority: 1, enabled: true, createdAt: now })
      .run();
    const ruleTx = insertTxn(db, bank, "משכורת כלל", { kind: "income", direction: "credit" });
    expect(classifyTransaction(db, ruleTx)?.decidedBy).toBe("rule");

    const providerCategoryId = insertCategory(db, "Provider");
    db.insert(providerCategoryMap)
      .values({ providerCategory: "מקור", categoryId: providerCategoryId, updatedAt: now })
      .run();
    const kindTx = insertTxn(db, bank, "משכורת אחרת", { kind: "income", direction: "credit" });
    db.update(transactions).set({ providerCategory: "מקור" }).where(eq(transactions.id, kindTx)).run();
    const outcome = classifyTransaction(db, kindTx);
    expect(outcome?.decidedBy).toBe("kind");
    expect(outcome?.categoryId).toBe(SYSTEM_CATEGORY_IDS.income);
  });

  it("rule tiebreak: priority, then longer pattern, then newest", async () => {
    const db = await openDb();
    const cash = insertAccount(db, "cash");
    const short = insertCategory(db, "Short");
    const long = insertCategory(db, "Long");
    const newer = insertCategory(db, "Newer");
    const rule = (pattern: string, categoryId: string, priority: number, createdAt: string) =>
      db
        .insert(categorizationRules)
        .values({ id: randomUUID(), pattern, categoryId, priority, enabled: true, createdAt })
        .run();

    rule("abc", short, 5, "2026-01-01T00:00:00Z");
    rule("abcdef", long, 5, "2026-01-01T00:00:00Z");
    expect(classifyTransaction(db, insertTxn(db, cash, "shop abcdef"))?.categoryId).toBe(long);

    rule("uvwxyz", short, 5, "2026-01-01T00:00:00Z");
    rule("uvwxyz", newer, 5, "2026-02-01T00:00:00Z");
    expect(classifyTransaction(db, insertTxn(db, cash, "shop uvwxyz"))?.categoryId).toBe(newer);

    rule("q", short, 9, "2026-01-01T00:00:00Z");
    rule("qrstuvw", long, 5, "2026-01-01T00:00:00Z");
    expect(classifyTransaction(db, insertTxn(db, cash, "shop qrstuvw"))?.categoryId).toBe(short);
  });

  it("learns after 2 consistent manual edits; a different category resets the streak", async () => {
    const db = await openDb();
    const cash = insertAccount(db, "cash");
    const catA = insertCategory(db, "A");
    const catB = insertCategory(db, "B");
    const description = "CAFE LEARN";

    manualClassify(db, insertTxn(db, cash, description), catA);
    expect(classifyTransaction(db, insertTxn(db, cash, description))?.decidedBy).toBe("default");

    manualClassify(db, insertTxn(db, cash, description), catA);
    const learned = classifyTransaction(db, insertTxn(db, cash, description));
    expect(learned?.decidedBy).toBe("learned");
    expect(learned?.categoryId).toBe(catA);

    manualClassify(db, insertTxn(db, cash, description), catB);
    expect(classifyTransaction(db, insertTxn(db, cash, description))?.decidedBy).toBe("default");
    manualClassify(db, insertTxn(db, cash, description), catB);
    expect(classifyTransaction(db, insertTxn(db, cash, description))?.categoryId).toBe(catB);
  });

  it("re-picking the same category on one transaction is not a second observation", async () => {
    const db = await openDb();
    const cash = insertAccount(db, "cash");
    const cat = insertCategory(db, "A");
    const tx = insertTxn(db, cash, "SHOP ONCE");
    manualClassify(db, tx, cat);
    manualClassify(db, tx, cat);
    expect(classifyTransaction(db, insertTxn(db, cash, "SHOP ONCE"))?.decidedBy).toBe("default");
  });

  describe("migration 0009", () => {
    const sqlText = fs.readFileSync(
      new URL("../../db/drizzle/0009_system_categories.sql", import.meta.url),
      "utf8",
    );
    const statements = sqlText
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .filter(Boolean);
    const runSql = () => {
      for (const statement of statements) getSqlite().exec(statement);
    };

    it("seeds the system categories and reapplying changes nothing", async () => {
      const db = await openDb();
      for (const id of Object.values(SYSTEM_CATEGORY_IDS)) {
        expect(categoryName(db, id), id).toBeTruthy();
      }
      const before = db.select().from(categories).all().length;
      runSql();
      runSql();
      expect(db.select().from(categories).all().length).toBe(before);
    });

    it("never duplicates a name the user already has under the same parent", async () => {
      const db = await openDb();
      db.delete(categories).where(eq(categories.id, SYSTEM_CATEGORY_IDS.taxesFees)).run();
      insertCategory(db, "מיסים ועמלות");
      runSql();
      const named = db.select().from(categories).where(eq(categories.name, "מיסים ועמלות")).all();
      expect(named).toHaveLength(1);
      expect(named[0]?.id).not.toBe(SYSTEM_CATEGORY_IDS.taxesFees);
    });

    it("queues one reapply job only when transactions exist", async () => {
      const db = await openDb();
      expect(db.select().from(jobs).all().filter((j) => j.kind === "categorize_bulk")).toHaveLength(0);

      insertTxn(db, insertAccount(db, "bank"), "ROW");
      runSql();
      runSql();
      const queued = db.select().from(jobs).all().filter((j) => j.kind === "categorize_bulk");
      expect(queued).toHaveLength(1);
      expect(queued[0]?.status).toBe("queued");
      expect(JSON.parse(queued[0]!.payloadJson)).toEqual({ periods: ["2026-01"], done: 0, updated: 0 });
    });
  });
});
