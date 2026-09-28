/**
 * Reset the admin password and clear login lockouts (local recovery only).
 * Usage: npm run reset:admin-password
 * Optional: MONEYTRACK_NEW_PASSWORD=YourPass123! npm run reset:admin-password
 */
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { closeDb, eq, initDb, loginAttempts, runMigrations, users } from "@moneytrack/db";
import { checkPassword } from "@moneytrack/crypto";

const DEFAULT_USERNAME = "admin";

async function main(): Promise<void> {
  // A fixed fallback would be a published default credential once this source
  // is public, so an unattended reset generates a fresh one every time.
  const manualPassword = process.env.MONEYTRACK_NEW_PASSWORD;
  const isManualPassword = manualPassword !== undefined && manualPassword.length > 0;
  const newPassword = isManualPassword ? manualPassword : randomBytes(12).toString("base64url");
  const policy = checkPassword(newPassword, { username: DEFAULT_USERNAME });
  if (!policy.ok) {
    process.stderr.write(`MONEYTRACK_NEW_PASSWORD rejected by policy: ${policy.reason}\n`);
    process.exit(1);
  }
  const db = await initDb({ skipGuards: process.env.MONEYTRACK_SKIP_GUARDS === "1" });
  runMigrations();

  const user = db.select().from(users).where(eq(users.username, DEFAULT_USERNAME)).get();
  if (!user) {
    process.stderr.write(
      `User "${DEFAULT_USERNAME}" not found. Run npm run seed:admin first.\n`,
    );
    closeDb();
    process.exit(1);
  }

  const passwordHash = await hash(newPassword, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const now = new Date().toISOString();
  db.update(users)
    .set({
      passwordHash,
      mustChangePassword: !isManualPassword,
      updatedAt: now,
    })
    .where(eq(users.id, user.id))
    .run();

  const cleared = db.delete(loginAttempts).run();

  process.stdout.write(
    `Reset password for "${DEFAULT_USERNAME}" and cleared all ${cleared.changes} login attempt row(s).\n`,
  );
  if (isManualPassword) {
    process.stdout.write("Password saved — you can log in now.\n");
  } else {
    process.stdout.write(`Temporary password: ${newPassword}\n`);
    process.stdout.write("You must change it after login.\n");
  }
  closeDb();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`reset-admin-password failed: ${message}\n`);
  process.exit(1);
});
