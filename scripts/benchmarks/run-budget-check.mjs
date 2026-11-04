#!/usr/bin/env node
/**
 * Performance gate: builds a 50k-transaction encrypted database and times the
 * engine queries that every screen waits on, then fails if any of them exceeds
 * its budget in golden-budgets.json.
 *
 * Only headless, data-dependent work is measured here. Browser paint metrics
 * would need a driven browser and are covered by manual checks instead - see
 * memory/performance.md. Budgets carry deliberate headroom because CI runners
 * are slower and noisier than the target machine; this gate exists to catch an
 * algorithmic regression, not to police a few milliseconds.
 *
 * Requires the workspace to be built (npm run build) - it imports the packages
 * through their published entry points, exactly as the app does.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  accounts,
  categories,
  closeDb,
  getSqlite,
  initDb,
  isEncryptedSqliteAvailable,
  merchants,
  people,
  runMigrations,
  transactions,
} from "@moneytrack/db";
import {
  computeSchedule,
  queryBreakdown,
  queryDashboardKpis,
  queryMonthlySeries,
  recomputeRollupsForAllTransactions,
} from "@moneytrack/engine";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(ROOT, "golden-budgets.json");
const ROWS = 50_000;
const MONTHS = 24;
const ACCOUNT_COUNT = 4;
const MERCHANT_COUNT = 40;
const SEED = "moneytrack-v2-perf-budget";

/** Deterministic, so a change in timing is a change in the code. */
function seededRandom(seed) {
  let digest = createHash("sha256").update(seed).digest();
  let index = 0;
  return () => {
    if (index >= digest.length) {
      digest = createHash("sha256").update(digest).digest();
      index = 0;
    }
    return digest[index++] / 256;
  };
}

function nowIso() {
  return new Date().toISOString();
}

/** Month buckets ending at the current month, so date filters always hit data. */
function monthStarts(count) {
  const out = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  for (let i = count - 1; i >= 0; i -= 1) {
    const month = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - i, 1),
    );
    out.push(month.toISOString().slice(0, 10));
  }
  return out;
}

function seed(db) {
  const rand = seededRandom(SEED);
  const now = nowIso();
  const months = monthStarts(MONTHS);
  const categoryIds = db.select({ id: categories.id }).from(categories).all().map((row) => row.id);
  if (categoryIds.length === 0) {
    throw new Error("Migrations did not seed any categories");
  }

  const personIds = Array.from({ length: 4 }, () => randomUUID());
  db.insert(people)
    .values(
      personIds.map((id, index) => ({
        id,
        displayName: `Person ${index + 1}`,
        isChild: index === 3,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .run();

  const accountIds = Array.from({ length: ACCOUNT_COUNT }, () => randomUUID());
  db.insert(accounts)
    .values(
      accountIds.map((id, index) => ({
        id,
        kind: index === 0 ? "bank" : "credit_card",
        connectionId: null,
        institutionCode: "bench",
        displayName: `Account ${index + 1}`,
        numberLast4: String(1000 + index),
        currency: "ILS",
        ownerPersonId: personIds[index % personIds.length],
        note: null,
        scope: "household",
        balanceIls: null,
        balanceDate: null,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .run();

  const merchantIds = Array.from({ length: MERCHANT_COUNT }, () => randomUUID());
  db.insert(merchants)
    .values(
      merchantIds.map((id, index) => ({
        id,
        canonicalName: `BENCH MERCHANT ${index}`,
        createdAt: now,
      })),
    )
    .run();

  const rows = [];
  for (let i = 0; i < ROWS; i += 1) {
    const monthStart = months[i % MONTHS];
    const day = String(1 + Math.floor(rand() * 27)).padStart(2, "0");
    const transactionDate = `${monthStart.slice(0, 8)}${day}`;
    // Income is the minority of any real household statement; keeping the mix
    // realistic matters because the aggregates branch on direction.
    const isIncome = rand() < 0.05;
    const amount = Math.round((isIncome ? 6000 + rand() * 4000 : rand() * 900 + 10) * 100) / 100;
    rows.push({
      id: randomUUID(),
      firstSeenRawId: null,
      accountId: accountIds[i % ACCOUNT_COUNT],
      cardId: null,
      identityHash: `bench-${i}`,
      transactionDate,
      chargeDate: transactionDate,
      status: "posted",
      direction: isIncome ? "credit" : "debit",
      amountIls: amount,
      originalAmount: amount,
      originalCurrency: "ILS",
      fxRate: null,
      fxFeeIls: null,
      descriptionRaw: `BENCH MERCHANT ${i % MERCHANT_COUNT}`,
      descriptionNormalized: `bench merchant ${i % MERCHANT_COUNT}`,
      merchantId: merchantIds[i % MERCHANT_COUNT],
      kind: isIncome ? "income" : "expense",
      purchaseId: null,
      installmentIndex: null,
      installmentTotal: null,
      excludedFromTotals: false,
      exclusionReason: null,
      userNote: null,
      categoryId: categoryIds[i % categoryIds.length],
      classificationSource: "rule",
      providerCategory: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // One transaction for fifty thousand inserts; row-at-a-time would dominate
  // the runtime of this script and tell us nothing about the queries.
  const sqlite = getSqlite();
  const insertAll = sqlite.transaction(() => {
    for (let start = 0; start < rows.length; start += 500) {
      db.insert(transactions).values(rows.slice(start, start + 500)).run();
    }
  });
  insertAll();

  return { months };
}

/** Median of three timed runs after one warm-up, so a stray GC pause cannot
 * fail the build on its own. */
function measure(label, fn) {
  fn();
  const samples = [];
  for (let i = 0; i < 3; i += 1) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const median = Math.round(samples[1] * 10) / 10;
  process.stdout.write(`  ${label.padEnd(34)} ${String(median).padStart(8)} ms\n`);
  return median;
}

/** A typical Israeli three-track mortgage, so the fixed, prime-linked and
 * CPI-linked branches of the schedule all get exercised. */
const MORTGAGE_TRACKS = [
  {
    rateType: "fixed",
    margin: null,
    fixedRate: 0.045,
    termMonths: 360,
    principal: 500_000,
    amortizationMethod: "shpitzer",
    cpiBaseIndexValue: null,
    cpiConvention: null,
    rateResetMonths: null,
    originationDate: "2020-01-01",
  },
  {
    rateType: "prime_linked",
    margin: -0.005,
    fixedRate: null,
    termMonths: 360,
    principal: 300_000,
    amortizationMethod: "shpitzer",
    cpiBaseIndexValue: null,
    cpiConvention: null,
    rateResetMonths: 60,
    originationDate: "2020-01-01",
  },
  {
    rateType: "cpi_linked_fixed",
    margin: null,
    fixedRate: 0.028,
    termMonths: 360,
    principal: 200_000,
    amortizationMethod: "shpitzer",
    cpiBaseIndexValue: 100,
    cpiConvention: "known",
    rateResetMonths: null,
    originationDate: "2020-01-01",
  },
];

const MORTGAGE_ASSUMPTIONS = {
  primeObservations: [{ asOf: "2019-12-01", value: 0.06 }],
  cpiObservations: [{ asOf: "2019-12-01", value: 100 }],
};

function runMeasurements(db, months) {
  const lastMonth = months[months.length - 1];
  const monthFilter = {
    dateBasis: "charge",
    dateFrom: lastMonth,
    dateTo: `${lastMonth.slice(0, 8)}28`,
  };
  const yearFilter = {
    dateBasis: "charge",
    dateFrom: months[months.length - 12],
    dateTo: `${lastMonth.slice(0, 8)}28`,
  };
  const fullFilter = {
    dateBasis: "charge",
    dateFrom: months[0],
    dateTo: `${lastMonth.slice(0, 8)}28`,
  };
  process.stdout.write(`Measured over ${ROWS.toLocaleString("en-US")} transactions:\n`);
  return {
    dashboardAggregate: measure("dashboardAggregate", () =>
      queryDashboardKpis(db, monthFilter),
    ),
    breakdownByCategory: measure("breakdownByCategory", () =>
      queryBreakdown(db, yearFilter, "category", "expense"),
    ),
    breakdownByMerchant: measure("breakdownByMerchant", () =>
      queryBreakdown(db, yearFilter, "merchant", "expense"),
    ),
    monthlySeries: measure("monthlySeries", () => queryMonthlySeries(db, fullFilter)),
    rollupRebuild: measure("rollupRebuild", () => recomputeRollupsForAllTransactions(db)),
    mortgageAmortization3Tracks30y: measure("mortgageAmortization3Tracks30y", () => {
      for (const track of MORTGAGE_TRACKS) {
        computeSchedule(track, MORTGAGE_ASSUMPTIONS);
      }
    }),
  };
}

async function main() {
  if (!isEncryptedSqliteAvailable()) {
    process.stderr.write(
      "Encrypted SQLite build unavailable — the performance gate cannot run.\n",
    );
    process.exit(1);
  }

  const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
  if (golden.expectedRows !== ROWS) {
    process.stderr.write(
      `Budgets were measured at ${golden.expectedRows} rows but this run seeds ${ROWS}; re-measure before comparing.\n`,
    );
    process.exit(1);
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-bench-"));

  let measured;
  try {
    closeDb();
    const db = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
    const { months } = seed(db);
    measured = runMeasurements(db, months);
  } finally {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const failures = [];
  for (const [metric, limitMs] of Object.entries(golden.budgetsMs)) {
    const value = measured[metric];
    if (typeof value !== "number") {
      failures.push(`${metric}: budget declared but never measured`);
    } else if (value > limitMs) {
      failures.push(`${metric}: ${value}ms exceeds budget ${limitMs}ms`);
    }
  }
  for (const metric of Object.keys(measured)) {
    if (!(metric in golden.budgetsMs)) {
      failures.push(`${metric}: measured but has no budget in golden-budgets.json`);
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`\nPerformance budget regression:\n${failures.join("\n")}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `\nPerformance budget OK (${Object.keys(measured).length} metrics within budget).\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`run-budget-check failed: ${error?.stack ?? error}\n`);
  process.exit(1);
});
