import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  closeDb,
  eq,
  initDb,
  isEncryptedSqliteAvailable,
  resolveDbPath,
  runMigrations,
  users,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { clearDbKey, isDbKeyPresent } from "./db-key-handoff.js";
import { HA_PIN_FAIL_THRESHOLD, buildHaStatus, resetPassphraseThrottle, verifyUserPin } from "./ha-auth.js";
import { resetAllowedUsersCache } from "./ha-allowed-users.js";
import { keyslotsFilePath, readKeyslotFile } from "./ha-keyslots.js";
import { enrollHaUser, recoverHaVault, unlockHaVault } from "./ha-vault.js";

const OWNER = { haUserId: "ha-owner-id", haUsername: "owner" };
const PARTNER = { haUserId: "ha-partner-id", haUsername: "partner" };
const GUEST = { haUserId: "ha-guest-id", haUsername: "guest" };
const OWNER_PASS = "Synthetic horse battery staple 42";
const PARTNER_PASS = "Synthetic lamp river cloud 17";

function headersFor(identity: { haUserId: string; haUsername: string }): Headers {
  return new Headers({
    "x-remote-user-id": identity.haUserId,
    "x-remote-user-name": identity.haUsername,
  });
}

describe.skipIf(!isEncryptedSqliteAvailable())("ha vault enrollment and unlock", () => {
  let dataDir = "";
  const ENV_KEYS = [
    "MONEYTRACK_MODE",
    "MONEYTRACK_DATA_DIR",
    "MONEYTRACK_SHM_DB_KEY_PATH",
    "MONEYTRACK_ALLOWED_USERS",
  ] as const;
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const openDb = vi.fn(async (): Promise<MoneyTrackDb> => {
    const db = await initDb({ dataDir, skipGuards: true });
    runMigrations();
    return db;
  });

  function restart(): void {
    closeDb();
    clearDbKey();
    resetPassphraseThrottle();
  }

  async function status(identity: { haUserId: string; haUsername: string }, token?: string) {
    return (await buildHaStatus(headersFor(identity), token, openDb)).phase;
  }

  async function enroll(identity: typeof OWNER, passphrase: string, pin: string) {
    return enrollHaUser(identity, { passphrase, pin }, openDb);
  }

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-ha-vault-"));
    process.env.MONEYTRACK_MODE = "ha-addon";
    process.env.MONEYTRACK_DATA_DIR = dataDir;
    process.env.MONEYTRACK_SHM_DB_KEY_PATH = path.join(dataDir, "shm-db.key");
    process.env.MONEYTRACK_ALLOWED_USERS = JSON.stringify(["owner", "partner"]);
    resetAllowedUsersCache();
    resetPassphraseThrottle();
    openDb.mockClear();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(dataDir, { recursive: true, force: true });
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    resetAllowedUsersCache();
  });

  it("enrolls the first user on a fresh install without opening a DB first", async () => {
    expect(await status(OWNER)).toBe("enrollment_required");
    expect(openDb).not.toHaveBeenCalled();

    const result = await enroll(OWNER, OWNER_PASS, "482915");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recoveryKey?.length).toBeGreaterThanOrEqual(16);
    expect(isDbKeyPresent()).toBe(true);

    const file = readKeyslotFile();
    expect(file?.slots.map((slot) => slot.kind).sort()).toEqual(["passphrase", "recovery"]);
    expect(file?.slots.find((slot) => slot.kind === "passphrase")?.haUserId).toBe(OWNER.haUserId);

    const db = await openDb();
    const row = db.select().from(users).where(eq(users.haUserId, OWNER.haUserId)).get();
    expect(row?.id).toBe(result.userId);
    expect(row?.pinHash).toBeTruthy();
    const actions = db.select().from(auditLog).all().map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["ha_vault_created", "ha_enroll"]));

    expect(await status(OWNER, result.sessionToken)).toBe("unlocked");
    expect(await status(OWNER)).toBe("pin_required");
  }, 60_000);

  it("requires the passphrase after a restart, then the PIN", async () => {
    const enrolled = await enroll(OWNER, OWNER_PASS, "482915");
    expect(enrolled.ok).toBe(true);
    restart();
    openDb.mockClear();

    expect(await status(OWNER)).toBe("vault_locked");
    expect(openDb).not.toHaveBeenCalled();

    const wrong = await unlockHaVault(OWNER, "not the right passphrase", openDb);
    expect(wrong).toMatchObject({ ok: false, status: 401 });
    expect(isDbKeyPresent()).toBe(false);

    expect(await unlockHaVault(OWNER, OWNER_PASS, openDb)).toMatchObject({ ok: true });
    expect(isDbKeyPresent()).toBe(true);
    expect(await status(OWNER)).toBe("pin_required");
  }, 60_000);

  it("turns away users missing from allowed_users", async () => {
    expect(await status(GUEST)).toBe("no_access");
    expect(openDb).not.toHaveBeenCalled();
  });

  it("never replaces existing keyslots", async () => {
    expect((await enroll(OWNER, OWNER_PASS, "482915")).ok).toBe(true);
    const before = fs.readFileSync(keyslotsFilePath());

    expect(await enroll(OWNER, OWNER_PASS, "111111")).toMatchObject({ ok: false, code: "already_enrolled" });
    restart();
    expect(await enroll(PARTNER, PARTNER_PASS, "222222")).toMatchObject({ ok: false, code: "vault_locked" });
    expect(fs.readFileSync(keyslotsFilePath()).equals(before)).toBe(true);
  }, 60_000);

  it("creates one vault when the same enrollment is submitted twice at once", async () => {
    const results = await Promise.all([
      enroll(OWNER, OWNER_PASS, "482915"),
      enroll(OWNER, OWNER_PASS, "482915"),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ code: "already_enrolled" });
    expect(readKeyslotFile()?.slots).toHaveLength(2);
  }, 60_000);

  it("refuses to create a vault over a database it cannot open", async () => {
    fs.writeFileSync(resolveDbPath(dataDir), "synthetic existing database");
    expect(await enroll(OWNER, OWNER_PASS, "482915")).toMatchObject({
      ok: false,
      code: "database_without_keyslots",
    });
    expect(fs.existsSync(keyslotsFilePath())).toBe(false);
    expect(fs.readFileSync(resolveDbPath(dataDir), "utf8")).toBe("synthetic existing database");
  });

  it("lets a second user join while unlocked and unlock alone later", async () => {
    expect((await enroll(OWNER, OWNER_PASS, "482915")).ok).toBe(true);
    expect(await status(PARTNER)).toBe("enrollment_required");
    const joined = await enroll(PARTNER, PARTNER_PASS, "735102");
    expect(joined).toMatchObject({ ok: true, recoveryKey: null });

    restart();
    expect(await status(PARTNER)).toBe("vault_locked");
    expect(await unlockHaVault(PARTNER, OWNER_PASS, openDb)).toMatchObject({ ok: false, status: 401 });
    expect(await unlockHaVault(PARTNER, PARTNER_PASS, openDb)).toMatchObject({ ok: true });
    expect(await status(OWNER)).toBe("pin_required");
  }, 60_000);

  it("keeps a not-yet-enrolled second user out until someone unlocks", async () => {
    expect((await enroll(OWNER, OWNER_PASS, "482915")).ok).toBe(true);
    restart();
    expect(await status(PARTNER)).toBe("vault_locked");
    expect(await unlockHaVault(PARTNER, PARTNER_PASS, openDb)).toMatchObject({
      ok: false,
      code: "not_enrolled",
    });
  }, 60_000);

  it("asks for the passphrase after five wrong PINs", async () => {
    const enrolled = await enroll(OWNER, OWNER_PASS, "482915");
    if (!enrolled.ok) throw new Error("enroll failed");
    const db = await openDb();
    for (let i = 0; i < HA_PIN_FAIL_THRESHOLD; i += 1) {
      await verifyUserPin(db, enrolled.userId, "000000");
    }
    expect(await status(OWNER)).toBe("vault_locked");
    expect(await unlockHaVault(OWNER, OWNER_PASS, openDb)).toMatchObject({ ok: true });
    expect(await status(OWNER)).toBe("pin_required");
    expect(await verifyUserPin(db, enrolled.userId, "482915")).toEqual({ ok: true });
  }, 60_000);

  it("throttles passphrase guessing", async () => {
    expect((await enroll(OWNER, OWNER_PASS, "482915")).ok).toBe(true);
    restart();
    for (let i = 0; i < 5; i += 1) {
      await unlockHaVault(OWNER, `wrong synthetic guess ${i}`, openDb);
    }
    expect(await unlockHaVault(OWNER, OWNER_PASS, openDb)).toMatchObject({
      ok: false,
      status: 429,
      code: "passphrase_locked",
    });
    expect(isDbKeyPresent()).toBe(false);
  }, 120_000);

  it("unlocks with the recovery key and replaces the passphrase", async () => {
    const enrolled = await enroll(OWNER, OWNER_PASS, "482915");
    if (!enrolled.ok || !enrolled.recoveryKey) throw new Error("enroll failed");
    restart();

    const newPassphrase = "Synthetic replacement passphrase 9";
    const recovered = await recoverHaVault(
      OWNER,
      { recoveryKey: enrolled.recoveryKey, newPassphrase, newPin: "604213" },
      openDb,
    );
    expect(recovered).toMatchObject({ ok: true });
    if (!recovered.ok) return;
    expect(await status(OWNER, recovered.sessionToken)).toBe("unlocked");

    restart();
    expect(await unlockHaVault(OWNER, OWNER_PASS, openDb)).toMatchObject({ ok: false, status: 401 });
    expect(await unlockHaVault(OWNER, newPassphrase, openDb)).toMatchObject({ ok: true });
  }, 120_000);

  it("rejects a weak master passphrase before creating anything", async () => {
    expect(await enroll(OWNER, "Aa1!aaa", "482915")).toMatchObject({
      ok: false,
      code: "passphrase_too_short",
    });
    expect(await enroll(OWNER, "aa1!aaaa", "482915")).toMatchObject({
      ok: false,
      code: "passphrase_missing_classes",
    });
    expect(fs.existsSync(keyslotsFilePath())).toBe(false);
  });

  it("rejects a weak replacement passphrase on recovery", async () => {
    const enrolled = await enroll(OWNER, OWNER_PASS, "482915");
    if (!enrolled.ok || !enrolled.recoveryKey) throw new Error("enroll failed");
    restart();
    expect(
      await recoverHaVault(
        OWNER,
        { recoveryKey: enrolled.recoveryKey, newPassphrase: "AAAA1111!!!!", newPin: "604213" },
        openDb,
      ),
    ).toMatchObject({ ok: false, code: "passphrase_missing_classes" });
    expect(isDbKeyPresent()).toBe(false);
  }, 60_000);
});
