/**
 * Ingests a card statement file (Isracard/Amex .xlsx, already parsed into scraper-shaped accounts)
 * as a stand-in for a sync the card site blocks. Per (card, charge month): a month that holds any
 * sync row is skipped (sync wins); otherwise the file REPLACES the month's earlier file rows —
 * matching rows are updated in place (ids, categories, notes and tags survive), missing ones are
 * deleted, new ones inserted with transactions.source = 'file'. The whole upload is one DB
 * transaction. Runs are scrape_runs rows with status "imported" so the sync window, freshness and
 * prune "latest success" logic ignore them. Used by apps/web POST /api/connections/[id]/statement.
 * Each (card, month) group is one ingestRows batch, so same-day repeats in it are numbered there
 * (identity.ts discriminateOccurrences); a re-upload yields the same hashes and ids.
 */
import { randomUUID } from "node:crypto";
import { type MoneyTrackDb, connections, eq, scrapeRuns, transactions } from "@moneytrack/db";
import { markDirtyPeriodsForTransaction } from "@moneytrack/engine";
import {
  mapScraperAccount,
  parseIsracardStatement,
  type RawTransactionPayload,
} from "@moneytrack/providers";
import {
  findOrCreateAccount,
  finishIngestRun,
  ingestRows,
  insertRawAccount,
} from "./sync-runner.js";
import { chargeMonthRows, removeUnmatchedFileRows } from "./transaction-cleanup.js";

export const STATEMENT_FILE_PROVIDERS: readonly string[] = ["isracard", "amex"];
export const STATEMENT_FILE_LIBRARY_VERSION = "statement-file/1";
export const STATEMENT_RUN_STATUS = "imported";

/** Thrown for a request the caller should answer with 400 (message is safe to show). */
export class StatementImportError extends Error {}

export type StatementAccount = Parameters<typeof mapScraperAccount>[0] & { chargeMonth: string };

export type StatementImportResult = {
  runId: string;
  ingested: number;
  /** Card accounts that received rows from this file. */
  accounts: number;
  /** "YYYY-MM" charge months left alone because sync data already covers them. */
  skippedMonths: string[];
};

/**
 * Parse an uploaded Isracard/Amex .xlsx. Any parser failure becomes a StatementImportError with a
 * fixed message: parser errors can quote cell text (merchant names, amounts) from the file.
 */
export function parseStatementFile(buf: Buffer): StatementAccount[] {
  try {
    return parseIsracardStatement(buf).accounts;
  } catch {
    throw new StatementImportError("The file is not a readable card statement export");
  }
}

type MonthGroup = {
  card: string;
  month: string;
  snapshot: ReturnType<typeof mapScraperAccount>;
  rows: RawTransactionPayload[];
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** One group per (card, charge month); a row's month is its own charge date, never the label. */
function groupByCardMonth(statement: readonly StatementAccount[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  const groupFor = (snapshot: MonthGroup["snapshot"], month: string): MonthGroup => {
    if (!MONTH_RE.test(month)) {
      throw new StatementImportError("Statement has an invalid charge month");
    }
    const card = snapshot.providerAccountNumber;
    const key = `${card}|${month}`;
    let group = groups.get(key);
    if (!group) {
      group = { card, month, snapshot, rows: [] };
      groups.set(key, group);
    }
    return group;
  };
  for (const account of statement) {
    const snapshot = mapScraperAccount(account);
    if (!/^\d{4}$/.test(snapshot.providerAccountNumber)) {
      throw new StatementImportError("Statement card number is not 4 digits");
    }
    // An empty month in the file still replaces (empties) that month's earlier file rows.
    groupFor(snapshot, account.chargeMonth);
    for (const row of snapshot.transactions) {
      groupFor(snapshot, row.chargeDate.slice(0, 7)).rows.push(row);
    }
  }
  return [...groups.values()];
}

export async function importStatementFile(
  db: MoneyTrackDb,
  connectionId: string,
  statement: readonly StatementAccount[],
): Promise<StatementImportResult> {
  const connection = db.select().from(connections).where(eq(connections.id, connectionId)).get();
  if (!connection) {
    throw new StatementImportError("Connection not found");
  }
  if (!STATEMENT_FILE_PROVIDERS.includes(connection.providerCode)) {
    throw new StatementImportError("Statement upload is not supported for this provider");
  }
  const providerCode = connection.providerCode;
  const groups = groupByCardMonth(statement);

  const runId = randomUUID();
  db.insert(scrapeRuns)
    .values({
      id: runId,
      connectionId,
      providerCode,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "running",
      errorClass: null,
      errorMessageRedacted: null,
      libraryVersion: STATEMENT_FILE_LIBRARY_VERSION,
    })
    .run();

  const dirtyPeriods = new Set<string>();
  const skipped = new Set<string>();
  const accountIds = new Set<string>();
  let ingested = 0;

  try {
    db.transaction(() => {
      // Every group is classified before any write, so a row moved between months by this
      // file is matched (kept) rather than deleted from its old month first.
      const pending: Array<{ group: MonthGroup; account: ReturnType<typeof findOrCreateAccount> }> = [];
      for (const group of groups) {
        const account = findOrCreateAccount(db, connectionId, providerCode, group.card, group.snapshot.currency);
        const before = chargeMonthRows(db, account.id, group.month);
        if (before.some((row) => row.source === "sync")) {
          skipped.add(group.month);
          continue;
        }
        before.forEach((row) => markDirtyPeriodsForTransaction(row, dirtyPeriods));
        pending.push({ group, account });
      }

      const keepByAccount = new Map<string, Set<string>>();
      const rawAccountDone = new Set<string>();
      for (const { group, account } of pending) {
        if (!rawAccountDone.has(account.id)) {
          insertRawAccount(db, runId, group.snapshot);
          rawAccountDone.add(account.id);
        }
        const result = ingestRows(db, runId, account, providerCode, group.card, group.rows, "file");
        if (result.errors.length > 0) {
          // Replacing a month with a row missing would delete that row's earlier version.
          throw new Error(result.errors[0]);
        }
        ingested += result.ingested;
        accountIds.add(account.id);
        const keep = keepByAccount.get(account.id) ?? new Set<string>();
        result.touchedIds.forEach((id) => keep.add(id));
        keepByAccount.set(account.id, keep);
      }

      for (const { group, account } of pending) {
        const keep = keepByAccount.get(account.id) ?? new Set<string>();
        removeUnmatchedFileRows(db, account.id, group.month, keep).forEach((p) => dirtyPeriods.add(p));
      }
      for (const keep of keepByAccount.values()) {
        for (const id of keep) {
          const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
          if (row) markDirtyPeriodsForTransaction(row, dirtyPeriods);
        }
      }
    });

    await finishIngestRun(db, runId, dirtyPeriods);
  } catch (error) {
    db.update(scrapeRuns)
      .set({ finishedAt: new Date().toISOString(), status: "failed", errorClass: "STATEMENT_IMPORT_FAILED" })
      .where(eq(scrapeRuns.id, runId))
      .run();
    throw error;
  }

  db.update(scrapeRuns)
    .set({ finishedAt: new Date().toISOString(), status: STATEMENT_RUN_STATUS })
    .where(eq(scrapeRuns.id, runId))
    .run();

  return { runId, ingested, accounts: accountIds.size, skippedMonths: [...skipped].sort() };
}
