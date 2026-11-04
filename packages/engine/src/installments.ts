import { randomUUID } from "node:crypto";
import {
  accounts,
  cards,
  eq,
  purchases,
  rawAccounts,
  rawTransactions,
  scrapeRuns,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { nowIso, periodFromDate, shiftMonths } from "./dates.js";

/** Scraper shifts installment date forward by (number - 1) months when combineInstallments=false. */
export function reverseInstallmentDateShift(
  scraperDate: string,
  installmentIndex: number,
): string {
  if (!installmentIndex || installmentIndex <= 1) {
    return scraperDate;
  }
  return shiftMonths(scraperDate, -(installmentIndex - 1));
}

export function resolveCardForAccount(
  db: MoneyTrackDb,
  accountId: string,
  providerAccountNumber?: string,
): string | null {
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) {
    return null;
  }

  const last4 = providerAccountNumber?.slice(-4) ?? account.numberLast4;
  if (!last4) {
    return null;
  }

  const card = db
    .select()
    .from(cards)
    .all()
    .find((row) => row.last4 === last4);
  return card?.id ?? null;
}

function findOrCreatePurchase(
  db: MoneyTrackDb,
  cardId: string,
  merchantKey: string,
  purchaseDate: string,
  installmentTotal: number,
  originalTotal: number,
): string {
  const existingPurchases = db.select().from(purchases).where(eq(purchases.cardId, cardId)).all();
  const match = existingPurchases.find(
    (row) =>
      row.installmentTotal === installmentTotal &&
      Math.abs(row.originalTotalAmount - originalTotal) < 0.01 &&
      row.purchaseDate === purchaseDate,
  );
  if (match) {
    return match.id;
  }

  const id = randomUUID();
  db.insert(purchases)
    .values({
      id,
      originalTotalAmount: originalTotal,
      purchaseDate,
      installmentTotal,
      cardId,
      merchantId: merchantKey.length === 36 ? merchantKey : null,
      createdAt: nowIso(),
    })
    .run();
  return id;
}

/** Reconstruct purchases and link installment children for rows touched in a scrape run. */
export function processInstallments(
  db: MoneyTrackDb,
  runId: string,
): Set<string> {
  const dirtyPeriods = new Set<string>();
  const run = db.select().from(scrapeRuns).where(eq(scrapeRuns.id, runId)).get();
  if (!run) {
    return dirtyPeriods;
  }

  const rawRows = db.select().from(rawTransactions).where(eq(rawTransactions.runId, runId)).all();
  const rawAccountByNumber = new Map(
    db.select().from(rawAccounts).where(eq(rawAccounts.runId, runId)).all().map((row) => [
      row.providerAccountNumber,
      row,
    ]),
  );

  for (const raw of rawRows) {
    const txn = db
      .select()
      .from(transactions)
      .all()
      .find((row) => row.firstSeenRawId === raw.id);
    if (!txn) {
      continue;
    }

    if (!txn.installmentIndex || !txn.installmentTotal || txn.installmentTotal <= 1) {
      continue;
    }

    const rawAccount = rawAccountByNumber.get(raw.providerAccountNumber);
    let cardId =
      txn.cardId ??
      resolveCardForAccount(db, txn.accountId, raw.providerAccountNumber) ??
      null;

    if (!cardId && rawAccount?.cardFrame) {
      const frameLast4 = rawAccount.cardFrame.slice(-4);
      const card = db
        .select()
        .from(cards)
        .all()
        .find((row) => row.last4 === frameLast4);
      cardId = card?.id ?? null;
    }

    if (!cardId) {
      continue;
    }

    const purchaseDate = reverseInstallmentDateShift(txn.transactionDate, txn.installmentIndex);
    const originalTotal = txn.amountIls * txn.installmentTotal;
    const merchantKey = txn.merchantId ?? txn.descriptionNormalized;
    const purchaseId = findOrCreatePurchase(
      db,
      cardId,
      merchantKey,
      purchaseDate,
      txn.installmentTotal,
      originalTotal,
    );

    const timestamp = nowIso();
    db.update(transactions)
      .set({
        cardId,
        purchaseId,
        transactionDate: purchaseDate,
        updatedAt: timestamp,
      })
      .where(eq(transactions.id, txn.id))
      .run();

    dirtyPeriods.add(periodFromDate(purchaseDate));
    dirtyPeriods.add(periodFromDate(txn.chargeDate));
    dirtyPeriods.add(periodFromDate(txn.transactionDate));
  }

  return dirtyPeriods;
}

/** Full purchase amount at original purchase date (not monthly installment slices). */
export function queryPurchaseTotalsByPurchaseDate(
  db: MoneyTrackDb,
  dateFrom?: string,
  dateTo?: string,
): { purchaseDate: string; totalAmountIls: number; purchaseCount: number }[] {
  const rows = db.select().from(purchases).all();
  const grouped = new Map<string, { total: number; count: number }>();

  for (const row of rows) {
    if (dateFrom && row.purchaseDate < dateFrom) {
      continue;
    }
    if (dateTo && row.purchaseDate > dateTo) {
      continue;
    }
    const bucket = grouped.get(row.purchaseDate) ?? { total: 0, count: 0 };
    bucket.total += row.originalTotalAmount;
    bucket.count += 1;
    grouped.set(row.purchaseDate, bucket);
  }

  return [...grouped.entries()]
    .map(([purchaseDate, bucket]) => ({
      purchaseDate,
      totalAmountIls: bucket.total,
      purchaseCount: bucket.count,
    }))
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
}

/** Monthly cash outflow from installment charge slices. */
export function queryInstallmentCashOutflow(
  db: MoneyTrackDb,
  dateBasis: "transaction" | "charge" = "charge",
  dateFrom?: string,
  dateTo?: string,
): { period: string; totalAmountIls: number; transactionCount: number }[] {
  const rows = db
    .select()
    .from(transactions)
    .all()
    .filter((row) => row.purchaseId !== null && !row.excludedFromTotals);

  const grouped = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const basisDate = dateBasis === "charge" ? row.chargeDate : row.transactionDate;
    if (dateFrom && basisDate < dateFrom) {
      continue;
    }
    if (dateTo && basisDate > dateTo) {
      continue;
    }
    const period = periodFromDate(basisDate);
    const bucket = grouped.get(period) ?? { total: 0, count: 0 };
    bucket.total += row.amountIls;
    bucket.count += 1;
    grouped.set(period, bucket);
  }

  return [...grouped.entries()]
    .map(([period, bucket]) => ({
      period,
      totalAmountIls: bucket.total,
      transactionCount: bucket.count,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

export function collectInstallmentPeriods(db: MoneyTrackDb, runId: string): Set<string> {
  return processInstallments(db, runId);
}
