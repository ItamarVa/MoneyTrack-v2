/**
 * One-off diagnostic and repair for transaction direction/amount sign drift.
 * Invoked by Fix-Transaction-Signs.bat (diagnostic by default; --fix applies repair).
 *
 * Usage:
 *   tsx scripts/fix-transaction-signs.mts
 *   tsx scripts/fix-transaction-signs.mts --fix
 *   tsx scripts/fix-transaction-signs.mts --fix --yes
 */
import { closeDb, eq, initDb, runMigrations, transactions, type MoneyTrackDb } from "@moneytrack/db";
import {
  processRefunds,
  recomputeRollupsForAllTransactions,
} from "@moneytrack/engine";

const CONFIRM_TOKEN = "FIX";

type OffendingRow = {
  id: string;
  descriptionRaw: string;
  kind: string;
  direction: string;
  amountIls: number;
  originalAmount: number;
  expectedDirection: "debit" | "credit";
};

function nowIso(): string {
  return new Date().toISOString();
}

function report(progress: number, message: string): void {
  process.stdout.write(`PROGRESS:${progress}:${message}\n`);
}

function renderProgressBar(progress: number, message: string): void {
  if (!process.stdout.isTTY) {
    return;
  }
  const width = 28;
  const filled = Math.max(0, Math.min(width, Math.round((progress / 100) * width)));
  const bar = "=".repeat(filled) + "-".repeat(width - filled);
  process.stdout.write(`\r[${bar}] ${String(progress).padStart(3)}% ${message}   `);
  if (progress >= 100) {
    process.stdout.write("\n");
  }
}

function expectedDirectionForKind(kind: string): "debit" | "credit" | null {
  switch (kind) {
    case "income":
    case "refund":
      return "credit";
    case "expense":
    case "loan_payment":
    case "card_settlement":
      return "debit";
    default:
      return null;
  }
}

function findOffendingRows(db: MoneyTrackDb): OffendingRow[] {
  const rows: OffendingRow[] = [];
  for (const txn of db.select().from(transactions).all()) {
    const expectedDirection = expectedDirectionForKind(txn.kind);
    if (!expectedDirection || txn.direction === expectedDirection) {
      continue;
    }
    rows.push({
      id: txn.id,
      descriptionRaw: txn.descriptionRaw,
      kind: txn.kind,
      direction: txn.direction,
      amountIls: txn.amountIls,
      originalAmount: txn.originalAmount,
      expectedDirection,
    });
  }
  return rows.sort((a, b) => a.descriptionRaw.localeCompare(b.descriptionRaw));
}

function printOffendingRows(rows: OffendingRow[]): void {
  if (rows.length === 0) {
    process.stdout.write("No direction/kind mismatches found.\n");
    return;
  }

  process.stdout.write(`Found ${rows.length} offending row(s):\n`);
  for (const row of rows) {
    process.stdout.write(
      [
        `- ${row.descriptionRaw}`,
        `  kind=${row.kind} direction=${row.direction} (expected ${row.expectedDirection})`,
        `  amountIls=${row.amountIls} originalAmount=${row.originalAmount}`,
        `  id=${row.id}`,
      ].join("\n") + "\n",
    );
  }
}

function repairRows(db: MoneyTrackDb, rows: OffendingRow[]): number {
  let repaired = 0;
  const timestamp = nowIso();

  for (const row of rows) {
    const txn = db.select().from(transactions).where(eq(transactions.id, row.id)).get();
    if (!txn) {
      continue;
    }

    db.update(transactions)
      .set({
        direction: row.expectedDirection,
        amountIls: Math.abs(txn.amountIls),
        originalAmount: Math.abs(txn.originalAmount),
        updatedAt: timestamp,
      })
      .where(eq(transactions.id, row.id))
      .run();
    repaired += 1;
  }

  return repaired;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const applyFix = args.has("--fix");
  const skipConfirm = args.has("--yes");

  report(5, "Opening database");
  renderProgressBar(5, "Opening database");

  const db = await initDb({ skipGuards: process.env.MONEYTRACK_SKIP_GUARDS === "1" });
  runMigrations();

  report(20, "Scanning transactions");
  renderProgressBar(20, "Scanning transactions");
  const offending = findOffendingRows(db);
  printOffendingRows(offending);

  if (!applyFix) {
    if (offending.length > 0) {
      process.stdout.write("\nRun with --fix to align direction with kind and rebuild rollups.\n");
    }
    report(100, "Diagnostic complete");
    renderProgressBar(100, "Diagnostic complete");
    closeDb();
    return;
  }

  if (offending.length === 0) {
    report(100, "Nothing to repair");
    renderProgressBar(100, "Nothing to repair");
    closeDb();
    return;
  }

  if (!skipConfirm && process.stdin.isTTY) {
    process.stdout.write(
      `\nThis updates ${offending.length} row(s), re-runs refund matching, and rebuilds all rollups.\n` +
        `Type ${CONFIRM_TOKEN} to continue: `,
    );
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const typed = Buffer.concat(chunks).toString("utf8").trim();
    if (typed !== CONFIRM_TOKEN) {
      process.stderr.write("Aborted — confirmation token did not match.\n");
      closeDb();
      process.exit(1);
    }
  }

  report(45, "Aligning direction and magnitudes");
  renderProgressBar(45, "Aligning direction and magnitudes");
  const repaired = repairRows(db, offending);
  process.stdout.write(`Repaired ${repaired} row(s).\n`);

  report(70, "Re-running refund matching");
  renderProgressBar(70, "Re-running refund matching");
  const refundsMatched = processRefunds(db, new Set());
  process.stdout.write(`Refund pass updated ${refundsMatched} row(s).\n`);

  report(88, "Rebuilding rollups");
  renderProgressBar(88, "Rebuilding rollups");
  const rollupRowsWritten = recomputeRollupsForAllTransactions(db);
  process.stdout.write(`Rollups rebuilt (${rollupRowsWritten} bucket row(s) written).\n`);

  report(100, "Repair complete");
  renderProgressBar(100, "Repair complete");
  closeDb();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`fix-transaction-signs failed: ${message}\n`);
  closeDb();
  process.exit(1);
});
