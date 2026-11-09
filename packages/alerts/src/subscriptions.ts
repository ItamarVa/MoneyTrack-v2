import { randomUUID } from "node:crypto";
import {
  eq,
  merchants,
  recurringInstruments,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { upsertOpenAlert } from "./alert-store.js";
import {
  buildSubscriptionCategoryCheck,
  looksLikeNonSubscriptionPayee,
  looksLikePersonToPerson,
} from "./detection-rules.js";
import { loadDetectableTransactions, type DetectableTransaction } from "./eligible-transactions.js";
import { amountsClose, median } from "./stats.js";

const PRICE_INCREASE_THRESHOLD = 0.1;
const MIN_INCREASE_ILS = 10;
const MIN_OCCURRENCES = 3;
/** Charges at one stable price (monthly apart) required before a rise counts. */
const MIN_STABLE_CHARGES = 3;
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
  return `${amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`;
}

export type PriceIncrease = { priorAmount: number; newAmount: number; increase: number };

/**
 * A real subscription price rise: the last charge exceeds a stable earlier price by at
 * least 10% and 10 ₪, after >=3 monthly charges at that price (each within 5% of the
 * previous). Rows must be one merchant+account series sorted by date. P2P wording, payees
 * such as community or youth-movement dues, and non-subscription categories never qualify.
 */
export function evaluatePriceIncrease(
  rows: DetectableTransaction[],
  merchantName: string,
  categoryAllowed: (categoryId: string | null) => boolean,
): PriceIncrease | null {
  if (rows.length < MIN_STABLE_CHARGES + 1) {
    return null;
  }
  const anchor = rows[rows.length - 2]!;
  const stable: DetectableTransaction[] = [];
  for (let i = rows.length - 2; i >= 0; i -= 1) {
    const gap = daysBetween(rows[i]!.transactionDate, rows[i + 1]!.transactionDate);
    if (
      gap < MONTHLY_MIN_DAYS ||
      gap > MONTHLY_MAX_DAYS ||
      !amountsClose(rows[i]!.amountIls, anchor.amountIls)
    ) {
      break;
    }
    stable.push(rows[i]!);
  }
  if (stable.length < MIN_STABLE_CHARGES) {
    return null;
  }

  const priorAmount = median(stable.map((row) => row.amountIls));
  const newAmount = rows[rows.length - 1]!.amountIls;
  const increase = priorAmount > 0 ? (newAmount - priorAmount) / priorAmount : 0;
  if (increase < PRICE_INCREASE_THRESHOLD || newAmount - priorAmount < MIN_INCREASE_ILS) {
    return null;
  }

  const series = [...stable, rows[rows.length - 1]!];
  const text = [merchantName, ...series.map((row) => `${row.descriptionRaw} ${row.descriptionNormalized}`)].join(" ");
  if (
    looksLikePersonToPerson(text) ||
    looksLikeNonSubscriptionPayee(text) ||
    !series.every((row) => categoryAllowed(row.categoryId))
  ) {
    return null;
  }
  return { priorAmount, newAmount, increase };
}

/** True when an open price_increase alert on this transaction still qualifies. */
export function buildPriceIncreaseQualifier(db: MoneyTrackDb): (transactionId: string) => boolean {
  const names = merchantNames(db);
  const categoryAllowed = buildSubscriptionCategoryCheck(db);
  const seriesOf = new Map<string, DetectableTransaction[]>();
  const keyOf = new Map<string, { key: string; index: number }>();
  for (const [key, rows] of groupSeries(loadDetectableTransactions(db))) {
    seriesOf.set(key, rows);
    rows.forEach((row, index) => keyOf.set(row.id, { key, index }));
  }
  return (transactionId) => {
    const hit = keyOf.get(transactionId);
    if (!hit) {
      return false;
    }
    const rows = seriesOf.get(hit.key)!.slice(0, hit.index + 1);
    return evaluatePriceIncrease(rows, names.get(rows[0]!.merchantId!) ?? "", categoryAllowed) !== null;
  };
}

function merchantNames(db: MoneyTrackDb): Map<string, string> {
  return new Map(
    db
      .select()
      .from(merchants)
      .all()
      .map((row) => [row.id, row.canonicalName] as const),
  );
}

/** Rows with a merchant, grouped by merchant+account (price changes must not split a series). */
function groupSeries(rows: DetectableTransaction[]): Map<string, DetectableTransaction[]> {
  const groups = new Map<string, DetectableTransaction[]>();
  const sorted = rows
    .filter((row) => row.merchantId)
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.id.localeCompare(b.id));
  for (const row of sorted) {
    const key = `${row.merchantId}|${row.accountId}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return groups;
}

type RecurringCandidate = {
  merchantId: string;
  accountId: string;
  amounts: number[];
  dates: string[];
  transactionIds: string[];
  rows: DetectableTransaction[];
};

function groupRecurringCandidates(db: MoneyTrackDb): RecurringCandidate[] {
  const candidates: RecurringCandidate[] = [];
  for (const group of groupSeries(loadDetectableTransactions(db)).values()) {
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
      merchantId: group[0]!.merchantId!,
      accountId: group[0]!.accountId,
      amounts: group.map((r) => r.amountIls),
      dates: group.map((r) => r.transactionDate),
      transactionIds: group.map((r) => r.id),
      rows: group,
    });
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
  const names = merchantNames(db);
  const categoryAllowed = buildSubscriptionCategoryCheck(db);
  let upserted = 0;

  for (const candidate of candidates) {
    const latestAmount = candidate.amounts.at(-1)!;
    const latestDate = candidate.dates.at(-1)!;
    const history = priceHistoryOf(candidate);
    const merchantName = names.get(candidate.merchantId) ?? "ספק";
    const rise = evaluatePriceIncrease(candidate.rows, merchantName, categoryAllowed);

    if (rise) {
      const pct = Math.round(rise.increase * 100);
      upsertOpenAlert(db, {
        type: "price_increase",
        severity: rise.increase > 0.25 ? "critical" : "warning",
        title: "עליית מחיר במנוי",
        message: `${merchantName}: עכשיו ${formatIls(rise.newAmount)} במקום ${formatIls(rise.priorAmount)} (עלייה של ${pct}%)`,
        transactionId: candidate.transactionIds.at(-1),
        metadata: {
          merchantId: candidate.merchantId,
          priorAmount: rise.priorAmount,
          newAmount: rise.newAmount,
          increasePct: pct,
        },
        dedupeKey: `price:${candidate.merchantId}:${latestDate}`,
      });
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
