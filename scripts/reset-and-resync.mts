/**
 * Wipe scraped transaction data and optionally resync all enabled bank connections.
 * Invoked by Reset-And-Resync.bat after backup and typed confirmation.
 *
 * Usage:
 *   tsx scripts/reset-and-resync.mts --clear
 *   tsx scripts/reset-and-resync.mts --resync
 *   tsx scripts/reset-and-resync.mts --clear --resync --yes
 */
import { randomUUID } from "node:crypto";
import { installEgressGuard } from "@moneytrack/egress";
import {
  accounts,
  alerts,
  cards,
  categorizationDecisions,
  closeDb,
  connections,
  contributions,
  eq,
  holdings,
  inArray,
  initDb,
  isNull,
  jobs,
  merchantCategoryLearned,
  netWorthSnapshots,
  purchases,
  rawAccounts,
  rawTransactions,
  recurringInstruments,
  rollupMonthly,
  runMigrations,
  scrapeRuns,
  transactionLinks,
  transactionRevisions,
  transactionSplits,
  transactionTags,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { isNotNull, or } from "drizzle-orm";
import { processSyncJob } from "@moneytrack/ingest";
import { isOfficialProvider } from "@moneytrack/providers";

const CONFIRM_TOKEN = "RESET";
const CHUNK_SIZE = 400;

function nowIso(): string {
  return new Date().toISOString();
}

function report(progress: number, message: string): void {
  process.stdout.write(`PROGRESS:${progress}:${message}\n`);
}

function deleteTransactionChildren(db: MoneyTrackDb, transactionIds: readonly string[]): void {
  for (let offset = 0; offset < transactionIds.length; offset += CHUNK_SIZE) {
    const chunk = transactionIds.slice(offset, offset + CHUNK_SIZE);
    db.delete(transactionTags).where(inArray(transactionTags.transactionId, chunk)).run();
    db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, chunk)).run();
    db
      .delete(transactionLinks)
      .where(or(inArray(transactionLinks.fromId, chunk), inArray(transactionLinks.toId, chunk)))
      .run();
    db.delete(transactionRevisions).where(inArray(transactionRevisions.transactionId, chunk)).run();
    db
      .delete(categorizationDecisions)
      .where(inArray(categorizationDecisions.transactionId, chunk))
      .run();
    db.delete(transactions).where(inArray(transactions.id, chunk)).run();
  }
}

function deleteForAccounts(db: MoneyTrackDb, accountIds: readonly string[]): void {
  if (accountIds.length === 0) {
    return;
  }
  for (let offset = 0; offset < accountIds.length; offset += CHUNK_SIZE) {
    const chunk = accountIds.slice(offset, offset + CHUNK_SIZE);
    db.delete(holdings).where(inArray(holdings.accountId, chunk)).run();
    db.delete(contributions).where(inArray(contributions.accountId, chunk)).run();
    db.delete(recurringInstruments).where(inArray(recurringInstruments.accountId, chunk)).run();
  }
}

function deleteIds(
  db: MoneyTrackDb,
  table: typeof purchases | typeof cards,
  column: typeof purchases.cardId | typeof cards.id,
  ids: readonly string[],
): void {
  for (let offset = 0; offset < ids.length; offset += CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + CHUNK_SIZE);
    db.delete(table).where(inArray(column, chunk)).run();
  }
}

function clearScrapedData(db: MoneyTrackDb): void {
  report(22, "Collecting scraped account ids");
  const scrapedAccountIds = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(isNotNull(accounts.connectionId))
    .all()
    .map((row) => row.id);

  report(28, "Collecting scraped transaction ids");
  const scrapedAccountSet = new Set(scrapedAccountIds);
  const scrapedTransactionIds = db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      firstSeenRawId: transactions.firstSeenRawId,
    })
    .from(transactions)
    .all()
    .filter(
      (row) => row.firstSeenRawId !== null || scrapedAccountSet.has(row.accountId),
    )
    .map((row) => row.id);

  report(32, "Clearing alerts and rollups");
  db.delete(alerts).run();
  db.delete(rollupMonthly).run();
  db.delete(merchantCategoryLearned).run();
  db.delete(netWorthSnapshots).run();

  report(38, "Removing scraped transactions");
  deleteTransactionChildren(db, scrapedTransactionIds);

  report(54, "Clearing recurring rows on scraped accounts");
  deleteForAccounts(db, scrapedAccountIds);

  report(54, "Removing scraped cards and purchases");
  const scrapedCardIds =
    scrapedAccountIds.length === 0
      ? []
      : db
          .select({ id: cards.id })
          .from(cards)
          .where(inArray(cards.settlementAccountId, scrapedAccountIds))
          .all()
          .map((row) => row.id);

  deleteIds(db, purchases, purchases.cardId, scrapedCardIds);
  deleteIds(db, cards, cards.id, scrapedCardIds);

  report(60, "Clearing raw scrape rows");
  db.delete(rawTransactions).run();
  db.delete(rawAccounts).run();
  db.delete(scrapeRuns).run();
  db.delete(jobs).where(eq(jobs.kind, "scrape")).run();

  report(66, "Removing scraped accounts");
  if (scrapedAccountIds.length > 0) {
    db.delete(accounts).where(inArray(accounts.id, scrapedAccountIds)).run();
  }

  const now = new Date().toISOString();
  for (const connection of db.select().from(connections).all()) {
    db.update(connections)
      .set({ lastRunId: null, updatedAt: now })
      .where(eq(connections.id, connection.id))
      .run();
  }

  const manualAccounts = db.select({ id: accounts.id }).from(accounts).where(isNull(accounts.connectionId)).all()
    .length;
  const manualTransactions = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(isNull(transactions.firstSeenRawId))
    .all().length;

  report(
    72,
    `Clear complete — kept ${manualAccounts} manual account(s), ${manualTransactions} manual transaction(s)`,
  );
}

async function resyncConnections(db: MoneyTrackDb): Promise<void> {
  const enabled = db
    .select()
    .from(connections)
    .all()
    .filter((row) => row.enabled && row.providerCode !== "manual");

  if (enabled.length === 0) {
    report(95, "No enabled bank connections to resync");
    return;
  }

  report(
    74,
    "Resync uses the Accounts page for OTP — keep MoneyTrack running if your bank asks for a code",
  );

  let index = 0;
  let succeeded = 0;
  const failures: string[] = [];
  const syncable = enabled.filter((connection) => {
    if (isOfficialProvider(connection.providerCode)) {
      return true;
    }
    failures.push(`${connection.providerCode}: no scraper (check connection provider code)`);
    process.stderr.write(
      `Skipping ${connection.providerCode}: no official scraper — edit the connection in Accounts\n`,
    );
    return false;
  });

  if (syncable.length === 0) {
    throw new Error("No syncable bank connections remain after skipping invalid providers");
  }

  for (const connection of syncable) {
    const base = 75 + Math.floor((index / syncable.length) * 20);
    report(base, `Syncing ${connection.providerCode} (${index + 1}/${syncable.length})`);

    const jobId = randomUUID();
    const timestamp = nowIso();
    db.insert(jobs)
      .values({
        id: jobId,
        kind: "scrape",
        payloadJson: JSON.stringify({ connectionId: connection.id }),
        status: "queued",
        otpPrompt: null,
        otpResponse: null,
        attempts: 0,
        errorClass: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    try {
      await processSyncJob(db, jobId);
      succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${connection.providerCode}: ${message}`);
      process.stderr.write(`Sync failed for ${connection.providerCode}: ${message}\n`);
    }
    index += 1;
  }

  if (succeeded === 0) {
    throw new Error(`All ${syncable.length} connection sync(s) failed`);
  }

  report(
    96,
    failures.length === 0
      ? `Resync finished for ${succeeded} connection(s)`
      : `Resync finished — ${succeeded} ok, ${failures.length} skipped/failed`,
  );
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const clear = args.has("--clear");
  const resync = args.has("--resync");
  const skipConfirm = args.has("--yes");

  if (!clear && !resync) {
    process.stderr.write(
      "Usage: tsx scripts/reset-and-resync.mts --clear [--resync] [--yes]\n",
    );
    process.exit(1);
  }

  if (!skipConfirm && process.stdin.isTTY) {
    process.stdout.write(
      [
        "This deletes scraped transactions, rollups, alerts, and scraper-created accounts.",
        "Login, connections, categories, rules, budgets, loans, and manual accounts stay.",
        `Type ${CONFIRM_TOKEN} to continue: `,
      ].join("\n"),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const typed = Buffer.concat(chunks).toString("utf8").trim();
    if (typed !== CONFIRM_TOKEN) {
      process.stderr.write("Aborted — confirmation token did not match.\n");
      process.exit(1);
    }
  }

  installEgressGuard();
  const db = await initDb({ skipGuards: process.env.MONEYTRACK_SKIP_GUARDS === "1" });
  runMigrations();

  if (clear) {
    clearScrapedData(db);
  }

  if (resync) {
    await resyncConnections(db);
  }

  report(100, "Done");
  closeDb();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`reset-and-resync failed: ${message}\n`);
  closeDb();
  process.exit(1);
});
