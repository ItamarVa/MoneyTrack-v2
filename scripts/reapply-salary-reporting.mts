/**
 * Backfill reporting_period for salary-matched income using the current 25–5 rule.
 * Skips rows with reporting_period_locked. Safe to run repeatedly.
 * Usage: npm run reapply:salary-reporting
 */
import { closeDb, initDb, runMigrations } from "@moneytrack/db";
import { applySalaryReportingPeriods } from "@moneytrack/engine";

async function main(): Promise<void> {
  const db = await initDb({ skipGuards: process.env.MONEYTRACK_SKIP_GUARDS === "1" });
  runMigrations();

  const updated = applySalaryReportingPeriods(db);

  closeDb();
  process.stdout.write(`Updated ${updated} transaction(s).\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`reapply-salary-reporting failed: ${message}\n`);
  process.exit(1);
});
