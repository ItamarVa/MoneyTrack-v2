/**
 * HA add-on auth phases, PIN lockout, passphrase throttle, clear_lockouts
 * bootstrap, session binding. Before unlock the DB key does not exist in this
 * process, so the phase must come from keyslots.json + the shm key alone
 * (resolvePreUnlockPhase); only an unlocked vault may open the DB.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import type { HaLockPhase, HaStatusResponse } from "@moneytrack/contracts";
import { eq, loginAttempts, users, type MoneyTrackDb } from "@moneytrack/db";
import { isHaUsernameAllowed } from "@/server/ha-allowed-users";
import { readHaIdentity, type HaIngressIdentity } from "@/server/ha-identity";
import { readKeyslotFile, removeUserKeyslot } from "@/server/ha-keyslots";
import {
  clearLockoutsNoncePath,
  readHaState,
  writeHaState,
} from "@/server/ha-state";
import { isDbKeyPresent } from "@/server/db-key-handoff";
import { getServerDb } from "@/server/db";
import {
  deleteSession,
  getSessionUser,
  hashPassword,
  invalidateUserSessions,
  verifyPassword,
  writeAudit,
} from "@/server/auth";
import { haImportAvailableForStatus } from "@/server/import";
import { isHaAddonMode } from "@/server/runtime-mode";

export const HA_PIN_IDLE_MS = 15 * 60 * 1000;
export const HA_PIN_FAIL_THRESHOLD = 5;
export const HA_PASSPHRASE_FAIL_LIMIT = 5;
const HA_PASSPHRASE_WINDOW_MS = 15 * 60 * 1000;

let clearLockoutsBootstrapped = false;

export function maybeApplyClearLockouts(db: MoneyTrackDb): void {
  if (!isHaAddonMode() || clearLockoutsBootstrapped) {
    return;
  }
  clearLockoutsBootstrapped = true;

  const enabled = process.env.MONEYTRACK_CLEAR_LOCKOUTS === "1";
  const nonce = process.env.MONEYTRACK_CLEAR_LOCKOUTS_NONCE?.trim() ?? "addon-clear-lockouts-v1";
  const state = readHaState();
  if (!enabled) {
    // The add-on never sets a nonce, so forget the applied one once the option
    // is off again; otherwise clear_lockouts would work only once, ever.
    if (state.clearLockoutsAppliedNonce) {
      writeHaState({ clearLockoutsAppliedNonce: undefined });
    }
    return;
  }

  if (state.clearLockoutsAppliedNonce === nonce) {
    return;
  }

  db.delete(loginAttempts).run();
  const now = new Date().toISOString();
  for (const row of db.select().from(users).all()) {
    if (row.pinFailedCount > 0 || row.pinLockedAt) {
      db.update(users)
        .set({ pinFailedCount: 0, pinLockedAt: null, updatedAt: now })
        .where(eq(users.id, row.id))
        .run();
    }
  }

  writeHaState({ clearLockoutsAppliedNonce: nonce });
  fs.writeFileSync(clearLockoutsNoncePath(), `${nonce}\n`, { encoding: "utf8", mode: 0o600 });
  writeAudit(db, "ha_clear_lockouts", null, { nonce });
}

function findUserByHaId(db: MoneyTrackDb, haUserId: string) {
  return db.select().from(users).where(eq(users.haUserId, haUserId)).get();
}

/**
 * Phase decided without the DB. Null means the vault is unlocked (key in shm)
 * and the DB must decide. A user without a slot while the vault is locked gets
 * vault_locked too: only an enrolled user's passphrase can unlock (ADR-008).
 */
export function resolvePreUnlockPhase(identity: HaIngressIdentity | null): HaLockPhase | null {
  if (!identity || !isHaUsernameAllowed(identity.haUsername)) {
    return "no_access";
  }
  if (!readKeyslotFile()) {
    return "enrollment_required";
  }
  if (!isDbKeyPresent()) {
    return "vault_locked";
  }
  return null;
}

export function resolveHaPhase(
  db: MoneyTrackDb,
  identity: HaIngressIdentity | null,
  sessionToken: string | undefined,
): HaLockPhase {
  const preUnlock = resolvePreUnlockPhase(identity);
  if (preUnlock || !identity) {
    return preUnlock ?? "no_access";
  }

  const user = findUserByHaId(db, identity.haUserId);
  if (!user?.pinHash) {
    return "enrollment_required";
  }

  // Five wrong PINs require the master passphrase again (ADR-008).
  if (user.pinLockedAt) {
    return "vault_locked";
  }

  const session = getSessionUser(db, sessionToken, { idleMs: HA_PIN_IDLE_MS });
  if (!session || session.user.id !== user.id) {
    return "pin_required";
  }

  return "unlocked";
}

export function assertSessionMatchesHaUser(
  db: MoneyTrackDb,
  sessionToken: string | undefined,
  identity: HaIngressIdentity,
): boolean {
  const session = getSessionUser(db, sessionToken, { idleMs: HA_PIN_IDLE_MS, touch: false });
  if (!session) {
    return false;
  }
  const user = db.select().from(users).where(eq(users.id, session.user.id)).get();
  if (!user?.haUserId || user.haUserId !== identity.haUserId) {
    if (sessionToken) {
      deleteSession(db, sessionToken);
    }
    return false;
  }
  return true;
}

/** Opens the DB (via openDb) only when the vault is already unlocked. */
export async function buildHaStatus(
  headers: Headers,
  sessionToken: string | undefined,
  openDb: () => Promise<MoneyTrackDb> = getServerDb,
): Promise<HaStatusResponse> {
  const identity = readHaIdentity(headers);
  const preUnlock = resolvePreUnlockPhase(identity);
  let phase: HaLockPhase;
  let user: ReturnType<typeof findUserByHaId> = undefined;
  if (preUnlock || !identity) {
    phase = preUnlock ?? "no_access";
  } else {
    const db = await openDb();
    maybeApplyClearLockouts(db);
    phase = resolveHaPhase(db, identity, sessionToken);
    user = findUserByHaId(db, identity.haUserId);
  }
  const state = readHaState();

  return {
    mode: "ha-addon",
    phase,
    haUserId: identity?.haUserId ?? null,
    haUsername: identity?.haUsername ?? null,
    userId: user?.id ?? null,
    pinLocked: Boolean(user?.pinLockedAt),
    pinFailedCount: user?.pinFailedCount ?? 0,
    idleRelockMinutes: Math.floor(HA_PIN_IDLE_MS / 60_000),
    recoveryKeyAcknowledged: state.recoveryKeyAcknowledged,
    importAvailable: haImportAvailableForStatus(),
  };
}

export async function verifyUserPin(
  db: MoneyTrackDb,
  userId: string,
  pin: string,
): Promise<{ ok: true } | { ok: false; locked: boolean }> {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user?.pinHash) {
    return { ok: false, locked: false };
  }
  if (user.pinLockedAt) {
    return { ok: false, locked: true };
  }

  const valid = await verifyPassword(pin, user.pinHash);
  const now = new Date().toISOString();

  if (valid) {
    db.update(users)
      .set({ pinFailedCount: 0, pinLockedAt: null, updatedAt: now })
      .where(eq(users.id, userId))
      .run();
    return { ok: true };
  }

  const failed = user.pinFailedCount + 1;
  const locked = failed >= HA_PIN_FAIL_THRESHOLD;
  db.update(users)
    .set({
      pinFailedCount: failed,
      pinLockedAt: locked ? now : null,
      updatedAt: now,
    })
    .where(eq(users.id, userId))
    .run();

  writeAudit(db, "ha_pin_failed", userId, { failedCount: failed, locked });
  return { ok: false, locked };
}

export async function setUserPin(db: MoneyTrackDb, userId: string, pin: string): Promise<void> {
  const pinHash = await hashPassword(pin);
  const now = new Date().toISOString();
  db.update(users)
    .set({
      pinHash,
      pinFailedCount: 0,
      pinLockedAt: null,
      updatedAt: now,
    })
    .where(eq(users.id, userId))
    .run();
}

// ponytail: in memory because failed unlocks happen before the DB can be opened;
// an add-on restart (HA admin only) resets it. Persist beside keyslots.json if
// non-admin restarts ever become possible.
const passphraseFailures = new Map<string, number[]>();

function recentPassphraseFailures(haUserId: string): number[] {
  const cutoff = Date.now() - HA_PASSPHRASE_WINDOW_MS;
  const recent = (passphraseFailures.get(haUserId) ?? []).filter((at) => at > cutoff);
  passphraseFailures.set(haUserId, recent);
  return recent;
}

/** Seconds until the next passphrase or recovery-key attempt is allowed; 0 when open. */
export function passphraseRetryAfterSeconds(haUserId: string): number {
  const recent = recentPassphraseFailures(haUserId);
  if (recent.length < HA_PASSPHRASE_FAIL_LIMIT) {
    return 0;
  }
  return Math.max(1, Math.ceil((recent[0]! + HA_PASSPHRASE_WINDOW_MS - Date.now()) / 1000));
}

/** Returns how many failures preceded this attempt (for the audit entry). */
export function recordPassphraseResult(haUserId: string, success: boolean): number {
  const prior = recentPassphraseFailures(haUserId).length;
  if (success) {
    passphraseFailures.delete(haUserId);
  } else {
    passphraseFailures.get(haUserId)!.push(Date.now());
  }
  return prior;
}

export function resetPassphraseThrottle(): void {
  passphraseFailures.clear();
}

export async function resetHaUserCredentials(
  db: MoneyTrackDb,
  targetUserId: string,
  actorUserId: string,
  reason?: string,
): Promise<void> {
  const now = new Date().toISOString();
  invalidateUserSessions(db, targetUserId);
  db.update(users)
    .set({
      pinHash: null,
      pinFailedCount: 0,
      pinLockedAt: null,
      passwordHash: await hashPassword(`reset-${randomUUID()}`),
      mustChangePassword: false,
      updatedAt: now,
    })
    .where(eq(users.id, targetUserId))
    .run();
  removeUserKeyslot(targetUserId);
  writeAudit(db, "ha_user_reset", actorUserId, { targetUserId, reason });
}
