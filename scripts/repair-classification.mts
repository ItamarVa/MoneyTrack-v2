/**
 * Re-applies the corrected money rules to transactions that were already stored:
 * card settlements, savings moves, and the internal-transfer links that the old
 * amount-only matcher got wrong. Safe to run repeatedly.
 * Invoked by Repair-Classification.bat; prints PROGRESS:<pct>:<message> lines
 * for the launcher's progress bar, matching reset-and-resync.mts.
 */
import {
  accounts,
  closeDb,
  eq,
  initDb,
  runMigrations,
  transactionLinks,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import {
  looksLikeAccountTransfer,
  processCardSettlements,
  processInternalTransfers,
  recomputeRollups,
  resolveTransactionKind,
} from "@moneytrack/engine";

function report(progress: number, message: string): void {
  process.stdout.write(`PROGRESS:${progress}:${message}\n`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function periodOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Re-derive `kind` for every stored row using the shared rule. */
function retagKinds(db: MoneyTrackDb, dirty: Set<string>): number {
  const accountKinds = new Map(
    db.select().from(accounts).all().map((row) => [row.id, row.kind] as const),
  );
  let changed = 0;

  for (const txn of db.select().from(transactions).all()) {
    const accountKind = accountKinds.get(txn.accountId);
    if (!accountKind) {
      continue;
    }
    // A row a human re-classified by hand keeps its kind.
    if (txn.classificationSource === "manual") {
      continue;
    }
    const fallbackKind = txn.direction === "credit" ? "income" : "expense";
    const kind = resolveTransactionKind({
      accountKind,
      descriptionRaw: txn.descriptionRaw,
      descriptionNormalized: txn.descriptionNormalized,
      fallbackKind: txn.kind === "refund" ? "refund" : fallbackKind,
    });
    if (kind === txn.kind) {
      continue;
    }

    db.update(transactions)
      .set({ kind, updatedAt: nowIso() })
      .where(eq(transactions.id, txn.id))
      .run();
    dirty.add(periodOf(txn.transactionDate));
    dirty.add(periodOf(txn.chargeDate));
    changed += 1;
  }

  return changed;
}

/**
 * Drops auto internal-transfer links whose two sides are not both worded as a
 * bank transfer, and puts the wrongly hidden transactions back into the totals.
 */
function dropFalseTransferLinks(db: MoneyTrackDb, dirty: Set<string>): number {
  const byId = new Map(db.select().from(transactions).all().map((row) => [row.id, row] as const));
  let dropped = 0;

  for (const link of db.select().from(transactionLinks).all()) {
    if (link.linkType !== "internal_transfer" || link.source === "manual") {
      continue;
    }
    const from = byId.get(link.fromId);
    const to = byId.get(link.toId);
    const bothWorded =
      from !== undefined &&
      to !== undefined &&
      (looksLikeAccountTransfer(from.descriptionRaw) ||
        looksLikeAccountTransfer(from.descriptionNormalized)) &&
      (looksLikeAccountTransfer(to.descriptionRaw) ||
        looksLikeAccountTransfer(to.descriptionNormalized));
    if (bothWorded) {
      continue;
    }

    db.delete(transactionLinks).where(eq(transactionLinks.id, link.id)).run();
    for (const txn of [from, to]) {
      if (!txn || txn.exclusionReason !== "internal_transfer") {
        continue;
      }
      db.update(transactions)
        .set({ excludedFromTotals: false, exclusionReason: null, updatedAt: nowIso() })
        .where(eq(transactions.id, txn.id))
        .run();
      dirty.add(periodOf(txn.transactionDate));
      dirty.add(periodOf(txn.chargeDate));
    }
    dropped += 1;
  }

  return dropped;
}

async function main(): Promise<void> {
  report(5, "Opening database");
  const db = await initDb({ skipGuards: process.env.MONEYTRACK_SKIP_GUARDS === "1" });
  runMigrations();

  const dirty = new Set<string>();

  report(20, "Re-tagging bank transaction kinds");
  const retagged = retagKinds(db, dirty);

  report(45, "Dropping false internal-transfer links");
  const droppedLinks = dropFalseTransferLinks(db, dirty);

  report(60, "Linking real internal transfers");
  const transfersLinked = processInternalTransfers(db, dirty);

  report(75, "Excluding duplicate card settlements");
  const settlementsExcluded = processCardSettlements(db, dirty);

  report(85, "Recomputing monthly rollups");
  // A kind or exclusion change in any month shifts that month's totals only,
  // but a full rebuild is cheap here and removes any leftover stale bucket.
  for (const txn of db.select().from(transactions).all()) {
    dirty.add(periodOf(txn.transactionDate));
    dirty.add(periodOf(txn.chargeDate));
  }
  const rollupRows = recomputeRollups(db, dirty);

  closeDb();
  report(100, "Done");
  process.stdout.write(
    `retagged=${retagged} droppedLinks=${droppedLinks} transfersLinked=${transfersLinked} ` +
      `settlementsExcluded=${settlementsExcluded} rollupRows=${rollupRows}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
