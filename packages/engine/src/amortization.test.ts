import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  accounts,
  eq,
  loanScheduleRows,
  loanTracks,
  loans,
  netWorthSnapshots,
  people,
  rawAccounts,
  scrapeRuns,
} from "@moneytrack/db";
import { closeDb, initDb, runMigrations, type MoneyTrackDb } from "@moneytrack/db";
import { isEncryptedSqliteAvailable } from "@moneytrack/db";
import {
  buildAssumptionSetId,
  compareEarlyRepayment,
  computeNetWorth,
  computeSchedule,
  persistNetWorthSnapshot,
  recomputeTrackSchedule,
  roundToAgora,
  seedReferenceObservation,
  totalLoanLiabilitiesAt,
  loadAssumptionInputs,
} from "./index.js";


function primeObservations(
  startPrime: number,
  changes: Array<{ fromPeriod: number; prime: number }> = [],
): Array<{ asOf: string; value: number }> {
  const rows: Array<{ asOf: string; value: number }> = [];
  let current = startPrime;
  for (let month = 0; month <= 360; month += 1) {
    const year = 2020 + Math.floor(month / 12);
    const asOf = `${year}-${String(((month % 12) + 1)).padStart(2, "0")}-15`;
    for (const change of changes) {
      if (month >= change.fromPeriod) {
        current = change.prime;
      }
    }
    rows.push({ asOf, value: current });
  }
  return rows;
}

function cpiObservations(
  baseValue: number,
  monthlyGrowth = 0.002,
): Array<{ asOf: string; value: number }> {
  const rows: Array<{ asOf: string; value: number }> = [];
  for (let month = 0; month <= 360; month += 1) {
    const year = 2020 + Math.floor(month / 12);
    const asOf = `${year}-${String(((month % 12) + 1)).padStart(2, "0")}-15`;
    const value = roundToAgora(baseValue * (1 + monthlyGrowth) ** month);
    rows.push({ asOf, value });
  }
  return rows;
}

describe("roundToAgora", () => {
  it("rounds half-up to two decimals", () => {
    expect(roundToAgora(1.005)).toBe(1.01);
    expect(roundToAgora(1.004)).toBe(1);
    expect(roundToAgora(4490.445)).toBe(4490.45);
  });
});

describe("computeSchedule", () => {
  it("shpitzer fixed: principal parts sum to original principal", () => {
    const principal = 1_000_000;
    const result = computeSchedule(
      {
        rateType: "fixed",
        margin: null,
        fixedRate: 3.5,
        termMonths: 360,
        principal,
        amortizationMethod: "shpitzer",
        cpiBaseIndexValue: null,
        cpiConvention: null,
        rateResetMonths: null,
        originationDate: "2020-01-01",
      },
      { primeObservations: [], cpiObservations: [] },
    );

    const sumPrincipal = roundToAgora(
      result.rows.reduce((sum, row) => sum + row.principalPart, 0),
    );
    expect(sumPrincipal).toBe(principal);
    expect(result.rows[0]?.totalPayment).toBe(4490.45);
    expect(result.rows.at(-1)?.remainingPrincipal).toBe(0);
  });

  it("equal principal fixed: constant principal part", () => {
    const principal = 600_000;
    const result = computeSchedule(
      {
        rateType: "fixed",
        margin: null,
        fixedRate: 4,
        termMonths: 120,
        principal,
        amortizationMethod: "equal_principal",
        cpiBaseIndexValue: null,
        cpiConvention: null,
        rateResetMonths: null,
        originationDate: "2021-06-01",
      },
      { primeObservations: [], cpiObservations: [] },
    );

    const expectedPart = roundToAgora(principal / 120);
    expect(result.rows[0]?.principalPart).toBe(expectedPart);
    expect(result.rows[1]?.principalPart).toBe(expectedPart);
    const sumPrincipal = roundToAgora(
      result.rows.reduce((sum, row) => sum + row.principalPart, 0),
    );
    expect(sumPrincipal).toBe(principal);
  });

  it("cpi known vs for_month produce different adjustments", () => {
    const assumptions = {
      primeObservations: [],
      cpiObservations: cpiObservations(100, 0.01),
    };
    const base = {
      rateType: "cpi_linked_fixed" as const,
      margin: null,
      fixedRate: 3,
      termMonths: 24,
      principal: 500_000,
      amortizationMethod: "shpitzer" as const,
      cpiBaseIndexValue: 100,
      rateResetMonths: null,
      originationDate: "2020-01-01",
    };

    const known = computeSchedule(
      { ...base, cpiConvention: "known" },
      assumptions,
    );
    const forMonth = computeSchedule(
      { ...base, cpiConvention: "for_month" },
      assumptions,
    );

    expect(known.rows[1]?.cpiAdjustment).not.toBe(forMonth.rows[1]?.cpiAdjustment);
    expect(known.totalInterest).not.toBe(forMonth.totalInterest);
  });

  it("cpi rebasing keeps payment ratios when index values are restated", () => {
    const month = "2020-03-15";
    const oldBaseObservations = [
      { asOf: "2020-01-15", value: 100 },
      { asOf: month, value: 102 },
    ];
    const newBaseObservations = [
      { asOf: "2020-01-15", value: 200 },
      { asOf: month, value: 204 },
    ];

    const track = {
      rateType: "cpi_linked_fixed" as const,
      margin: null,
      fixedRate: 3,
      termMonths: 12,
      principal: 400_000,
      amortizationMethod: "shpitzer" as const,
      cpiBaseIndexValue: 100,
      cpiConvention: "known" as const,
      rateResetMonths: null,
      originationDate: "2020-01-01",
    };

    const oldSchedule = computeSchedule(track, {
      primeObservations: [],
      cpiObservations: oldBaseObservations,
    });
    const restatedTrack = { ...track, cpiBaseIndexValue: 200 };
    const newSchedule = computeSchedule(restatedTrack, {
      primeObservations: [],
      cpiObservations: newBaseObservations,
    });

    const oldRow = oldSchedule.rows.find((row) => row.dueDate === "2020-03-01");
    const newRow = newSchedule.rows.find((row) => row.dueDate === "2020-03-01");
    expect(oldRow?.cpiAdjustment).toBe(newRow?.cpiAdjustment);
    expect(oldRow?.totalPayment).toBe(newRow?.totalPayment);
  });

  it("prime reset changes interest after reset boundary", () => {
    const assumptions = {
      primeObservations: primeObservations(4, [{ fromPeriod: 12, prime: 5.5 }]),
      cpiObservations: [],
    };
    const result = computeSchedule(
      {
        rateType: "prime_linked",
        margin: 0.5,
        fixedRate: null,
        termMonths: 36,
        principal: 800_000,
        amortizationMethod: "shpitzer",
        cpiBaseIndexValue: null,
        cpiConvention: null,
        rateResetMonths: 12,
        originationDate: "2020-01-01",
      },
      assumptions,
    );

    const beforeReset = result.rows[11];
    const afterReset = result.rows[12];
    if (!beforeReset || !afterReset) {
      throw new Error("expected reset boundary rows");
    }
    expect(afterReset.interestPart).toBeGreaterThan(beforeReset.interestPart);
  });

  it("early repayment reduces interest and shortens schedule", () => {
    const track = {
      rateType: "fixed" as const,
      margin: null,
      fixedRate: 3.5,
      termMonths: 240,
      principal: 900_000,
      amortizationMethod: "shpitzer" as const,
      cpiBaseIndexValue: null,
      cpiConvention: null,
      rateResetMonths: null,
      originationDate: "2020-01-01",
    };
    const assumptions = { primeObservations: [], cpiObservations: [] };
    const comparison = compareEarlyRepayment(track, assumptions, 100_000);

    expect(comparison.interestSaved).toBeGreaterThan(0);
    expect(comparison.scenario.totalPrincipal).toBe(roundToAgora(800_000));
  });
});

describe("loan schedule persistence", () => {
  let cleanup: () => void;
  let db: MoneyTrackDb;

  afterEach(() => {
    cleanup?.();
  });

  it.skipIf(!isEncryptedSqliteAvailable())("recomputes schedule rows and net worth liabilities", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-loans-"));
    closeDb();
    db = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
    cleanup = () => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    };

    const now = new Date().toISOString();
    const personId = randomUUID();
    db.insert(people)
      .values({ id: personId, displayName: "Borrower", isChild: false, createdAt: now, updatedAt: now })
      .run();

    const accountId = randomUUID();
    db.insert(accounts)
      .values({
        id: accountId,
        kind: "loan",
        connectionId: null,
        institutionCode: "manual",
        displayName: "Mortgage",
        numberLast4: null,
        currency: "ILS",
        ownerPersonId: personId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const loanId = randomUUID();
    db.insert(loans)
      .values({
        id: loanId,
        accountId,
        kind: "mortgage",
        lender: "Bank",
        originationDate: "2020-01-01",
        originalPrincipal: 1_000_000,
        createdAt: now,
      })
      .run();

    const trackId = randomUUID();
    db.insert(loanTracks)
      .values({
        id: trackId,
        loanId,
        rateType: "fixed",
        margin: null,
        fixedRate: 3.5,
        termMonths: 360,
        principal: 1_000_000,
        amortizationMethod: "shpitzer",
        cpiBaseIndexValue: null,
        cpiConvention: "known",
        rateResetMonths: null,
        createdAt: now,
      })
      .run();

    seedReferenceObservation(db, "prime", "2020-01-15", 4);
    const result = recomputeTrackSchedule(db, trackId);
    const stored = db.select().from(loanScheduleRows).where(eq(loanScheduleRows.trackId, trackId)).all();
    expect(stored.length).toBe(result.rows.length);
    expect(result.assumptionSetId).toBe(buildAssumptionSetId(loadAssumptionInputs(db)));

    const liabilities = totalLoanLiabilitiesAt(db, "2020-06-01");
    expect(liabilities).toBeGreaterThan(0);
    expect(liabilities).toBeLessThan(1_000_000);

    const snapshotId = persistNetWorthSnapshot(db, "2020-06-01");
    const netWorth = computeNetWorth(db, "2020-06-01");
    expect(netWorth.totalLiabilitiesIls).toBe(liabilities);
    expect(snapshotId).toBeTruthy();
  });
});

describe("net worth from accounts", () => {
  let cleanup: () => void;
  let db: MoneyTrackDb;

  afterEach(() => {
    cleanup?.();
  });

  it.skipIf(!isEncryptedSqliteAvailable())(
    "keeps bank assets after raw account copies are deleted",
    async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-nw-"));
      closeDb();
      db = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
      runMigrations();
      cleanup = () => {
        closeDb();
        fs.rmSync(tmpDir, { recursive: true, force: true });
      };

      const now = new Date().toISOString();
      const personId = randomUUID();
      db.insert(people)
        .values({ id: personId, displayName: "Owner", isChild: false, createdAt: now, updatedAt: now })
        .run();

      const accountId = randomUUID();
      db.insert(accounts)
        .values({
          id: accountId,
          kind: "checking",
          connectionId: null,
          institutionCode: "manual",
          displayName: "Checking",
          numberLast4: "1234",
          currency: "ILS",
          ownerPersonId: personId,
          balanceIls: 12_500,
          balanceDate: "2026-03-01",
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const runId = randomUUID();
      db.insert(scrapeRuns)
        .values({
          id: runId,
          connectionId: randomUUID(),
          providerCode: "isracard",
          startedAt: now,
          finishedAt: now,
          status: "success",
          errorClass: null,
          errorMessageRedacted: null,
          libraryVersion: "mock",
        })
        .run();

      db.insert(rawAccounts)
        .values({
          id: randomUUID(),
          runId,
          providerAccountNumber: "9999",
          balance: 1,
          balanceDate: "2026-03-01",
          cardFrame: null,
          cardType: null,
          currency: "ILS",
          savingsAccount: false,
          ingestedAt: now,
        })
        .run();

      const asOf = "2026-03-15";
      const before = computeNetWorth(db, asOf);
      expect(before.totalAssetsIls).toBe(12_500);

      db.delete(rawAccounts).run();
      db.delete(scrapeRuns).run();

      const after = computeNetWorth(db, asOf);
      expect(after.totalAssetsIls).toBe(12_500);
    },
  );

  it.skipIf(!isEncryptedSqliteAvailable())("stores one net worth snapshot row per asOf", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-nw-snap-"));
    closeDb();
    db = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
    cleanup = () => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    };

    const asOf = "2026-04-01";
    persistNetWorthSnapshot(db, asOf);
    persistNetWorthSnapshot(db, asOf);

    const rows = db.select().from(netWorthSnapshots).where(eq(netWorthSnapshots.asOf, asOf)).all();
    expect(rows.length).toBe(1);
  });
});