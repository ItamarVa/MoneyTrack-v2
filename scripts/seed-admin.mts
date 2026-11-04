/**
 * Seed the initial admin user (first run only).
 * Usage: npx tsx scripts/seed-admin.ts
 */
import { randomBytes, randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { eq, closeDb, initDb, people, runMigrations, users } from "@moneytrack/db";

const DEFAULT_USERNAME = "admin";

/**
 * Printed once, never stored in the repo. A fixed constant here would be a
 * published default credential the moment this source is public, and the
 * mustChangePassword flag alone does not help if a stranger logs in first.
 */
function newTempPassword(): string {
  return randomBytes(12).toString("base64url");
}

async function main(): Promise<void> {
  const DEFAULT_PASSWORD = newTempPassword();
  const db = await initDb({ skipGuards: process.env.MONEYTRACK_SKIP_GUARDS === "1" });
  runMigrations();

  const existing = db.select().from(users).where(eq(users.username, DEFAULT_USERNAME)).get();
  if (existing) {
    process.stdout.write(`Admin user "${DEFAULT_USERNAME}" already exists — skipped.\n`);
    closeDb();
    return;
  }

  const now = new Date().toISOString();
  const personId = randomUUID();
  const userId = randomUUID();
  const passwordHash = await hash(DEFAULT_PASSWORD, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  db.insert(people).values({
    id: personId,
    displayName: "Administrator",
    isChild: false,
    createdAt: now,
    updatedAt: now,
  }).run();

  db.insert(users).values({
    id: userId,
    personId,
    username: DEFAULT_USERNAME,
    passwordHash,
    mustChangePassword: true,
    totpSecretEncrypted: null,
    createdAt: now,
    updatedAt: now,
  }).run();

  process.stdout.write(
    `Created admin user "${DEFAULT_USERNAME}" (must change password on first login).\n`,
  );
  process.stdout.write(`Temporary password: ${DEFAULT_PASSWORD}\n`);
  process.stdout.write("Copy it now - it is not stored anywhere and not shown again.\n");
  closeDb();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`seed-admin failed: ${message}\n`);
  process.exit(1);
});
