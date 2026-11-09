/**
 * Card-bill reconciliation: for each household credit card and charge month, the bank's debit
 * for that card versus the sum of the card's own rows charged that month. A gap means the card
 * details are incomplete (mostly a missing statement-file upload for an unsynced card).
 * Read-only: it never links or excludes anything; `processCardSettlements` / links.ts own that.
 * Rules (inclusion, sign, matching, month assignment, coverage): MEM-DOMAIN "Card-bill reconciliation".
 * Used by: apps/web GET /api/credit/reconciliation.
 */
import { accounts, cards, transactionLinks, transactions, type MoneyTrackDb } from "@moneytrack/db";
import { resolveCardIssuer } from "./settlement.js";
import { addDays, periodFromDate, shiftMonths } from "./dates.js";

export type ReconciliationStatus = "match" | "mismatch" | "no_bill" | "open" | "no_details";

/** One bank debit counted in `billed` (signed: refunds negative); `id` is the bank transaction id. */
export type ReconciliationDebit = { id: string; date: string; amount: number; description: string };

export type ReconciliationMonth = {
  month: string;
  /** Bank debit(s) for this card and month; null when none was found. */
  billed: number | null;
  detailed: number;
  /** billed - detailed; null when nothing was billed. */
  diff: number | null;
  status: ReconciliationStatus;
  /** One bank row paid several cards: billed and detailed are the whole group's totals. */
  combined: boolean;
  /** Bank debits counted in `billed` (empty when none), so a gap can be traced. */
  debits: ReconciliationDebit[];
  /**
   * Issuer debits in this month's window that are not part of the bill (another card of the
   * issuer, transfers, prepaid loads). Informational only, never a problem by themselves.
   */
  extras: ReconciliationDebit[];
};

export type ReconCardAccount = { id: string; institutionCode: string; last4s: readonly string[] };
export type ReconCardRow = {
  accountId: string;
  chargeDate: string;
  direction: string;
  amountIls: number;
  status: string;
  /** "file" = statement upload (complete month), "sync" = scraper (first month partial). */
  source: string;
};
export type ReconSettlement = {
  /** Bank transaction id, so the UI can open the row. */
  id: string;
  date: string;
  direction: string;
  amountIls: number;
  /** Matching text (raw + normalized description). */
  description: string;
  /** Shown to the user in `debits`. */
  label: string;
  /** Card accounts of rows the engine already linked to this bank row (card_settlement links). */
  linkedAccountIds: readonly string[];
};
export type ReconInput = {
  cards: readonly ReconCardAccount[];
  cardRows: readonly ReconCardRow[];
  settlements: readonly ReconSettlement[];
  /** Earliest bank-row date; before it a missing debit proves nothing. Null = no bank data. */
  bankCoverageStart: string | null;
  from: string;
  to: string;
  today: string;
};

const MATCH_TOLERANCE_ILS = 1;
// The main bill can reach the bank a day or two after the charge date (weekend shift); more
// would swallow interim debits made just after a charge, which belong to the next one.
const POST_CHARGE_GRACE_DAYS = 2;
// Interim debits are made during the month before the charge they belong to.
const INTERIM_WINDOW_DAYS = 31;
// Exhaustive subset search is 2^n per month; 16 keeps it at 65k sums.
const MAX_SUBSET_CANDIDATES = 16;

const round = (amount: number): number => Math.round(amount * 100) / 100;
const signed = (direction: string, amount: number): number => (direction === "credit" ? -amount : amount);
const dayOf = (isoDate: string): number => Number(isoDate.slice(8, 10));
const nextMonth = (month: string): string => periodFromDate(shiftMonths(`${month}-01`, 1));

/** Which card account(s) a bank settlement paid; empty when it is not one of ours. */
export function settlementTargets(
  settlement: Pick<ReconSettlement, "description" | "linkedAccountIds">,
  cardAccounts: readonly ReconCardAccount[],
): string[] {
  const known = new Set(cardAccounts.map((card) => card.id));
  const linked = [...new Set(settlement.linkedAccountIds)].filter((id) => known.has(id));
  if (linked.length > 0) return linked.sort();

  const digits: string[] = settlement.description.match(/\d{4}/g) ?? [];
  const byLast4 = cardAccounts.filter((card) => card.last4s.some((last4) => digits.includes(last4)));
  if (byLast4.length > 0) return byLast4.map((card) => card.id).sort();

  const issuer = resolveCardIssuer(settlement.description);
  if (issuer === null) return [];
  // Digits that name none of this issuer's known cards point at a card we do not hold.
  return cardAccounts
    .filter((card) => card.institutionCode.toLowerCase() === issuer)
    .filter((card) => digits.length === 0 || card.last4s.length === 0)
    .map((card) => card.id)
    .sort();
}

/**
 * The charge month a bank debit pays (MEM-DOMAIN "Card-bill reconciliation"): the first known
 * charge date on/after the debit (less a weekend grace) when it is at most a month ahead, so
 * interim debits during the month count toward the next bill. Otherwise (no rows that month, or
 * past the last known charge) the month is projected from the card's charge day.
 */
export function billedMonth(date: string, sortedChargeDates: readonly string[]): string {
  const next = sortedChargeDates.find((charge) => charge >= addDays(date, -POST_CHARGE_GRACE_DAYS));
  if (next !== undefined && next <= addDays(date, INTERIM_WINDOW_DAYS)) return periodFromDate(next);
  const reference = next ?? sortedChargeDates.at(-1);
  if (reference === undefined) return periodFromDate(date);
  const month = periodFromDate(date);
  return dayOf(date) <= dayOf(reference) + POST_CHARGE_GRACE_DAYS ? month : nextMonth(month);
}

/**
 * First charge month with complete card details: every uploaded statement ("file") month is
 * complete; a scraper's first charge month only holds purchases inside its sync window, so sync
 * coverage starts the month after. A card with no rows has no entry (never covered).
 */
function coverageStarts(rows: readonly ReconCardRow[]): Map<string, string> {
  const starts = new Map<string, string>();
  for (const row of rows) {
    if (row.status === "pending") continue;
    const month = periodFromDate(row.chargeDate);
    const start = row.source === "file" ? month : nextMonth(month);
    const known = starts.get(row.accountId);
    if (known === undefined || start < known) starts.set(row.accountId, start);
  }
  return starts;
}

type Billed = { sum: number; debits: ReconciliationDebit[] };
type Settled = Pick<ReconciliationMonth, "billed" | "diff" | "status" | "debits" | "extras">;

const total = (debits: readonly ReconciliationDebit[]): number => round(debits.reduce((sum, d) => sum + d.amount, 0));
const byDate = (debits: readonly ReconciliationDebit[]): ReconciliationDebit[] =>
  [...debits].sort((a, b) => a.date.localeCompare(b.date));

/**
 * The non-empty subset of `candidates` summing to `target` within the tolerance, or null.
 * Prefers the subset with the most charge-day debits, then the smallest gap, then the fewest
 * debits. Only charge-day debits plus the largest others (up to MAX_SUBSET_CANDIDATES) are tried.
 */
export function findBillSubset(
  candidates: readonly ReconciliationDebit[],
  target: number,
  isChargeDay: (debit: ReconciliationDebit) => boolean,
): ReconciliationDebit[] | null {
  const chargeDay = candidates.filter(isChargeDay);
  const others = candidates
    .filter((debit) => !isChargeDay(debit))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  // ponytail: past 16 debits the smallest non-charge-day ones are never tried (they become extras).
  const tried = [...chargeDay, ...others].slice(0, MAX_SUBSET_CANDIDATES);
  const better = (a: readonly number[], b: readonly number[]): boolean => {
    const i = a.findIndex((value, k) => value !== b[k]);
    return i !== -1 && a[i]! < b[i]!;
  };
  let best: { mask: number; score: number[] } | null = null;
  for (let mask = 1; mask < 1 << tried.length; mask++) {
    let sum = 0;
    let onCharge = 0;
    let size = 0;
    for (let i = 0; i < tried.length; i++) {
      if ((mask & (1 << i)) === 0) continue;
      sum += tried[i]!.amount;
      size++;
      if (isChargeDay(tried[i]!)) onCharge++;
    }
    const gap = Math.abs(round(sum - target));
    if (gap > MATCH_TOLERANCE_ILS) continue;
    const score = [-onCharge, gap, size];
    if (best === null || better(score, best.score)) best = { mask, score };
  }
  if (best === null) return null;
  const mask = best.mask;
  return tried.filter((_, i) => (mask & (1 << i)) !== 0);
}

/**
 * Status and bill of one month that has bank debits (MEM-DOMAIN "Card-bill reconciliation"):
 * open / no_details keep every candidate in the bill; otherwise the subset matching the details
 * is the bill, else only the charge-day debits are; the rest are extras.
 */
function settleMonth(bill: Billed, detail: number, charged: string, covered: boolean, today: string): Settled {
  const all = byDate(bill.debits);
  const whole = (status: ReconciliationStatus): Settled =>
    ({ billed: round(bill.sum), diff: round(bill.sum - detail), status, debits: all, extras: [] });
  if (charged >= today) return whole("open");
  const from = addDays(charged, -POST_CHARGE_GRACE_DAYS);
  const until = addDays(charged, POST_CHARGE_GRACE_DAYS);
  const isChargeDay = (debit: ReconciliationDebit): boolean => debit.date >= from && debit.date <= until;
  const subset = findBillSubset(all, detail, isChargeDay);
  const split = (status: ReconciliationStatus, debits: ReconciliationDebit[]): Settled => {
    const sum = total(debits);
    const extras = all.filter((debit) => !debits.includes(debit));
    return { billed: sum, diff: round(sum - detail), status, debits: byDate(debits), extras };
  };
  if (subset !== null) return split("match", subset);
  if (!covered) return whole("no_details");
  const onCharge = all.filter(isChargeDay);
  // Nothing near the charge date: the bill itself never reached the bank.
  if (onCharge.length === 0) return { billed: null, diff: null, status: "no_bill", debits: [], extras: all };
  return split("mismatch", onCharge);
}

/** Pure core, unit-tested. Months with neither card rows nor a bill are left out. */
export function reconcileCards(input: ReconInput): Map<string, ReconciliationMonth[]> {
  const inWindow = (month: string): boolean => month >= input.from && month <= input.to;
  const detailed = new Map<string, number>(); // `${accountId}|${month}`
  const lastCharge = new Map<string, string>();
  const chargeDates = new Map<string, Set<string>>();
  for (const row of input.cardRows) {
    // Pending rows are not on any bill yet; everything posted is, whatever we classify it as.
    if (row.status === "pending") continue;
    const key = `${row.accountId}|${periodFromDate(row.chargeDate)}`;
    detailed.set(key, (detailed.get(key) ?? 0) + signed(row.direction, row.amountIls));
    if ((lastCharge.get(key) ?? "") < row.chargeDate) lastCharge.set(key, row.chargeDate);
    const dates = chargeDates.get(row.accountId) ?? new Set<string>();
    dates.add(row.chargeDate);
    chargeDates.set(row.accountId, dates);
  }
  const coverage = coverageStarts(input.cardRows);
  const datesOf = (ids: readonly string[]): string[] =>
    [...new Set(ids.flatMap((id) => [...(chargeDates.get(id) ?? [])]))].sort();

  const billed = new Map<string, Billed>(); // `${sortedIds}|${month}`
  for (const settlement of input.settlements) {
    const targets = settlementTargets(settlement, input.cards);
    if (targets.length === 0) continue;
    const key = `${targets.join(",")}|${billedMonth(settlement.date, datesOf(targets))}`;
    const amount = signed(settlement.direction, settlement.amountIls);
    const entry = billed.get(key) ?? { sum: 0, debits: [] };
    entry.sum += amount;
    entry.debits.push({ id: settlement.id, date: settlement.date, amount: round(amount), description: settlement.label });
    billed.set(key, entry);
  }

  const result = new Map<string, ReconciliationMonth[]>();
  for (const card of input.cards) {
    const months = new Set<string>();
    for (const key of [...detailed.keys(), ...billed.keys()]) {
      const [ids, month] = key.split("|") as [string, string];
      if (ids.split(",").includes(card.id) && inWindow(month)) months.add(month);
    }
    const rows: ReconciliationMonth[] = [];
    for (const month of [...months].sort()) {
      const own = billed.get(`${card.id}|${month}`);
      const group = own === undefined
        ? [...billed.entries()].find(([key]) => key.endsWith(`|${month}`) && key.split("|")[0]!.split(",").includes(card.id))
        : undefined;
      const members = group ? group[0].split("|")[0]!.split(",") : [card.id];
      const detail = round(members.reduce((sum, id) => sum + (detailed.get(`${id}|${month}`) ?? 0), 0));
      // Charge date of this month: the latest row's, else projected from the card's charge day.
      const known = members.map((id) => lastCharge.get(`${id}|${month}`) ?? "").sort().at(-1);
      const reference = datesOf(members).at(-1);
      const charged = known || (reference ? `${month}-${reference.slice(8, 10)}` : `${month}-31`);
      const bill = own ?? group?.[1];
      if (bill !== undefined) {
        const covered = members.every((id) => {
          const start = coverage.get(id);
          return start !== undefined && month >= start;
        });
        const settled = settleMonth(bill, detail, charged, covered, input.today);
        rows.push({ month, detailed: detail, combined: group !== undefined, ...settled });
        continue;
      }
      const none = { billed: null, detailed: detail, diff: null, combined: false, debits: [], extras: [] };
      if (charged >= input.today) {
        rows.push({ month, ...none, status: "open" });
      } else if (input.bankCoverageStart !== null && charged >= input.bankCoverageStart) {
        rows.push({ month, ...none, status: "no_bill" });
      }
      // Older than the bank data: nothing to compare against, so the month is not reported.
    }
    result.set(card.id, rows);
  }
  return result;
}

export type CardReconciliation = {
  accountId: string;
  displayName: string;
  institutionCode: string;
  numberLast4: string | null;
  /** Settings → cards name when exactly one card row points at this account. */
  cardName: string | null;
  months: ReconciliationMonth[];
};

/** Household credit cards only (MEM-DATA); `from`/`to` are YYYY-MM, `today` YYYY-MM-DD. */
export function queryCardReconciliation(
  db: MoneyTrackDb,
  window: { from: string; to: string; today: string },
): CardReconciliation[] {
  // ponytail: loads all transactions once (a few thousand rows); bound by date if it grows.
  const allAccounts = db.select().from(accounts).all();
  const cardAccounts = allAccounts.filter((row) => row.kind === "credit_card" && row.scope === "household");
  const bankIds = new Set(allAccounts.filter((row) => row.kind === "bank").map((row) => row.id));
  const cardIds = new Set(cardAccounts.map((row) => row.id));
  const cardRows = db.select().from(cards).all();
  const txns = db.select().from(transactions).all();
  const accountOf = new Map(txns.map((row) => [row.id, row.accountId]));
  const links = db.select().from(transactionLinks).all().filter((row) => row.linkType === "card_settlement");

  const recon: ReconCardAccount[] = cardAccounts.map((account) => ({
    id: account.id,
    institutionCode: account.institutionCode,
    last4s: [
      ...new Set(
        [account.numberLast4, ...cardRows.filter((c) => c.settlementAccountId === account.id).map((c) => c.last4)]
          .filter((last4): last4 is string => Boolean(last4)),
      ),
    ],
  }));

  const bankRows = txns.filter((row) => bankIds.has(row.accountId));
  const bankCoverageStart = bankRows.reduce<string | null>(
    (min, row) => (min === null || row.transactionDate < min ? row.transactionDate : min),
    null,
  );
  const settlements: ReconSettlement[] = bankRows
    .filter((row) => row.kind === "card_settlement")
    .map((row) => ({
      id: row.id,
      date: row.transactionDate,
      direction: row.direction,
      amountIls: row.amountIls,
      description: `${row.descriptionRaw} ${row.descriptionNormalized}`,
      label: row.descriptionRaw,
      linkedAccountIds: links
        .filter((link) => link.fromId === row.id)
        .map((link) => accountOf.get(link.toId))
        .filter((id): id is string => id !== undefined && cardIds.has(id)),
    }));

  const months = reconcileCards({
    cards: recon,
    cardRows: txns.filter((row) => cardIds.has(row.accountId)),
    settlements,
    bankCoverageStart,
    ...window,
  });

  return cardAccounts.map((account) => {
    const named = cardRows.filter((c) => c.settlementAccountId === account.id);
    return {
      accountId: account.id,
      displayName: account.displayName,
      institutionCode: account.institutionCode,
      numberLast4: account.numberLast4,
      cardName: named.length === 1 ? named[0]!.displayName : null,
      months: months.get(account.id) ?? [],
    };
  });
}
