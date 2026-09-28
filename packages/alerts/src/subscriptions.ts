import { randomUUID } from "node:crypto";
import {
  eq,
  merchants,
  recurringInstruments,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { upsertOpenAlert } from "./alert-store.js";
import { amountsClose } from "./stats.js";

const PRICE_INCREASE_THRESHOLD = 0.1;
const MIN_OCCURRENCES = 3;
const MONTHLY_MIN_DAYS = 25;
const MONTHLY_MAX_DAYS = 35;

function nowIso(): string {
  return new Date().toISOString();
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatIls(amount: number): string {
  return `${amount.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ₪`;
}

type RecurringCandidate = {
  merchantId: string;
  accountId: string;
  amounts: number[];
  dates: string[];
  transactionIds: string[];
};

function groupRecurringCandidates(db: MoneyTrackDb): RecurringCandidate[] {
  const expenses = db
    .select()
    .from(transactions)
    .all()
    .filter(
      (row) =>
        row.direction === "debit" &&
        row.kind === "expense" &&
        !row.excludedFromTotals &&
        row.merchantId,
    )
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

  const byMerchant = new Map<string, typeof expenses>();
  for (const txn of expenses) {
    const key = txn.merchantId!;
    const list = byMerchant.get(key) ?? [];
    list.push(txn);
    byMerchant.set(key, list);
  }

  const candidates: RecurringCandidate[] = [];
  for (const [merchantId, rows] of byMerchant) {
    // Group by account only. Grouping by amount would split a subscription in
    // two the moment its price changes, making price increases undetectable.
    const byAccount = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byAccount.get(row.accountId) ?? [];
      list.push(row);
      byAccount.set(row.accountId, list);
    }

    for (const [accountId, group] of byAccount) {
      if (group.length < MIN_OCCURRENCES) {
        continue;
      }

      const intervals: number[] = [];
      for (let i = 1; i < group.length; i += 1) {
        intervals.push(daysBetween(group[i - 1]!.transactionDate, group[i]!.transactionDate));
      }
      const monthlyLike = intervals.filter(
        (d) => d >= MONTHLY_MIN_DAYS && d <= MONTHLY_MAX_DAYS,
      ).length;
      if (monthlyLike < MIN_OCCURRENCES - 1) {
        continue;
      }

      candidates.push({
        merchantId,
        accountId,
        amounts: group.map((r) => r.amountIls),
        dates: group.map((r) => r.transactionDate),
        transactionIds: group.map((r) => r.id),
      });
    }
  }

  return candidates;
}

/** Price points of the series, collapsing runs of the same charge amount. */
function priceHistoryOf(candidate: RecurringCandidate): { date: string; amount: number }[] {
  const history: { date: string; amount: number }[] = [];
  candidate.amounts.forEach((amount, index) => {
    const previous = history.at(-1);
    if (!previous || !amountsClose(previous.amount, amount)) {
      history.push({ date: candidate.dates[index]!, amount });
    }
  });
  return history;
}

export function detectSubscriptions(db: MoneyTrackDb): number {
  const candidates = groupRecurringCandidates(db);
  let upserted = 0;

  for (const candidate of candidates) {
    const latestAmount = candidate.amounts.at(-1)!;
    const latestDate = candidate.dates.at(-1)!;
    const history = priceHistoryOf(candidate);
    const priorAmount = history.at(-2)?.amount;

    if (priorAmount !== undefined && priorAmount > 0) {
      const increase = (latestAmount - priorAmount) / priorAmount;
      if (increase > PRICE_INCREASE_THRESHOLD) {
        const merchant = db
          .select()
          .from(merchants)
          .all()
          .find((row) => row.id === candidate.merchantId);
        const pct = Math.round(increase * 100);
        upsertOpenAlert(db, {
          type: "price_increase",
          severity: increase > 0.25 ? "critical" : "warning",
          title: "עליית מחיר במנוי",
          message: `עליית מחיר: ${merchant?.canonicalName ?? "ספק"} עלה ב-${pct}% ל-${formatIls(latestAmount)}`,
          transactionId: candidate.transactionIds.at(-1),
          metadata: {
            merchantId: candidate.merchantId,
            priorAmount,
            newAmount: latestAmount,
            increasePct: pct,
          },
          dedupeKey: `price:${candidate.merchantId}:${latestDate}`,
        });
      }
    }

    const existing = db
      .select()
      .from(recurringInstruments)
      .all()
      .find(
        (row) =>
          row.merchantId === candidate.merchantId &&
          row.accountId === candidate.accountId,
      );

    if (existing) {
      db.update(recurringInstruments)
        .set({
          expectedAmount: latestAmount,
          lastSeen: latestDate,
          status: "active",
          priceHistory: JSON.stringify(history),
        })
        .where(eq(recurringInstruments.id, existing.id))
        .run();
      upserted += 1;
      continue;
    }

    db.insert(recurringInstruments)
      .values({
        id: randomUUID(),
        merchantId: candidate.merchantId,
        accountId: candidate.accountId,
        cadence: "monthly",
        expectedAmount: latestAmount,
        lastSeen: latestDate,
        status: "active",
        priceHistory: JSON.stringify(history),
        createdAt: nowIso(),
      })
      .run();
    upserted += 1;
  }

  return upserted;
}
