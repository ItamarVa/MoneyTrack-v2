import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accounts,
  auditLog,
  cards,
  closeDb,
  eq,
  initDb,
  isEncryptedSqliteAvailable,
  people,
  rollupMonthly,
  runMigrations,
  salarySources,
  users,
  type MoneyTrackDb,
} from "@moneytrack/db";

let activeDb: MoneyTrackDb;
const rollupHook = vi.hoisted(() => ({ fail: false }));

vi.mock("@/server/guard-api", () => ({
  guardApi: async () => ({ db: activeDb, session: { user: { id: null } } }),
}));
vi.mock("@/server/rollup-refresh", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/rollup-refresh")>();
  return {
    ...real,
    refreshAllRollups: (db: MoneyTrackDb) => {
      if (rollupHook.fail) throw new Error("simulated rollup failure");
      real.refreshAllRollups(db);
    },
  };
});

import { POST as mergePersonRoute } from "./route";

const NOW = "2026-01-01T00:00:00.000Z";

function req(body: unknown): Request {
  return new Request("http://localhost/api/people/x/merge", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "x-forwarded-host": "localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!isEncryptedSqliteAvailable())("POST /api/people/[id]/merge", () => {
  let tmpDir: string;

  beforeEach(async () => {
    rollupHook.fail = false;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-person-merge-"));
    closeDb();
    activeDb = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function addPerson(name: string): string {
    const id = randomUUID();
    activeDb.insert(people).values({ id, displayName: name, createdAt: NOW, updatedAt: NOW }).run();
    return id;
  }

  function seedRefs(personId: string) {
    const userId = randomUUID();
    activeDb
      .insert(users)
      .values({
        id: userId,
        personId,
        username: `user-${userId}`,
        passwordHash: "synthetic",
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
    const accountId = randomUUID();
    activeDb
      .insert(accounts)
      .values({
        id: accountId,
        kind: "credit_card",
        institutionCode: "test",
        displayName: "Synthetic card account",
        ownerPersonId: personId,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
    const cardId = randomUUID();
    activeDb
      .insert(cards)
      .values({
        id: cardId,
        settlementAccountId: accountId,
        last4: "0000",
        cardholderPersonId: personId,
        displayName: "Synthetic card",
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
    const salaryId = randomUUID();
    activeDb
      .insert(salarySources)
      .values({ id: salaryId, displayName: "Synthetic salary", personId, createdAt: NOW, updatedAt: NOW })
      .run();
    activeDb
      .insert(rollupMonthly)
      .values({
        period: "2020-01",
        dateBasis: "charge",
        personId,
        totalAmountIls: 1,
        transactionCount: 1,
        computedAt: NOW,
      })
      .run();
    return { userId, accountId, cardId, salaryId };
  }

  it("moves user, account owner, cardholder and salary source, drops person rollups, deletes the source", async () => {
    const source = addPerson("Duplicate");
    const target = addPerson("Real");
    const refs = seedRefs(source);

    const res = await mergePersonRoute(req({ targetId: target }), ctxFor(source));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { moved: Record<string, number> };
    expect(body.moved).toEqual({ users: 1, accounts: 1, cards: 1, salarySources: 1 });

    expect(activeDb.select().from(users).where(eq(users.id, refs.userId)).get()?.personId).toBe(target);
    expect(activeDb.select().from(accounts).where(eq(accounts.id, refs.accountId)).get()?.ownerPersonId).toBe(target);
    expect(activeDb.select().from(cards).where(eq(cards.id, refs.cardId)).get()?.cardholderPersonId).toBe(target);
    expect(activeDb.select().from(salarySources).where(eq(salarySources.id, refs.salaryId)).get()?.personId).toBe(
      target,
    );
    expect(activeDb.select().from(rollupMonthly).where(eq(rollupMonthly.personId, source)).all()).toHaveLength(0);
    expect(activeDb.select().from(people).where(eq(people.id, source)).get()).toBeUndefined();
    expect(activeDb.select().from(people).where(eq(people.id, target)).get()).toBeDefined();

    const audit = activeDb.select().from(auditLog).where(eq(auditLog.action, "person_merge")).get();
    expect(JSON.parse(audit?.metadata ?? "{}")).toMatchObject({ personId: source, targetId: target });
  });

  it("refuses merging a person into itself with 400", async () => {
    const source = addPerson("Solo");
    const res = await mergePersonRoute(req({ targetId: source }), ctxFor(source));
    expect(res.status).toBe(400);
    expect(activeDb.select().from(people).where(eq(people.id, source)).get()).toBeDefined();
  });

  it("returns 404 for an unknown source or target", async () => {
    const known = addPerson("Known");
    const unknownSource = await mergePersonRoute(req({ targetId: known }), ctxFor(randomUUID()));
    expect(unknownSource.status).toBe(404);
    const unknownTarget = await mergePersonRoute(req({ targetId: randomUUID() }), ctxFor(known));
    expect(unknownTarget.status).toBe(404);
    expect(activeDb.select().from(people).where(eq(people.id, known)).get()).toBeDefined();
  });

  it("rolls everything back when a step inside the transaction fails", async () => {
    const source = addPerson("Duplicate");
    const target = addPerson("Real");
    const refs = seedRefs(source);
    rollupHook.fail = true;

    await expect(mergePersonRoute(req({ targetId: target }), ctxFor(source))).rejects.toThrow(
      "simulated rollup failure",
    );

    expect(activeDb.select().from(people).where(eq(people.id, source)).get()).toBeDefined();
    expect(activeDb.select().from(users).where(eq(users.id, refs.userId)).get()?.personId).toBe(source);
    expect(activeDb.select().from(accounts).where(eq(accounts.id, refs.accountId)).get()?.ownerPersonId).toBe(source);
    expect(activeDb.select().from(cards).where(eq(cards.id, refs.cardId)).get()?.cardholderPersonId).toBe(source);
    expect(activeDb.select().from(salarySources).where(eq(salarySources.id, refs.salaryId)).get()?.personId).toBe(
      source,
    );
    expect(activeDb.select().from(rollupMonthly).where(eq(rollupMonthly.personId, source)).all()).toHaveLength(1);
    expect(activeDb.select().from(auditLog).where(eq(auditLog.action, "person_merge")).all()).toHaveLength(0);
  });
});
