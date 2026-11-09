#!/usr/bin/env node
/**
 * Runs the docs/backup-restore.md procedure end to end against a throwaway
 * encrypted database and fails if the restored copy does not match the
 * original. An untested backup is not a backup.
 *
 * Covers the stop-then-copy procedure as written: after a clean close SQLite
 * has checkpointed the WAL away, so the sidecars are copied when present but
 * usually are not there. A crash-consistent copy of a running database is a
 * different drill and is still manual.
 *
 * Touches nothing outside a temp directory, so it is safe to run any time.
 * Requires the workspace to be built (npm run typecheck emits the packages).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import {
  accounts,
  closeDb,
  initDb,
  isEncryptedSqliteAvailable,
  openEncryptedDatabase,
  people,
  resolveDbPath,
  runMigrations,
  transactions,
} from "@moneytrack/db";

const ROWS = 500;
/** The sidecars SQLite leaves beside the database in WAL mode. */
const SIDECARS = ["-wal", "-shm"];

function nowIso() {
  return new Date().toISOString();
}

function seed(db) {
  const now = nowIso();
  const personId = randomUUID();
  const accountId = randomUUID();

  db.insert(people)
    .values({ id: personId, displayName: "Drill Person", isChild: false, createdAt: now, updatedAt: now })
    .run();
  db.insert(accounts)
    .values({
      id: accountId,
      kind: "bank",
      connectionId: null,
      institutionCode: "drill",
      displayName: "Drill Account",
      numberLast4: "0000",
      currency: "ILS",
      ownerPersonId: personId,
      note: null,
      scope: "household",
      balanceIls: null,
      balanceDate: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const rows = Array.from({ length: ROWS }, (_unused, index) => ({
    id: randomUUID(),
    firstSeenRawId: null,
    accountId,
    cardId: null,
    identityHash: `drill-${index}`,
    transactionDate: "2026-09-15",
    chargeDate: "2026-09-15",
    status: "posted",
    direction: "debit",
    amountIls: index + 0.5,
    originalAmount: index + 0.5,
    originalCurrency: "ILS",
    fxRate: null,
    fxFeeIls: null,
    descriptionRaw: `DRILL ROW ${index}`,
    descriptionNormalized: `drill row ${index}`,
    merchantId: null,
    kind: "expense",
    purchaseId: null,
    installmentIndex: null,
    installmentTotal: null,
    excludedFromTotals: false,
    exclusionReason: null,
    userNote: null,
    categoryId: null,
    classificationSource: null,
    providerCategory: null,
    createdAt: now,
    updatedAt: now,
  }));
  for (let start = 0; start < rows.length; start += 250) {
    db.insert(transactions).values(rows.slice(start, start + 250)).run();
  }
}

/** Row count plus one spot-check row, which is what step 7 of the documented
 * procedure asks an operator to eyeball. */
function fingerprint(db) {
  const rows = db.select().from(transactions).all();
  const spot = rows.find((row) => row.identityHash === `drill-${ROWS - 1}`);
  return {
    count: rows.length,
    spotDescription: spot?.descriptionRaw ?? null,
    spotAmount: spot?.amountIls ?? null,
  };
}

function copyDatabaseFiles(dbPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const copied = [];
  for (const suffix of ["", ...SIDECARS]) {
    const source = `${dbPath}${suffix}`;
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(destDir, path.basename(source)));
      copied.push(path.basename(source));
    }
  }
  return copied;
}

async function main() {
  if (!isEncryptedSqliteAvailable()) {
    process.stderr.write("Encrypted SQLite build unavailable — the restore drill cannot run.\n");
    process.exit(1);
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mt-drill-"));
  const dataDir = path.join(root, "data");
  const backupDir = path.join(root, "backup");
  const key = randomBytes(32);

  try {
    closeDb();
    const db = await initDb({ dataDir, key, skipGuards: true });
    runMigrations();
    seed(db);
    const before = fingerprint(db);
    const dbPath = resolveDbPath(dataDir);

    // Step 1 of the procedure: stop the app. Closing checkpoints the WAL, which
    // is exactly why the documented order matters.
    closeDb();
    const copied = copyDatabaseFiles(dbPath, backupDir);
    if (!copied.includes(path.basename(dbPath))) {
      throw new Error("Backup did not capture the database file");
    }

    // Steps 2-4: the live folder goes away and the backup takes its place.
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.mkdirSync(dataDir, { recursive: true });
    for (const name of copied) {
      fs.copyFileSync(path.join(backupDir, name), path.join(dataDir, name));
    }

    // Step 5: the restored file must open with the same master key. A wrong key
    // surfaces here as SQLITE_NOTADB, the first failure mode in the doc.
    const probe = openEncryptedDatabase(resolveDbPath(dataDir), key, { fileMustExist: true });
    probe.close();

    const restoredDb = await initDb({ dataDir, key, skipGuards: true });
    const after = fingerprint(restoredDb);
    closeDb();

    const mismatches = Object.keys(before).filter((field) => before[field] !== after[field]);
    if (mismatches.length > 0) {
      throw new Error(
        `Restored database does not match the original: ${mismatches
          .map((field) => `${field} ${JSON.stringify(before[field])} -> ${JSON.stringify(after[field])}`)
          .join("; ")}`,
      );
    }

    process.stdout.write(
      `Backup/restore drill OK (${copied.join(", ")}; ${after.count} transactions verified).\n`,
    );
  } finally {
    closeDb();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`backup-restore-drill failed: ${error?.stack ?? error}\n`);
  process.exit(1);
});
