import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  accounts,
  closeDb,
  eq,
  initDb,
  isEncryptedSqliteAvailable,
  people,
  rawTransactions,
  scrapeRuns,
  sessions,
  transactions,
  users,
} from "@moneytrack/db";
import { runMigrations } from "@moneytrack/db";
import { pruneOldData } from "./prune.js";

describe.skipIf(!isEncryptedSqliteAvailable())("pruneOldData raw retention", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    closeDb();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  async function openDb() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-prune-"));
    closeDb();
    const db = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
    return db;
  }

  function insertRun(
    db: Awaited<ReturnType<typeof openDb>>,
    connectionId: string,
    status: string,
    startedAt: string,
  ): string {
    const id = randomUUID();
    db.insert(scrapeRuns)
      .values({
        id,
        connectionId,
        providerCode: "isracard",
        startedAt,
        finishedAt: startedAt,
        status,
        errorClass: null,
        errorMessageRedacted: null,
        libraryVersion: "test",
      })
      .run();
    return id;
  }

  it("keeps only the latest successful run and in-flight runs per connection", () => {
    return openDb().then(async (db) => {
      const connectionId = randomUUID();
      const oldSuccess = insertRun(db, connectionId, "success", "2026-01-01T00:00:00.000Z");
      const latestSuccess = insertRun(db, connectionId, "success", "2026-06-01T00:00:00.000Z");
      const failed = insertRun(db, connectionId, "failed", "2026-05-01T00:00:00.000Z");
      const running = insertRun(db, connectionId, "running", "2026-07-01T00:00:00.000Z");
      const otp = insertRun(db, connectionId, "otp_required", "2026-07-02T00:00:00.000Z");

      const rawOld = randomUUID();
      db.insert(rawTransactions)
        .values({
          id: rawOld,
          runId: oldSuccess,
          providerAccountNumber: "111",
          payloadJson: "{}",
          payloadSha256: "aa",
          ingestedAt: "2026-01-01T00:00:00.000Z",
        })
        .run();

      const txnId = randomUUID();
      const accountId = randomUUID();
      const now = "2026-01-01T00:00:00.000Z";
      db.insert(accounts)
        .values({
          id: accountId,
          kind: "checking",
          connectionId: null,
          institutionCode: "test",
          displayName: "Test",
          numberLast4: null,
          currency: "ILS",
          ownerPersonId: null,
          balanceIls: null,
          balanceDate: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(transactions)
        .values({
          id: txnId,
          firstSeenRawId: rawOld,
          accountId,
          cardId: null,
          identityHash: "hash1",
          transactionDate: "2026-01-15",
          chargeDate: "2026-01-15",
          status: "posted",
          direction: "debit",
          amountIls: 10,
          originalAmount: 10,
          originalCurrency: "ILS",
          fxRate: null,
          fxFeeIls: null,
          descriptionRaw: "SYNTHETIC",
          descriptionNormalized: "synthetic",
          merchantId: null,
          kind: "expense",
          purchaseId: null,
          installmentIndex: null,
          installmentTotal: null,
          excludedFromTotals: false,
          exclusionReason: null,
          userNote: null,
          providerCategory: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        })
        .run();

      const result = pruneOldData(db);
      expect(result.rawRunsDeleted).toBe(2);

      const remaining = db.select().from(scrapeRuns).all().map((row) => row.id);
      expect(remaining).toContain(latestSuccess);
      expect(remaining).toContain(running);
      expect(remaining).toContain(otp);
      expect(remaining).not.toContain(oldSuccess);
      expect(remaining).not.toContain(failed);

      const txn = db.select().from(transactions).where(eq(transactions.id, txnId)).get();
      expect(txn?.firstSeenRawId).toBeNull();
    });
  });

  it("removes expired sessions", () => {
    return openDb().then(async (db) => {
      const now = new Date().toISOString();
      const userId = randomUUID();
      const personId = randomUUID();
      db.insert(people)
        .values({
          id: personId,
          displayName: "Synth Person",
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(users)
        .values({
          id: userId,
          personId,
          username: "synth_user",
          passwordHash: "hash",
          mustChangePassword: false,
          totpSecretEncrypted: null,
          haUserId: null,
          pinHash: null,
          pinFailedCount: 0,
          pinLockedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(sessions)
        .values({
          id: randomUUID(),
          userId,
          tokenHash: "tok",
          createdAt: now,
          lastSeenAt: now,
          expiresAt: "2020-01-01T00:00:00.000Z",
        })
        .run();

      const result = pruneOldData(db);
      expect(result.sessionsDeleted).toBe(1);
      expect(db.select().from(sessions).all()).toHaveLength(0);
    });
  });
});
