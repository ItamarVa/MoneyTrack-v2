/**
 * HA add-on vault flows that run before or while the DB is locked: first
 * enrollment (creates the DB key, keyslots and DB), a second user joining an
 * unlocked vault, passphrase unlock and recovery-key unlock (ADR-007/008).
 * Invariants: the DB is opened only after the key sits in shm; keyslots.json and
 * a pre-existing DB are never overwritten; keyslot writes are serialized.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import {
  HA_PASSPHRASE_MAX_LENGTH,
  HA_PASSPHRASE_MIN_LENGTH,
  missingHaPassphraseRequirements,
} from "@moneytrack/contracts";
import { checkPassword } from "@moneytrack/crypto";
import { haDenylistRejection } from "@/server/ha-passphrase-denylist";
import { eq, people, resolveDbPath, users, type MoneyTrackDb } from "@moneytrack/db";
import {
  createSession,
  createSessionToken,
  hashPassword,
  writeAudit,
} from "@/server/auth";
import { clearDbKey, isDbKeyPresent, readDbKey, writeDbKey } from "@/server/db-key-handoff";
import { getServerDb, resetServerDb } from "@/server/db";
import {
  passphraseRetryAfterSeconds,
  recordPassphraseResult,
} from "@/server/ha-auth";
import type { HaIngressIdentity } from "@/server/ha-identity";
import {
  KeyslotsExistError,
  createVaultKeyslots,
  findUserSlot,
  keyslotsFilePath,
  readKeyslotFile,
  setUserKeyslot,
  unwrapRecoverySlot,
  unwrapUserSlot,
} from "@/server/ha-keyslots";
import { writeHaState } from "@/server/ha-state";

export type VaultFailure = {
  ok: false;
  status: number;
  code: string;
  error: string;
  retryAfterSeconds?: number;
};

export type OpenDb = () => Promise<MoneyTrackDb>;

function fail(status: number, code: string, error: string, retryAfterSeconds?: number): VaultFailure {
  return { ok: false, status, code, error, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) };
}

let vaultChain: Promise<unknown> = Promise.resolve();

/** One keyslot writer at a time: double submits and two users enrolling at once queue here. */
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = vaultChain.then(task, task);
  vaultChain = run.catch(() => undefined);
  return run;
}

function findUserByHaId(db: MoneyTrackDb, haUserId: string) {
  return db.select().from(users).where(eq(users.haUserId, haUserId)).get();
}

/** Every path that sets a master passphrase goes through here (ADR-008). */
export function checkHaPassphrase(passphrase: string, haUsername: string): VaultFailure | null {
  if (passphrase.length > HA_PASSPHRASE_MAX_LENGTH) {
    return fail(400, "passphrase_too_long", `Master password must be at most ${HA_PASSPHRASE_MAX_LENGTH} characters`);
  }
  const missing = missingHaPassphraseRequirements(passphrase);
  if (missing.includes("length")) {
    return fail(400, "passphrase_too_short", `Master password must be at least ${HA_PASSPHRASE_MIN_LENGTH} characters`);
  }
  if (missing.length > 0) {
    return fail(
      400,
      "passphrase_missing_classes",
      `Master password needs a lowercase letter, an uppercase letter, a digit and a special character (missing: ${missing.join(", ")})`,
    );
  }
  const policy = checkPassword(passphrase, { username: haUsername });
  const reason = policy.ok ? haDenylistRejection(passphrase, haUsername) : policy.reason;
  return reason ? fail(400, reason, "Master password rejected") : null;
}

function removeCreatedVaultFiles(): void {
  resetServerDb();
  clearDbKey();
  const dbPath = resolveDbPath();
  for (const file of [keyslotsFilePath(), dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    fs.rmSync(file, { force: true });
  }
}

async function createHousehold(
  identity: HaIngressIdentity,
  passphrase: string,
  pin: string,
  openDb: OpenDb,
) {
  if (fs.existsSync(resolveDbPath())) {
    // Nobody can open a DB whose keyslots are gone; keep it for a restore.
    return fail(
      409,
      "database_without_keyslots",
      "A database exists but keyslots.json is missing. Restore /data from a backup.",
    );
  }

  const userId = randomUUID();
  let created: { recoveryKey: string; dbKey: Buffer };
  try {
    created = await createVaultKeyslots(userId, identity.haUserId, passphrase);
  } catch (error) {
    if (error instanceof KeyslotsExistError) {
      return fail(409, "vault_exists", "The household vault already exists");
    }
    throw error;
  }

  try {
    writeDbKey(created.dbKey);
    const db = await openDb();
    const [passwordHash, pinHash] = await Promise.all([hashPassword(passphrase), hashPassword(pin)]);
    const now = new Date().toISOString();
    const personId = randomUUID();
    db.transaction((tx) => {
      tx.insert(people)
        .values({ id: personId, displayName: identity.haUsername, isChild: false, createdAt: now, updatedAt: now })
        .run();
      tx.insert(users)
        .values({
          id: userId,
          personId,
          username: identity.haUsername,
          passwordHash,
          haUserId: identity.haUserId,
          pinHash,
          mustChangePassword: false,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    });
    writeHaState({ recoveryKeyAcknowledged: true });
    const sessionToken = createSessionToken();
    createSession(db, userId, sessionToken);
    writeAudit(db, "ha_vault_created", userId, { haUserId: identity.haUserId });
    writeAudit(db, "ha_enroll", userId, { haUserId: identity.haUserId, firstUser: true });
    return { ok: true as const, userId, recoveryKey: created.recoveryKey as string | null, sessionToken };
  } catch (error) {
    // Everything here was created by this request and holds no user data yet.
    removeCreatedVaultFiles();
    throw error;
  }
}

async function joinHousehold(
  identity: HaIngressIdentity,
  passphrase: string,
  pin: string,
  openDb: OpenDb,
) {
  const dbKey = readDbKey();
  if (!dbKey) {
    return fail(403, "vault_locked", "The vault is locked. An enrolled user must unlock it first.");
  }
  const db = await openDb();
  const existing = findUserByHaId(db, identity.haUserId);
  if (existing?.pinHash) {
    return fail(409, "already_enrolled", "Already enrolled");
  }

  const userId = existing?.id ?? randomUUID();
  await setUserKeyslot(userId, identity.haUserId, passphrase, dbKey);
  const [passwordHash, pinHash] = await Promise.all([hashPassword(passphrase), hashPassword(pin)]);
  const now = new Date().toISOString();
  db.transaction((tx) => {
    if (existing) {
      tx.update(users)
        .set({ passwordHash, pinHash, pinFailedCount: 0, pinLockedAt: null, updatedAt: now })
        .where(eq(users.id, userId))
        .run();
      return;
    }
    const personId = randomUUID();
    tx.insert(people)
      .values({ id: personId, displayName: identity.haUsername, isChild: false, createdAt: now, updatedAt: now })
      .run();
    tx.insert(users)
      .values({
        id: userId,
        personId,
        username: identity.haUsername,
        passwordHash,
        haUserId: identity.haUserId,
        pinHash,
        mustChangePassword: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
  const sessionToken = createSessionToken();
  createSession(db, userId, sessionToken);
  writeAudit(db, "ha_enroll", userId, { haUserId: identity.haUserId, firstUser: false });
  return { ok: true as const, userId, recoveryKey: null as string | null, sessionToken };
}

/** First user creates the vault; later users join while it is unlocked. */
export function enrollHaUser(
  identity: HaIngressIdentity,
  input: { passphrase: string; pin: string },
  openDb: OpenDb = getServerDb,
) {
  const rejected = checkHaPassphrase(input.passphrase, identity.haUsername);
  if (rejected) {
    return Promise.resolve(rejected);
  }
  return serialized(() =>
    readKeyslotFile()
      ? joinHousehold(identity, input.passphrase, input.pin, openDb)
      : createHousehold(identity, input.passphrase, input.pin, openDb),
  );
}

async function auditIfUnlocked(openDb: OpenDb, action: string, haUserId: string): Promise<void> {
  if (!isDbKeyPresent()) {
    return;
  }
  const db = await openDb();
  writeAudit(db, action, findUserByHaId(db, haUserId)?.id ?? null, { haUserId });
}

/**
 * Unwraps this HA user's own slot and hands the key to shm (agent and web).
 * Also the way back after five wrong PINs, since that clears the PIN lock.
 */
export async function unlockHaVault(
  identity: HaIngressIdentity,
  passphrase: string,
  openDb: OpenDb = getServerDb,
) {
  const file = readKeyslotFile();
  if (!file) {
    return fail(409, "enrollment_required", "The household vault does not exist yet");
  }
  if (!findUserSlot(file, identity.haUserId)) {
    return fail(
      403,
      "not_enrolled",
      "This user is not enrolled yet. An enrolled user must unlock first; then enroll.",
    );
  }
  const retryAfter = passphraseRetryAfterSeconds(identity.haUserId);
  if (retryAfter) {
    return fail(429, "passphrase_locked", "Too many failed master password attempts", retryAfter);
  }

  const unwrapped = await unwrapUserSlot(identity.haUserId, passphrase);
  const failedBefore = recordPassphraseResult(identity.haUserId, Boolean(unwrapped));
  if (!unwrapped) {
    await auditIfUnlocked(openDb, "ha_unlock_failed", identity.haUserId);
    return fail(401, "auth_failed", "Invalid master password");
  }

  writeDbKey(unwrapped.dbKey);
  const db = await openDb();
  const user = findUserByHaId(db, identity.haUserId);
  if (!user || user.id !== unwrapped.userId) {
    return fail(409, "not_enrolled", "The keyslot does not match an enrolled user");
  }
  db.update(users)
    .set({ pinFailedCount: 0, pinLockedAt: null, updatedAt: new Date().toISOString() })
    .where(eq(users.id, user.id))
    .run();
  writeAudit(db, "ha_unlock", user.id, { haUserId: identity.haUserId, failedBefore });
  return { ok: true as const, userId: user.id };
}

/** Recovery key unlocks the vault and replaces this user's passphrase and PIN. */
export async function recoverHaVault(
  identity: HaIngressIdentity,
  input: { recoveryKey: string; newPassphrase: string; newPin: string },
  openDb: OpenDb = getServerDb,
) {
  const rejected = checkHaPassphrase(input.newPassphrase, identity.haUsername);
  if (rejected) {
    return rejected;
  }
  if (!readKeyslotFile()) {
    return fail(409, "enrollment_required", "The household vault does not exist yet");
  }
  const retryAfter = passphraseRetryAfterSeconds(identity.haUserId);
  if (retryAfter) {
    return fail(429, "passphrase_locked", "Too many failed attempts", retryAfter);
  }

  const dbKey = await unwrapRecoverySlot(input.recoveryKey);
  const failedBefore = recordPassphraseResult(identity.haUserId, Boolean(dbKey));
  if (!dbKey) {
    await auditIfUnlocked(openDb, "ha_recovery_failed", identity.haUserId);
    return fail(401, "auth_failed", "Invalid recovery key");
  }

  writeDbKey(dbKey);
  const db = await openDb();
  const user = findUserByHaId(db, identity.haUserId);
  if (!user) {
    return fail(403, "not_enrolled", "The vault is unlocked, but this user is not enrolled yet. Enroll now.");
  }
  return serialized(async () => {
    await setUserKeyslot(user.id, identity.haUserId, input.newPassphrase, dbKey);
    const [passwordHash, pinHash] = await Promise.all([
      hashPassword(input.newPassphrase),
      hashPassword(input.newPin),
    ]);
    db.update(users)
      .set({ passwordHash, pinHash, pinFailedCount: 0, pinLockedAt: null, updatedAt: new Date().toISOString() })
      .where(eq(users.id, user.id))
      .run();
    const sessionToken = createSessionToken();
    createSession(db, user.id, sessionToken);
    writeAudit(db, "ha_recovery_unlock", user.id, { haUserId: identity.haUserId, failedBefore });
    return { ok: true as const, userId: user.id, sessionToken };
  });
}

/** Passphrase re-check for sensitive changes (PIN update); same throttle as unlock. */
export async function verifyHaPassphrase(identity: HaIngressIdentity, passphrase: string) {
  const retryAfter = passphraseRetryAfterSeconds(identity.haUserId);
  if (retryAfter) {
    return fail(429, "passphrase_locked", "Too many failed master password attempts", retryAfter);
  }
  const unwrapped = await unwrapUserSlot(identity.haUserId, passphrase);
  recordPassphraseResult(identity.haUserId, Boolean(unwrapped));
  return unwrapped
    ? { ok: true as const, userId: unwrapped.userId }
    : fail(401, "auth_failed", "Invalid master password");
}
