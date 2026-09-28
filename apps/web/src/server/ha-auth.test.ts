import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { eq, people, users } from "@moneytrack/db";
import { closeDb, initDb, runMigrations, isEncryptedSqliteAvailable, type MoneyTrackDb } from "@moneytrack/db";
import { hashPassword } from "./auth.js";
import {
  HA_PIN_FAIL_THRESHOLD,
  resolveHaPhase,
  verifyUserPin,
} from "./ha-auth.js";
import { writeDbKey } from "./db-key-handoff.js";
import { resetAllowedUsersCache } from "./ha-allowed-users.js";
import { writeKeyslotFile } from "./ha-keyslots.js";
import { KEYSLOT_FILE_VERSION } from "@moneytrack/crypto";

async function openHaDb(): Promise<{ db: MoneyTrackDb; dataDir: string; cleanup: () => void }> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-ha-auth-"));
  process.env.MONEYTRACK_DATA_DIR = dataDir;
  process.env.MONEYTRACK_SHM_DB_KEY_PATH = path.join(dataDir, "moneytrack-db.key");
  const key = randomBytes(32);
  closeDb();
  const db = await initDb({ dataDir, key, skipGuards: true });
  runMigrations();
  return {
    db,
    dataDir,
    cleanup: () => {
      closeDb();
      fs.rmSync(dataDir, { recursive: true, force: true });
      delete process.env.MONEYTRACK_DATA_DIR;
      delete process.env.MONEYTRACK_SHM_DB_KEY_PATH;
    },
  };
}

describe.skipIf(!isEncryptedSqliteAvailable())("ha auth", () => {
  let cleanup: (() => void) | undefined;
  const originalMode = process.env.MONEYTRACK_MODE;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    process.env.MONEYTRACK_MODE = originalMode;
  });

  it("resolves no_access for disallowed HA username", async () => {
    process.env.MONEYTRACK_MODE = "ha-addon";
    process.env.MONEYTRACK_ALLOWED_USERS = '["owner"]';
    resetAllowedUsersCache();
    const opened = await openHaDb();
    cleanup = opened.cleanup;
    const phase = resolveHaPhase(
      opened.db,
      { haUserId: "1", haUsername: "kid" },
      undefined,
    );
    expect(phase).toBe("no_access");
  });

  it("locks PIN after repeated failures", async () => {
    process.env.MONEYTRACK_MODE = "ha-addon";
    delete process.env.MONEYTRACK_ALLOWED_USERS;
    const opened = await openHaDb();
    cleanup = opened.cleanup;
    const userId = randomUUID();
    const personId = randomUUID();
    const now = new Date().toISOString();
    opened.db.insert(people).values({ id: personId, displayName: "U", isChild: false, createdAt: now, updatedAt: now }).run();
    opened.db.insert(users).values({
      id: userId,
      personId,
      username: "owner",
      passwordHash: await hashPassword("ValidPassword12!"),
      haUserId: "ha-1",
      pinHash: await hashPassword("123456"),
      pinFailedCount: 0,
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
    }).run();

    writeKeyslotFile({ version: KEYSLOT_FILE_VERSION, slots: [] });
    writeDbKey(randomBytes(32));

    for (let i = 0; i < HA_PIN_FAIL_THRESHOLD; i += 1) {
      const result = await verifyUserPin(opened.db, userId, "000000");
      expect(result.ok).toBe(false);
    }
    const row = opened.db.select().from(users).where(eq(users.id, userId)).get();
    expect(row?.pinLockedAt).toBeTruthy();
  });

  it("reports enrollment_required before keyslots exist", async () => {
    process.env.MONEYTRACK_MODE = "ha-addon";
    const opened = await openHaDb();
    cleanup = opened.cleanup;
    const phase = resolveHaPhase(
      opened.db,
      { haUserId: "ha-1", haUsername: "owner" },
      undefined,
    );
    expect(phase).toBe("enrollment_required");
  });
});
