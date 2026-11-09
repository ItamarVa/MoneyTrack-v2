import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accounts,
  categories,
  categorizationDecisions,
  categorizationRules,
  closeDb,
  eq,
  initDb,
  isEncryptedSqliteAvailable,
  merchantCategoryLearned,
  runMigrations,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { UNCATEGORIZED_CATEGORY_ID } from "@moneytrack/classify";

let activeDb: MoneyTrackDb;
vi.mock("@/server/guard-api", () => ({
  guardApi: async () => ({ db: activeDb, session: { user: { id: "test-user" } } }),
}));
vi.mock("@/server/auth", () => ({ writeAudit: () => undefined }));
vi.mock("@/server/csrf", () => ({ assertValidOrigin: () => undefined }));
vi.mock("@/server/rollup-refresh", () => ({ refreshRollupsForTransactions: () => undefined }));

import { DELETE, PATCH } from "./route";

describe.skipIf(!isEncryptedSqliteAvailable())("/api/transactions/[id]/category", () => {
  let tmpDir: string;
  let txId: string;
  const ruleCategoryId = randomUUID();
  const manualCategoryId = randomUUID();

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-cat-route-"));
    closeDb();
    activeDb = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();

    const now = new Date().toISOString();
    const accountId = randomUUID();
    activeDb
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
    for (const [id, name] of [
      [ruleCategoryId, "Synthetic Rule Category"],
      [manualCategoryId, "Synthetic Manual Category"],
    ] as const) {
      activeDb
        .insert(categories)
        .values({ id, parentId: null, name, sortOrder: 0, createdAt: now })
        .run();
    }
    activeDb
      .insert(categorizationRules)
      .values({
        id: randomUUID(),
        pattern: "synthetic shop",
        categoryId: ruleCategoryId,
        priority: 10,
        enabled: true,
        createdAt: now,
      })
      .run();

    txId = randomUUID();
    activeDb
      .insert(transactions)
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
        descriptionRaw: "Synthetic Shop 123",
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
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const context = () => ({ params: Promise.resolve({ id: txId }) });
  const patch = (categoryId: string) =>
    PATCH(
      new Request("http://localhost/api/transactions/x/category", {
        method: "PATCH",
        body: JSON.stringify({ categoryId }),
      }),
      context(),
    );
  const reset = () =>
    DELETE(new Request("http://localhost/api/transactions/x/category", { method: "DELETE" }), context());
  const row = () => activeDb.select().from(transactions).where(eq(transactions.id, txId)).get()!;

  it("PATCH sets a manual category", async () => {
    const response = await patch(manualCategoryId);
    expect(response.status).toBe(200);
    expect(row().categoryId).toBe(manualCategoryId);
    expect(row().classificationSource).toBe("manual");
  });

  it("PATCH refuses the uncategorized bucket", async () => {
    const response = await patch(UNCATEGORIZED_CATEGORY_ID);
    expect(response.status).toBe(400);
    expect(row().classificationSource).not.toBe("manual");
  });

  it("DELETE returns a manual row to the pipeline and unlocks it", async () => {
    await patch(manualCategoryId);
    expect(row().classificationSource).toBe("manual");

    const response = await reset();
    expect(response.status).toBe(200);

    const after = row();
    expect(after.classificationSource).toBe("rule");
    expect(after.categoryId).toBe(ruleCategoryId);

    const manualDecisions = activeDb
      .select()
      .from(categorizationDecisions)
      .where(eq(categorizationDecisions.transactionId, txId))
      .all()
      .filter((decision) => decision.decidedBy === "manual");
    expect(manualDecisions).toHaveLength(0);

    // Unlocked: a later automatic pass may change the row again.
    const body = (await (await patch(manualCategoryId)).json()) as { transaction: { categoryId: string } };
    expect(body.transaction.categoryId).toBe(manualCategoryId);
  });

  it("DELETE takes back the learned observation of the pick it undoes", async () => {
    await patch(manualCategoryId);
    expect(activeDb.select().from(merchantCategoryLearned).all()).toHaveLength(1);

    await reset();
    expect(activeDb.select().from(merchantCategoryLearned).all()).toHaveLength(0);
  });

  it("refuses PATCH and DELETE on a card settlement row", async () => {
    activeDb.update(transactions).set({ kind: "card_settlement" }).where(eq(transactions.id, txId)).run();

    const patched = await patch(manualCategoryId);
    expect(patched.status).toBe(400);
    expect(((await patched.json()) as { code: string }).code).toBe("card_settlement_locked");

    const cleared = await reset();
    expect(cleared.status).toBe(400);
    expect(((await cleared.json()) as { code: string }).code).toBe("card_settlement_locked");
    expect(row().classificationSource).not.toBe("manual");
  });

  it("DELETE on an unknown transaction is a 404", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/transactions/x/category", { method: "DELETE" }),
      { params: Promise.resolve({ id: randomUUID() }) },
    );
    expect(response.status).toBe(404);
  });
});
