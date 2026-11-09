import { classifyTransaction, normalizeMerchant } from "@moneytrack/classify";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  type MoneyTrackDb,
  accounts,
  and,
  connections,
  eq,
  jobs,
  rawAccounts,
  rawTransactions,
  resolveDataDir,
  scrapeRuns,
  transactionRevisions,
  transactions,
} from "@moneytrack/db";
import type { Job } from "@moneytrack/contracts";
import {
  getProviderAdapter,
  redactLogMessage,
  type ProviderAdapter,
  type ScrapeResult,
  type ScraperAccountSnapshot,
} from "@moneytrack/providers";
import { loadSecret } from "@moneytrack/vault";
import { buildIdentityHash, discriminateOccurrences, sha256Payload } from "./identity.js";
import { removeUnmatchedFileRows } from "./transaction-cleanup.js";
import {
  recomputeRollups,
  resolveTransactionKind,
  runEnginePostProcess,
  applySalaryReportingPeriods,
} from "@moneytrack/engine";
import { runIntelligenceDetectors } from "@moneytrack/alerts";
import type { RawTransactionPayload } from "@moneytrack/providers";

const PENDING_WINDOW_DAYS = 5;

export type SyncRunnerDeps = {
  getAdapter?: (providerCode: string) => ProviderAdapter;
  loadCredentials?: (credentialRef: string) => Promise<Record<string, string>>;
  dataDir?: string;
};

type AccountRow = typeof accounts.$inferSelect;

function nowIso(): string {
  return new Date().toISOString();
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function withinDays(a: string, b: string, window: number): boolean {
  const start = addDays(a, -window);
  const end = addDays(a, window);
  return b >= start && b <= end;
}

function resolvePuppeteerDir(connectionId: string, dataDir: string): string {
  return path.join(dataDir, "puppeteer", connectionId);
}

/** The connection has no stored login secret yet; the user must enter credentials. */
export const CREDENTIALS_MISSING_ERROR_CLASS = "CREDENTIALS_MISSING";

class CredentialsMissingError extends Error {}

async function defaultLoadCredentials(credentialRef: string): Promise<Record<string, string>> {
  const raw = await loadSecret(credentialRef);
  return JSON.parse(raw) as Record<string, string>;
}

async function waitForOtp(jobId: string, db: MoneyTrackDb, prompt: string): Promise<string> {
  const updatedAt = nowIso();
  db.update(jobs)
    .set({
      status: "otp_required",
      otpPrompt: prompt,
      otpResponse: null,
      updatedAt,
    })
    .where(eq(jobs.id, jobId))
    .run();

  for (let attempt = 0; attempt < 300; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
    if (!job) {
      throw new Error(`Sync job not found: ${jobId}`);
    }
    if (job.otpResponse) {
      // A bank OTP is single-use; drop it from storage the moment it is read.
      db.update(jobs)
        .set({ otpPrompt: null, otpResponse: null, updatedAt: nowIso() })
        .where(eq(jobs.id, jobId))
        .run();
      return job.otpResponse;
    }
    if (job.status === "failed" || job.status === "done") {
      throw new Error("Sync job ended before OTP was supplied");
    }
  }

  throw new Error("Timed out waiting for OTP response");
}

/** Where a transaction row came from (`transactions.source`, migration 0011). */
export type TransactionSource = "sync" | "file";

export function findOrCreateAccount(
  db: MoneyTrackDb,
  connectionId: string,
  providerCode: string,
  providerAccountNumber: string,
  currency: string,
): AccountRow {
  const existing = db
    .select()
    .from(accounts)
    .where(eq(accounts.connectionId, connectionId))
    .all()
    .find((row) => row.numberLast4 === providerAccountNumber.slice(-4));

  if (existing) {
    return existing;
  }

  const timestamp = nowIso();
  const kind = ["isracard", "amex", "max", "visaCal", "visacal"].includes(providerCode)
    ? "credit_card"
    : "bank";
  const row: AccountRow = {
    id: randomUUID(),
    kind,
    connectionId,
    institutionCode: providerCode,
    displayName: `${providerCode} ${providerAccountNumber.slice(-4)}`,
    numberLast4: providerAccountNumber.slice(-4),
    currency,
    ownerPersonId: null,
    note: null,
    scope: "household",
    balanceIls: null,
    balanceDate: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db.insert(accounts).values(row).run();
  return row;
}

function recordRevision(
  db: MoneyTrackDb,
  transactionId: string,
  runId: string,
  fieldName: string,
  oldValue: string | null,
  newValue: string | null,
): void {
  db.insert(transactionRevisions)
    .values({
      id: randomUUID(),
      transactionId,
      runId,
      fieldName,
      oldValue,
      newValue,
      revisedAt: nowIso(),
    })
    .run();
}

function findPendingMatch(
  db: MoneyTrackDb,
  accountId: string,
  payload: RawTransactionPayload,
  normalized: string,
): (typeof transactions.$inferSelect) | undefined {
  const pendingRows = db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .all()
    .filter((row) => row.status === "pending");

  return pendingRows.find(
    (row) =>
      row.descriptionNormalized === normalized &&
      // A posted refund must never convert its pending charge (identity is direction-aware too).
      row.direction === payload.direction &&
      Math.abs(row.originalAmount - payload.originalAmount) < 0.01 &&
      withinDays(payload.transactionDate, row.transactionDate, PENDING_WINDOW_DAYS),
  );
}

/**
 * Insert or update one transaction by identity hash; returns the row id, or null when a file
 * import met a sync-owned row (sync wins, the row is left untouched). A sync that matches a file
 * row takes it over (source becomes "sync") and keeps its id, so user edits survive.
 */
function upsertTransaction(
  db: MoneyTrackDb,
  runId: string,
  account: AccountRow,
  identityHash: string,
  normalized: string,
  rawId: string,
  payload: RawTransactionPayload,
  source: TransactionSource,
): string | null {
  const accountId = account.id;
  const timestamp = nowIso();
  const kind = resolveTransactionKind({
    accountKind: account.kind,
    descriptionRaw: payload.descriptionRaw,
    descriptionNormalized: normalized,
    fallbackKind: payload.kind,
    direction: payload.direction,
  });

  const existing = db
    .select()
    .from(transactions)
    .where(eq(transactions.identityHash, identityHash))
    .get();

  if (existing) {
    if (source === "file" && existing.source === "sync") {
      return null;
    }
    // processInstallments moved this slice's date back to the purchase date; the payload still
    // carries the scraper's shifted date (identity hash is built from it), so keep the stored one.
    const transactionDate =
      existing.purchaseId !== null && (existing.installmentIndex ?? 0) > 1
        ? existing.transactionDate
        : payload.transactionDate;
    const fields: Array<keyof typeof existing> = [
      "status",
      "transactionDate",
      "chargeDate",
      "amountIls",
      "descriptionRaw",
      "descriptionNormalized",
    ];
    for (const field of fields) {
      const oldValue = String(existing[field] ?? "");
      const newValue = String(
        field === "status"
          ? payload.status
          : field === "transactionDate"
            ? transactionDate
            : field === "chargeDate"
              ? payload.chargeDate
              : field === "amountIls"
                ? payload.amountIls
                : field === "descriptionRaw"
                  ? payload.descriptionRaw
                  : normalized,
      );
      if (oldValue !== newValue) {
        recordRevision(db, existing.id, runId, field, oldValue, newValue);
      }
    }

    db.update(transactions)
      .set({
        status: payload.status,
        transactionDate,
        chargeDate: payload.chargeDate,
        amountIls: payload.amountIls,
        descriptionRaw: payload.descriptionRaw,
        descriptionNormalized: normalized,
        direction: payload.direction,
        kind,
        providerCategory: payload.providerCategory ?? null,
        source: source === "sync" ? "sync" : existing.source,
        updatedAt: timestamp,
      })
      .where(eq(transactions.id, existing.id))
      .run();
    return existing.id;
  }

  // Pending rows only ever come from a sync; a file import must not convert them.
  if (payload.status === "posted" && source === "sync") {
    const pending = findPendingMatch(db, accountId, payload, normalized);
    if (pending) {
      const updates: Record<string, string | number> = {
        status: payload.status,
        transactionDate: payload.transactionDate,
        chargeDate: payload.chargeDate,
        amountIls: payload.amountIls,
      };
      for (const [field, value] of Object.entries(updates)) {
        const oldValue = String(pending[field as keyof typeof pending] ?? "");
        const newValue = String(value);
        if (oldValue !== newValue) {
          recordRevision(db, pending.id, runId, field, oldValue, newValue);
        }
      }
      db.update(transactions)
        .set({
          ...updates,
          identityHash,
          descriptionRaw: payload.descriptionRaw,
          descriptionNormalized: normalized,
          direction: payload.direction,
          kind,
          providerCategory: payload.providerCategory ?? null,
          updatedAt: timestamp,
        })
        .where(eq(transactions.id, pending.id))
        .run();
      return pending.id;
    }
  }

  const id = randomUUID();
  db.insert(transactions)
    .values({
      id,
      firstSeenRawId: rawId,
      accountId,
      cardId: null,
      identityHash,
      transactionDate: payload.transactionDate,
      chargeDate: payload.chargeDate,
      status: payload.status,
      direction: payload.direction,
      amountIls: payload.amountIls,
      originalAmount: payload.originalAmount,
      originalCurrency: payload.originalCurrency,
      fxRate: null,
      fxFeeIls: null,
      descriptionRaw: payload.descriptionRaw,
      descriptionNormalized: normalized,
      merchantId: null,
      kind,
      purchaseId: null,
      installmentIndex: payload.installmentIndex,
      installmentTotal: payload.installmentTotal,
      excludedFromTotals: false,
      exclusionReason: null,
      userNote: null,
      providerCategory: payload.providerCategory ?? null,
      source,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  return id;
}

function classifyRunTransactions(db: MoneyTrackDb, runId: string): void {
  const rawIds = db
    .select({ id: rawTransactions.id })
    .from(rawTransactions)
    .where(eq(rawTransactions.runId, runId))
    .all()
    .map((row) => row.id);

  if (rawIds.length === 0) return;

  const rawIdSet = new Set(rawIds);
  const rows = db.select().from(transactions).all();
  for (const row of rows) {
    if (row.firstSeenRawId && rawIdSet.has(row.firstSeenRawId)) {
      classifyTransaction(db, row.id);
    }
  }
}

function ingestAccount(
  db: MoneyTrackDb,
  runId: string,
  connectionId: string,
  providerCode: string,
  account: ScraperAccountSnapshot,
  startDate: Date,
): { ingested: number; errors: string[]; dirtyPeriods: Set<string> } {
  const errors: string[] = [];
  const dirtyPeriods = new Set<string>();
  let ingested = 0;

  try {
    const accountRow = findOrCreateAccount(
      db,
      connectionId,
      providerCode,
      account.providerAccountNumber,
      account.currency,
    );

    const ingestedAt = nowIso();
    // The balance is the only figure the accounts screen can show for a bank
    // account; raw_accounts is never read by the web app.
    if (account.balance !== null) {
      db.update(accounts)
        .set({
          balanceIls: account.balance,
          balanceDate: account.balanceDate ?? ingestedAt.slice(0, 10),
          updatedAt: ingestedAt,
        })
        .where(eq(accounts.id, accountRow.id))
        .run();
    }

    insertRawAccount(db, runId, account);
    const result = ingestRows(
      db,
      runId,
      accountRow,
      providerCode,
      account.providerAccountNumber,
      account.transactions,
      "sync",
    );
    ingested = result.ingested;
    errors.push(...result.errors);

    // Sync wins per charge month: file stand-in rows it did not match are dropped. Skipped when
    // a row failed (it may be the very row that would have matched) and for charge months the
    // scrape window may only partly cover, so a short incremental window never deletes real rows.
    if (result.errors.length === 0) {
      const months = new Set(account.transactions.map((txn) => txn.chargeDate.slice(0, 7)));
      db.transaction(() => {
        for (const month of months) {
          if (chargeMonthFullyCovered(month, startDate)) {
            for (const period of removeUnmatchedFileRows(db, accountRow.id, month, result.touchedIds)) {
              dirtyPeriods.add(period);
            }
          }
        }
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(redactLogMessage(`account ${account.providerAccountNumber}: ${message}`));
  }

  return { ingested, errors, dirtyPeriods };
}

/**
 * A card's charge month M bills purchases made from roughly the start of M-1 (installment
 * slices carry older dates, but the scraper filters by date too), so M counts as fully scraped
 * only when the window starts no later than the first day of M-1.
 */
function chargeMonthFullyCovered(month: string, startDate: Date): boolean {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const previousMonthStart = new Date(Date.UTC(year, mon - 2, 1));
  return startDate.getTime() <= previousMonthStart.getTime();
}

export function insertRawAccount(
  db: MoneyTrackDb,
  runId: string,
  account: ScraperAccountSnapshot,
): void {
  db.insert(rawAccounts)
    .values({
      id: randomUUID(),
      runId,
      providerAccountNumber: account.providerAccountNumber,
      balance: account.balance,
      balanceDate: account.balanceDate,
      cardFrame: account.cardFrame,
      cardType: account.cardType,
      currency: account.currency,
      savingsAccount: account.savingsAccount,
      ingestedAt: nowIso(),
    })
    .run();
}

/**
 * Raw copy + upsert per row; a failing row is reported, the rest still land. Identity hashes are
 * assigned over the whole `rows` batch first (discriminateOccurrences), so repeats in it get
 * distinct rows; callers must pass a provider's rows for one account/charge month together.
 */
export function ingestRows(
  db: MoneyTrackDb,
  runId: string,
  accountRow: AccountRow,
  providerCode: string,
  providerAccountNumber: string,
  rows: readonly RawTransactionPayload[],
  source: TransactionSource,
): { ingested: number; errors: string[]; touchedIds: Set<string> } {
  const errors: string[] = [];
  const touchedIds = new Set<string>();
  let ingested = 0;
  const ingestedAt = nowIso();
  const normalized = rows.map((txn) => normalizeMerchant(txn.descriptionRaw));
  const hashes = discriminateOccurrences(
    rows.map((txn, index) => ({
      baseHash: buildIdentityHash({
        providerCode,
        accountNumber: providerAccountNumber,
        transactionDate: txn.transactionDate,
        originalAmount: txn.originalAmount,
        originalCurrency: txn.originalCurrency,
        normalizedDescription: normalized[index]!,
        installmentIndex: txn.installmentIndex,
      }),
      direction: txn.direction,
      chargeDate: txn.chargeDate,
    })),
  );
  for (const [index, txn] of rows.entries()) {
    const payloadSha = sha256Payload(txn.payload);
    let rawId: string = randomUUID();
    try {
      const inserted = db.insert(rawTransactions)
        .values({
          id: rawId,
          runId,
          providerAccountNumber,
          payloadJson: JSON.stringify(txn.payload),
          payloadSha256: payloadSha,
          ingestedAt,
        })
        .onConflictDoNothing()
        .run();
      if (inserted.changes === 0) {
        // A byte-identical repeat (e.g. no voucher number) shares the run's raw copy; a fresh id
        // here would break the first_seen_raw_id foreign key.
        rawId = db
          .select({ id: rawTransactions.id })
          .from(rawTransactions)
          .where(and(eq(rawTransactions.runId, runId), eq(rawTransactions.payloadSha256, payloadSha)))
          .get()!.id;
      }

      const id = upsertTransaction(
        db,
        runId,
        accountRow,
        hashes[index]!,
        normalized[index]!,
        rawId,
        txn,
        source,
      );
      if (id !== null) {
        touchedIds.add(id);
        ingested += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(redactLogMessage(`txn ${providerAccountNumber}: ${message}`));
    }
  }
  return { ingested, errors, touchedIds };
}

/**
 * Shared tail of every ingest run (sync or statement file): engine links/FX/refunds, rule
 * classification of new rows, salary periods, rollups for every touched period (including
 * periods of rows deleted by the caller), then alert detectors.
 */
export async function finishIngestRun(
  db: MoneyTrackDb,
  runId: string,
  extraDirtyPeriods: Iterable<string>,
): Promise<void> {
  const postProcess = await runEnginePostProcess(db, { runId });
  classifyRunTransactions(db, runId);
  applySalaryReportingPeriods(db, runId);
  recomputeRollups(db, new Set([...postProcess.dirtyPeriods, ...extraDirtyPeriods]));
  runIntelligenceDetectors(db);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 365;
const INCREMENTAL_OVERLAP_DAYS = 60;

/** Scrape window when startDate is not passed explicitly (e.g. resync script). */
export function resolveSyncStartDate(
  db: MoneyTrackDb,
  connectionId: string,
  override?: Date,
): Date {
  if (override) {
    return override;
  }
  const floor = new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * MS_PER_DAY);
  const latest = db
    .select()
    .from(scrapeRuns)
    .where(and(eq(scrapeRuns.connectionId, connectionId), eq(scrapeRuns.status, "success")))
    .all()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!latest) {
    return floor;
  }
  const overlap = new Date(new Date(latest.startedAt).getTime() - INCREMENTAL_OVERLAP_DAYS * MS_PER_DAY);
  return overlap.getTime() > floor.getTime() ? overlap : floor;
}

export type ConnectionSyncResult = {
  runId: string;
  ingested: number;
  accountErrors: string[];
};

export async function runConnectionSync(
  db: MoneyTrackDb,
  connectionId: string,
  options?: {
    jobId?: string;
    startDate?: Date;
    deps?: SyncRunnerDeps;
  },
): Promise<ConnectionSyncResult> {
  const connection = db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .get();

  if (!connection) {
    throw new Error(`Connection not found: ${connectionId}`);
  }
  if (!connection.enabled) {
    throw new Error(`Connection disabled: ${connectionId}`);
  }

  const deps = options?.deps ?? {};
  const dataDir = deps.dataDir ?? resolveDataDir();
  const puppeteerDir =
    connection.puppeteerProfileDir ?? resolvePuppeteerDir(connection.id, dataDir);

  if (!connection.puppeteerProfileDir) {
    db.update(connections)
      .set({ puppeteerProfileDir: puppeteerDir, updatedAt: nowIso() })
      .where(eq(connections.id, connection.id))
      .run();
  }

  const runId = randomUUID();
  const startedAt = nowIso();
  const adapter = deps.getAdapter?.(connection.providerCode) ??
    getProviderAdapter(connection.providerCode);
  const loadCredentials = deps.loadCredentials ?? defaultLoadCredentials;
  let credentials: Record<string, string>;
  try {
    credentials = await loadCredentials(connection.credentialRef);
  } catch (error) {
    // Both vault backends throw "Vault secret not found: <ref>" for an absent secret.
    if (error instanceof Error && error.message.startsWith("Vault secret not found")) {
      throw new CredentialsMissingError(error.message);
    }
    throw error;
  }

  db.insert(scrapeRuns)
    .values({
      id: runId,
      connectionId: connection.id,
      providerCode: connection.providerCode,
      startedAt,
      finishedAt: null,
      status: "running",
      errorClass: null,
      errorMessageRedacted: null,
      libraryVersion: "pending",
    })
    .run();

  const startDate = resolveSyncStartDate(db, connection.id, options?.startDate);

  let scrapeResult: ScrapeResult;
  try {
    scrapeResult = await adapter.scrape(
      {
        id: connection.id,
        providerCode: connection.providerCode,
        puppeteerProfileDir: puppeteerDir,
      },
      credentials,
      {
        startDate,
        combineInstallments: false,
        puppeteerUserDataDir: puppeteerDir,
        onOtpRequired: options?.jobId
          ? (prompt) => waitForOtp(options.jobId!, db, prompt)
          : undefined,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A thrown Puppeteer error never went through the adapter's own redaction,
    // and its message can quote the login form it just filled in.
    db.update(scrapeRuns)
      .set({
        finishedAt: nowIso(),
        status: "failed",
        errorClass: "SCRAPE_EXCEPTION",
        errorMessageRedacted: redactLogMessage(message, Object.values(credentials)).slice(0, 500),
        libraryVersion: "unknown",
      })
      .where(eq(scrapeRuns.id, runId))
      .run();
    throw error;
  }

  if (!scrapeResult.ok) {
    db.update(scrapeRuns)
      .set({
        finishedAt: nowIso(),
        status: "failed",
        errorClass: scrapeResult.errorClass,
        errorMessageRedacted: scrapeResult.errorMessageRedacted,
        libraryVersion: scrapeResult.libraryVersion,
      })
      .where(eq(scrapeRuns.id, runId))
      .run();
    throw new Error(scrapeResult.errorMessageRedacted);
  }

  let ingested = 0;
  const accountErrors: string[] = [];
  const deletedPeriods = new Set<string>();
  for (const account of scrapeResult.accounts) {
    const result = ingestAccount(
      db,
      runId,
      connection.id,
      connection.providerCode,
      account,
      startDate,
    );
    ingested += result.ingested;
    accountErrors.push(...result.errors);
    result.dirtyPeriods.forEach((period) => deletedPeriods.add(period));
  }

  await finishIngestRun(db, runId, deletedPeriods);

  db.update(scrapeRuns)
    .set({
      finishedAt: nowIso(),
      status: "success",
      libraryVersion: scrapeResult.libraryVersion,
      errorClass: accountErrors.length > 0 ? "PARTIAL_ACCOUNT_FAILURE" : null,
      errorMessageRedacted:
        accountErrors.length > 0 ? accountErrors.join("; ").slice(0, 500) : null,
    })
    .where(eq(scrapeRuns.id, runId))
    .run();

  db.update(connections)
    .set({ lastRunId: runId, updatedAt: nowIso() })
    .where(eq(connections.id, connection.id))
    .run();

  return { runId, ingested, accountErrors };
}

export function rowToJob(row: typeof jobs.$inferSelect): Job {
  return {
    id: row.id,
    kind: row.kind as Job["kind"],
    payloadJson: JSON.parse(row.payloadJson) as Record<string, unknown>,
    status: row.status as Job["status"],
    otpPrompt: row.otpPrompt,
    // The submitted code is never echoed back to any caller.
    otpResponse: null,
    attempts: row.attempts,
    errorClass: row.errorClass,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function processSyncJob(
  db: MoneyTrackDb,
  jobId: string,
  deps?: SyncRunnerDeps,
): Promise<void> {
  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const payload = JSON.parse(job.payloadJson) as { connectionId?: string };
  if (!payload.connectionId) {
    throw new Error("Sync job payload missing connectionId");
  }

  const updatedAt = nowIso();
  db.update(jobs)
    .set({
      status: "running",
      attempts: job.attempts + 1,
      updatedAt,
    })
    .where(eq(jobs.id, jobId))
    .run();

  try {
    await runConnectionSync(db, payload.connectionId, { jobId, deps });
    db.update(jobs)
      .set({
        status: "done",
        updatedAt: nowIso(),
        errorClass: null,
        otpPrompt: null,
        otpResponse: null,
      })
      .where(eq(jobs.id, jobId))
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.update(jobs)
      .set({
        status: "failed",
        errorClass:
          error instanceof CredentialsMissingError
            ? CREDENTIALS_MISSING_ERROR_CLASS
            : "SYNC_FAILED",
        updatedAt: nowIso(),
        otpPrompt: null,
        otpResponse: null,
      })
      .where(eq(jobs.id, jobId))
      .run();
    throw new Error(redactLogMessage(message));
  }
}
