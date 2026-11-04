import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { eq, loginAttempts, people, sessions, users } from "@moneytrack/db";
import { isEncryptedSqliteAvailable } from "@moneytrack/db";
import { closeDb, initDb, runMigrations, type MoneyTrackDb } from "@moneytrack/db";
import {
  ARGON2_OPTIONS,
  createSession,
  createSessionToken,
  getSessionUser,
  hashPassword,
  hashSessionToken,
  invalidateUserSessions,
  isAddressThrottled,
  isLoginLocked,
  lockoutRetryAfterSeconds,
  recordLoginAttempt,
  sessionCookieOptions,
} from "./auth.js";


async function openAuthDb(): Promise<{ db: MoneyTrackDb; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-auth-sec-"));
  const key = randomBytes(32);
  closeDb();
  const db = await initDb({ dataDir: tmpDir, key, skipGuards: true });
  runMigrations();
  const personId = randomUUID();
  const userId = randomUUID();
  const now = new Date().toISOString();
  db.insert(people).values({ id: personId, displayName: "Test", isChild: false, createdAt: now, updatedAt: now }).run();
  db.insert(users).values({
    id: userId,
    personId,
    username: "testuser",
    passwordHash: await hashPassword("ValidPassword12!"),
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
  }).run();
  return {
    db,
    cleanup: () => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

describe.skipIf(!isEncryptedSqliteAvailable())("auth security", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("uses Argon2id at or above the configured floor", async () => {
    const opened = await openAuthDb();
    cleanup = opened.cleanup;
    expect(ARGON2_OPTIONS.memoryCost).toBeGreaterThanOrEqual(65536);
    expect(ARGON2_OPTIONS.timeCost).toBeGreaterThanOrEqual(3);
    const hash = await hashPassword("ValidPassword12!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("issues 256-bit session tokens stored hashed", async () => {
    const opened = await openAuthDb();
    cleanup = opened.cleanup;
    const token = createSessionToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    createSession(opened.db, opened.db.select().from(users).get()!.id, token);
    const row = opened.db.select().from(sessions).get();
    expect(row?.tokenHash).toBe(hashSessionToken(token));
    expect(row?.tokenHash).not.toBe(token);
  });

  it("sets strict session cookie flags", () => {
    const opts = sessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("strict");
    expect(opts.path).toBe("/");
    if (process.env.MONEYTRACK_INSECURE_COOKIES !== "1") {
      expect(opts.secure).toBe(true);
    }
  });

  it("drops Secure only for an http:// origin in HA add-on mode", () => {
    const previousMode = process.env.MONEYTRACK_MODE;
    const previousInsecure = process.env.MONEYTRACK_INSECURE_COOKIES;
    delete process.env.MONEYTRACK_INSECURE_COOKIES;
    const from = (origin: string) => new Request("http://127.0.0.1:3100/api/ha/pin", { headers: { origin } });
    try {
      process.env.MONEYTRACK_MODE = "ha-addon";
      expect(sessionCookieOptions(from("http://192.168.1.10:8123")).secure).toBe(false);
      expect(sessionCookieOptions(from("https://home.example.com")).secure).toBe(true);
      expect(sessionCookieOptions().secure).toBe(true);
      process.env.MONEYTRACK_MODE = "dev";
      expect(sessionCookieOptions(from("http://192.168.1.10:8123")).secure).toBe(true);
    } finally {
      if (previousMode === undefined) delete process.env.MONEYTRACK_MODE;
      else process.env.MONEYTRACK_MODE = previousMode;
      if (previousInsecure !== undefined) process.env.MONEYTRACK_INSECURE_COOKIES = previousInsecure;
    }
  });

  it("locks out after repeated failures", async () => {
    const opened = await openAuthDb();
    cleanup = opened.cleanup;
    for (let i = 0; i < 5; i += 1) {
      recordLoginAttempt(opened.db, "testuser", false, "127.0.0.1");
    }
    expect(isLoginLocked(opened.db, "testuser")).toBe(true);
  });

  it("releases the lockout once the failures age out of the window", async () => {
    const opened = await openAuthDb();
    cleanup = opened.cleanup;
    const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    for (let i = 0; i < 8; i += 1) {
      opened.db.insert(loginAttempts).values({
        id: randomUUID(),
        username: "testuser",
        success: false,
        ipAddress: "127.0.0.1",
        attemptedAt: stale,
      }).run();
    }
    expect(isLoginLocked(opened.db, "testuser")).toBe(false);
  });

  it("throttles one address that cycles through many usernames", async () => {
    const opened = await openAuthDb();
    cleanup = opened.cleanup;
    for (let i = 0; i < 20; i += 1) {
      recordLoginAttempt(opened.db, `victim${i}`, false, "10.0.0.9");
    }
    expect(isAddressThrottled(opened.db, "10.0.0.9")).toBe(true);
    expect(isAddressThrottled(opened.db, "10.0.0.8")).toBe(false);
    expect(isAddressThrottled(opened.db, null)).toBe(false);
    // No single username crossed its own threshold.
    expect(isLoginLocked(opened.db, "victim0")).toBe(false);
  });

  it("rejects unknown session tokens", async () => {
    const opened = await openAuthDb();
    cleanup = opened.cleanup;
    expect(getSessionUser(opened.db, undefined)).toBeNull();
    expect(getSessionUser(opened.db, createSessionToken())).toBeNull();
  });

  it("invalidates all sessions on password change path", async () => {
    const opened = await openAuthDb();
    cleanup = opened.cleanup;
    const user = opened.db.select().from(users).get()!;
    createSession(opened.db, user.id, createSessionToken());
    createSession(opened.db, user.id, createSessionToken());
    expect(opened.db.select().from(sessions).all()).toHaveLength(2);
    invalidateUserSessions(opened.db, user.id);
    expect(opened.db.select().from(sessions).where(eq(sessions.userId, user.id)).all()).toHaveLength(0);
  });

  it("clears expired sessions on lookup", async () => {
    const opened = await openAuthDb();
    cleanup = opened.cleanup;
    const user = opened.db.select().from(users).get()!;
    const token = createSessionToken();
    const id = randomUUID();
    const past = new Date(Date.now() - 60_000).toISOString();
    opened.db.insert(sessions).values({
      id,
      userId: user.id,
      tokenHash: hashSessionToken(token),
      createdAt: past,
      lastSeenAt: past,
      expiresAt: past,
    }).run();
    expect(getSessionUser(opened.db, token)).toBeNull();
    expect(opened.db.select().from(sessions).where(eq(sessions.id, id)).get()).toBeUndefined();
  });

  it("records login attempts for audit", async () => {
    const opened = await openAuthDb();
    cleanup = opened.cleanup;
    recordLoginAttempt(opened.db, "testuser", true, "127.0.0.1");
    const rows = opened.db.select().from(loginAttempts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.success).toBe(true);
  });

  it("returns zero retry when no failures are in the lockout window", async () => {
    const opened = await openAuthDb();
    cleanup = opened.cleanup;
    expect(lockoutRetryAfterSeconds(opened.db, loginAttempts.username, "testuser")).toBe(0);
    expect(lockoutRetryAfterSeconds(opened.db, loginAttempts.ipAddress, "127.0.0.1")).toBe(0);
  });

  it("computes retryAfter from the oldest failure in the rolling window", async () => {
    const opened = await openAuthDb();
    cleanup = opened.cleanup;
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    for (const attemptedAt of [tenMinutesAgo, fiveMinutesAgo]) {
      opened.db.insert(loginAttempts).values({
        id: randomUUID(),
        username: "testuser",
        success: false,
        ipAddress: "127.0.0.1",
        attemptedAt,
      }).run();
    }
    const retry = lockoutRetryAfterSeconds(opened.db, loginAttempts.username, "testuser");
    expect(retry).toBeGreaterThan(4 * 60);
    expect(retry).toBeLessThanOrEqual(5 * 60 + 2);
  });

  it("computes ip throttle retryAfter from the oldest address failure", async () => {
    const opened = await openAuthDb();
    cleanup = opened.cleanup;
    const twelveMinutesAgo = new Date(Date.now() - 12 * 60 * 1000).toISOString();
    opened.db.insert(loginAttempts).values({
      id: randomUUID(),
      username: "victim0",
      success: false,
      ipAddress: "10.0.0.9",
      attemptedAt: twelveMinutesAgo,
    }).run();
    const retry = lockoutRetryAfterSeconds(opened.db, loginAttempts.ipAddress, "10.0.0.9");
    expect(retry).toBeGreaterThan(2 * 60);
    expect(retry).toBeLessThanOrEqual(3 * 60 + 2);
  });
});
