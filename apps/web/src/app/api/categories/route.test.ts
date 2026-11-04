import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accounts,
  auditLog,
  budgets,
  categories,
  categorizationDecisions,
  categorizationRules,
  closeDb,
  eq,
  initDb,
  isEncryptedSqliteAvailable,
  merchantCategoryLearned,
  merchants,
  providerCategoryMap,
  runMigrations,
  transactionSplits,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";

let activeDb: MoneyTrackDb;
vi.mock("@/server/guard-api", () => ({
  guardApi: async () => ({ db: activeDb, session: { user: { id: null } } }),
}));

import { POST as createCategory } from "./route";
import { PATCH as patchCategory } from "./[id]/route";
import { GET as mergeCount, POST as mergeCategory } from "./[id]/merge/route";

const SYSTEM_ID = "00000000-0000-4000-8000-0000000000c1";
const NOW = "2026-01-01T00:00:00.000Z";

function req(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/categories", {
    method,
    headers: {
      origin: "http://localhost",
      "x-forwarded-host": "localhost",
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!isEncryptedSqliteAvailable())("category routes: duplicate names and merge", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-cat-route-"));
    closeDb();
    activeDb = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function addCategory(name: string, parentId: string | null = null): string {
    const id = randomUUID();
    activeDb.insert(categories).values({ id, parentId, name, sortOrder: 0, createdAt: NOW }).run();
    return id;
  }

  function parentOf(id: string): string | null | undefined {
    return activeDb.select().from(categories).where(eq(categories.id, id)).get()?.parentId;
  }

  function exists(id: string): boolean {
    return Boolean(activeDb.select().from(categories).where(eq(categories.id, id)).get());
  }

  describe("duplicate names", () => {
    it("rejects creating a same-named category under the same parent (trim, case-insensitive)", async () => {
      addCategory("Savings");
      const res = await createCategory(req("POST", { name: "  savings ", parentId: null }));
      expect(res.status).toBe(409);
      expect(((await res.json()) as { code: string }).code).toBe("duplicate_category_name");
    });

    it("allows the same name under a different parent", async () => {
      const a = addCategory("A");
      addCategory("Savings");
      const res = await createCategory(req("POST", { name: "Savings", parentId: a }));
      expect(res.status).toBe(201);
    });

    it("rejects renaming onto a sibling's name but allows a no-op and a free name", async () => {
      addCategory("Loans");
      const other = addCategory("Other");
      const clash = await patchCategory(req("PATCH", { name: "LOANS" }), ctxFor(other));
      expect(clash.status).toBe(409);
      const noop = await patchCategory(req("PATCH", { name: "Other" }), ctxFor(other));
      expect(noop.status).toBe(200);
      const free = await patchCategory(req("PATCH", { name: "Fresh" }), ctxFor(other));
      expect(free.status).toBe(200);
    });

    it("rejects moving a category under a parent that already has its name", async () => {
      const parent = addCategory("Parent");
      addCategory("Dup", parent);
      const loose = addCategory("Dup");
      const res = await patchCategory(req("PATCH", { parentId: parent }), ctxFor(loose));
      expect(res.status).toBe(409);
    });
  });

  describe("merge", () => {
    function seedSource(source: string): { txId: string; ruleId: string } {
      const accountId = randomUUID();
      activeDb
        .insert(accounts)
        .values({
          id: accountId,
          kind: "bank",
          institutionCode: "test",
          displayName: "Synthetic account",
          createdAt: NOW,
          updatedAt: NOW,
        })
        .run();
      const txId = randomUUID();
      activeDb
        .insert(transactions)
        .values({
          id: txId,
          accountId,
          identityHash: randomUUID(),
          transactionDate: "2026-01-05",
          chargeDate: "2026-01-05",
          status: "completed",
          direction: "debit",
          amountIls: 10,
          originalAmount: 10,
          originalCurrency: "ILS",
          descriptionRaw: "synthetic",
          descriptionNormalized: "synthetic",
          kind: "expense",
          categoryId: source,
          createdAt: NOW,
          updatedAt: NOW,
        })
        .run();
      activeDb
        .insert(transactionSplits)
        .values({ id: randomUUID(), transactionId: txId, categoryId: source, amount: 5 })
        .run();
      const ruleId = randomUUID();
      activeDb
        .insert(categorizationRules)
        .values({ id: ruleId, pattern: "x", categoryId: source, createdAt: NOW })
        .run();
      const merchantId = randomUUID();
      activeDb.insert(merchants).values({ id: merchantId, canonicalName: "Synthetic", createdAt: NOW }).run();
      activeDb
        .insert(merchantCategoryLearned)
        .values({ merchantId, categoryId: source, observationCount: 2, confidence: 0.6, lastSeen: NOW })
        .run();
      activeDb
        .insert(budgets)
        .values({ id: randomUUID(), categoryId: source, period: "2026-01", amount: 100, createdAt: NOW })
        .run();
      activeDb
        .insert(providerCategoryMap)
        .values({ providerCategory: "synthetic-provider", categoryId: source, updatedAt: NOW })
        .run();
      activeDb
        .insert(categorizationDecisions)
        .values({
          id: randomUUID(),
          transactionId: txId,
          decidedBy: "manual",
          categoryId: source,
          previousCategoryId: source,
          decidedAt: NOW,
        })
        .run();
      return { txId, ruleId };
    }

    it("moves every reference and the children to the target, then deletes the source", async () => {
      const source = addCategory("Investments");
      const target = addCategory("Investments", addCategory("Wealth"));
      const child = addCategory("Stocks", source);
      const { txId, ruleId } = seedSource(source);

      const count = await mergeCount(req("GET"), ctxFor(source));
      expect(((await count.json()) as { transactionCount: number }).transactionCount).toBe(1);

      const res = await mergeCategory(req("POST", { targetId: target }), ctxFor(source));
      expect(res.status).toBe(200);
      expect(((await res.json()) as { transactionCount: number }).transactionCount).toBe(1);

      expect(exists(source)).toBe(false);
      expect(parentOf(child)).toBe(target);
      expect(activeDb.select().from(transactions).where(eq(transactions.id, txId)).get()?.categoryId).toBe(target);
      expect(activeDb.select().from(transactionSplits).get()?.categoryId).toBe(target);
      expect(
        activeDb.select().from(categorizationRules).where(eq(categorizationRules.id, ruleId)).get()?.categoryId,
      ).toBe(target);
      expect(activeDb.select().from(merchantCategoryLearned).get()?.categoryId).toBe(target);
      expect(activeDb.select().from(budgets).get()?.categoryId).toBe(target);
      expect(
        activeDb
          .select()
          .from(providerCategoryMap)
          .where(eq(providerCategoryMap.providerCategory, "synthetic-provider"))
          .get()?.categoryId,
      ).toBe(target);
      const decision = activeDb.select().from(categorizationDecisions).get();
      expect(decision?.categoryId).toBe(target);
      expect(decision?.previousCategoryId).toBe(target);
    });

    it("writes an audit entry", async () => {
      const source = addCategory("S");
      const target = addCategory("T");
      await mergeCategory(req("POST", { targetId: target }), ctxFor(source));
      const rows = activeDb.select().from(auditLog).where(eq(auditLog.action, "category_merge")).all();
      expect(rows).toHaveLength(1);
    });

    it("refuses merging into itself", async () => {
      const source = addCategory("S");
      const res = await mergeCategory(req("POST", { targetId: source }), ctxFor(source));
      expect(res.status).toBe(400);
      expect(exists(source)).toBe(true);
    });

    it("refuses merging into a descendant, at any depth", async () => {
      const source = addCategory("S");
      const child = addCategory("C", source);
      const grandchild = addCategory("G", child);
      for (const target of [child, grandchild]) {
        const res = await mergeCategory(req("POST", { targetId: target }), ctxFor(source));
        expect(res.status).toBe(400);
      }
      expect(exists(source)).toBe(true);
    });

    it("refuses a system category as source but accepts it as target", async () => {
      activeDb
        .insert(categories)
        .values({ id: SYSTEM_ID, parentId: null, name: "System", sortOrder: 0, createdAt: NOW })
        .onConflictDoNothing()
        .run();
      const user = addCategory("Mine");
      const refused = await mergeCategory(req("POST", { targetId: user }), ctxFor(SYSTEM_ID));
      expect(refused.status).toBe(409);
      expect(exists(SYSTEM_ID)).toBe(true);

      const ok = await mergeCategory(req("POST", { targetId: SYSTEM_ID }), ctxFor(user));
      expect(ok.status).toBe(200);
      expect(exists(user)).toBe(false);
    });

    it("404s a missing source and 400s a missing target", async () => {
      const real = addCategory("R");
      const missing = randomUUID();
      expect((await mergeCategory(req("POST", { targetId: real }), ctxFor(missing))).status).toBe(404);
      expect((await mergeCategory(req("POST", { targetId: missing }), ctxFor(real))).status).toBe(400);
    });
  });
});
