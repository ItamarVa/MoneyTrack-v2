import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { eq, auditLog, loginAttempts, sessions, users, type MoneyTrackDb } from "@moneytrack/db";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { isHaAddonMode } from "@/server/runtime-mode";

export { SESSION_COOKIE };
const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const ADDRESS_THRESHOLD = 20;

export const ARGON2_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return verify(passwordHash, password, ARGON2_OPTIONS);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

export function recordLoginAttempt(
  db: MoneyTrackDb,
  username: string,
  success: boolean,
  ipAddress: string | null,
): void {
  db.insert(loginAttempts).values({
    id: randomUUID(),
    username,
    success,
    ipAddress,
    attemptedAt: nowIso(),
  }).run();
}

/**
 * Counting failures inside a rolling window (rather than extending a deadline
 * from the newest failure) means a locked-out account always recovers after
 * LOCKOUT_WINDOW_MS and cannot be held down indefinitely.
 */
function recentFailureCount(
  db: MoneyTrackDb,
  column: typeof loginAttempts.username | typeof loginAttempts.ipAddress,
  value: string,
): number {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
  return db
    .select()
    .from(loginAttempts)
    .where(eq(column, value))
    .all()
    .filter((row) => !row.success && row.attemptedAt >= since).length;
}

export function isLoginLocked(db: MoneyTrackDb, username: string): boolean {
  return recentFailureCount(db, loginAttempts.username, username) >= LOCKOUT_THRESHOLD;
}

/**
 * A second limit keyed on the caller's address, so one noisy source cannot lock
 * every household account in turn by cycling through usernames.
 */
export function isAddressThrottled(db: MoneyTrackDb, ip: string | null): boolean {
  if (!ip) {
    return false;
  }
  return recentFailureCount(db, loginAttempts.ipAddress, ip) >= ADDRESS_THRESHOLD;
}

/**
 * Seconds until the oldest failure in the rolling window ages out and the
 * lockout/throttle lifts. Returns 0 when nothing in the window blocks access.
 */
export function lockoutRetryAfterSeconds(
  db: MoneyTrackDb,
  column: typeof loginAttempts.username | typeof loginAttempts.ipAddress,
  value: string,
): number {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
  const oldestFailureMs = db
    .select()
    .from(loginAttempts)
    .where(eq(column, value))
    .all()
    .filter((row) => !row.success && row.attemptedAt >= since)
    .reduce<number | null>((oldest, row) => {
      const attemptedMs = new Date(row.attemptedAt).getTime();
      return oldest === null || attemptedMs < oldest ? attemptedMs : oldest;
    }, null);

  if (oldestFailureMs === null) {
    return 0;
  }

  const unlockAtMs = oldestFailureMs + LOCKOUT_WINDOW_MS;
  return Math.max(0, Math.ceil((unlockAtMs - Date.now()) / 1000));
}

export function createSession(
  db: MoneyTrackDb,
  userId: string,
  token: string,
): { id: string; expiresAt: string } {
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + ABSOLUTE_MS).toISOString();
  const id = randomUUID();
  db.insert(sessions).values({
    id,
    userId,
    tokenHash: hashSessionToken(token),
    createdAt,
    lastSeenAt: createdAt,
    expiresAt,
  }).run();
  return { id, expiresAt };
}

export function invalidateUserSessions(db: MoneyTrackDb, userId: string): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

export type GetSessionUserOptions = {
  idleMs?: number;
  /** When false, lastSeenAt is not bumped (HA identity binding checks). */
  touch?: boolean;
};

export function getSessionUser(
  db: MoneyTrackDb,
  token: string | undefined,
  options: GetSessionUserOptions = {},
): {
  sessionId: string;
  user: {
    id: string;
    username: string;
    personId: string;
    mustChangePassword: boolean;
  };
} | null {
  if (!token) {
    return null;
  }
  const idleMs = options.idleMs ?? IDLE_MS;
  const touch = options.touch ?? true;
  const tokenHash = hashSessionToken(token);
  const session = db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .get();
  if (!session) {
    return null;
  }

  const expiresAt = new Date(session.expiresAt).getTime();
  if (Date.now() > expiresAt) {
    db.delete(sessions).where(eq(sessions.id, session.id)).run();
    return null;
  }

  const idleLimit = new Date(session.lastSeenAt).getTime() + idleMs;
  if (Date.now() > idleLimit) {
    db.delete(sessions).where(eq(sessions.id, session.id)).run();
    return null;
  }

  const user = db.select().from(users).where(eq(users.id, session.userId)).get();
  if (!user) {
    return null;
  }

  if (touch) {
    db.update(sessions)
      .set({ lastSeenAt: nowIso() })
      .where(eq(sessions.id, session.id)).run();
  }

  return {
    sessionId: session.id,
    user: {
      id: user.id,
      username: user.username,
      personId: user.personId,
      mustChangePassword: user.mustChangePassword,
    },
  };
}

export function deleteSession(db: MoneyTrackDb, token: string): void {
  db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token))).run();
}

export function writeAudit(
  db: MoneyTrackDb,
  action: string,
  userId: string | null,
  metadata?: Record<string, unknown>,
): void {
  db.insert(auditLog).values({
    id: randomUUID(),
    userId,
    action,
    resourceType: null,
    resourceId: null,
    metadata: metadata ? JSON.stringify(metadata) : null,
    createdAt: nowIso(),
  }).run();
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Pass `request` from HA add-on routes: behind ingress the app only sees plain
 * HTTP from the Supervisor, so the browser's Origin is the only hint of its
 * scheme. On an http:// HA URL browsers drop a Secure cookie and every PIN
 * entry loops back to the PIN screen.
 */
export function sessionCookieOptions(request?: Request): {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: string;
  maxAge: number;
} {
  const httpHaOrigin =
    isHaAddonMode() && Boolean(request?.headers.get("origin")?.startsWith("http:"));
  return {
    httpOnly: true,
    secure: process.env.MONEYTRACK_INSECURE_COOKIES !== "1" && !httpHaOrigin,
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(ABSOLUTE_MS / 1000),
  };
}
