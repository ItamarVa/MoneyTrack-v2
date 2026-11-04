/**
 * Pure helpers for the credit-card page: which accounts are "cards", which ids a
 * selection filters on, the page filter, the combined next-charge hero, top merchants.
 * Kept free of React and fetches so every rule here is unit-tested (credit-utils.test.ts).
 * Used by: credit-page-client and the credit-* section components.
 */
import type { Account, AnalysisFilter, CategoryBreakdownItem, DateBasis } from "@moneytrack/contracts";
import { periodToFilter, type GlobalPeriod } from "@/components/period/period-context";
import { accountLabel } from "@/lib/account-label";
import type { CardCharge, CreditCardCharges } from "./credit-types";

/** Cards are household credit_card accounts; a business card stays out (MEM-DATA). */
export function creditCardAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter((account) => account.kind === "credit_card" && account.scope === "household");
}

/** Issuer plus last four, whatever the stored display name says. */
export function cardLabel(card: { institutionCode: string; numberLast4: string | null }): string {
  return accountLabel({ institutionCode: card.institutionCode, last4: card.numberLast4 });
}

/** The account ids the whole page filters on. A stale or unknown selection falls back to all cards. */
export function selectedCardIds(cards: readonly { id: string }[], selectedId: string | null): string[] {
  if (selectedId !== null && cards.some((card) => card.id === selectedId)) {
    return [selectedId];
  }
  return cards.map((card) => card.id);
}

/** Next-charge rows for the cards in play. */
export function chargesForCards(
  charges: readonly CreditCardCharges[],
  cardIds: readonly string[],
): CreditCardCharges[] {
  const wanted = new Set(cardIds);
  return charges.filter((row) => wanted.has(row.accountId));
}

export type ChargeHero = {
  kind: "upcoming" | "last";
  amountIls: number;
  transactionCount: number;
  /** The one date every counted card shares; null when they bill on different days. */
  date: string | null;
};

/** One headline figure: all upcoming charges if any card has one, else the last known charges. */
export function chargeHero(rows: readonly CreditCardCharges[]): ChargeHero | null {
  const upcoming = rows.filter((row) => row.charge.kind === "upcoming");
  const counted = upcoming.length > 0 ? upcoming : rows.filter((row) => row.charge.kind === "last");
  if (counted.length === 0) {
    return null;
  }
  const dates = new Set(counted.map((row) => row.charge.date));
  const total = counted.reduce((sum, row) => sum + row.charge.amountIls, 0);
  return {
    kind: upcoming.length > 0 ? "upcoming" : "last",
    amountIls: Math.round(total * 100) / 100,
    transactionCount: counted.reduce((sum, row) => sum + row.charge.transactionCount, 0),
    date: dates.size === 1 ? ([...dates][0] ?? null) : null,
  };
}

/** Whole calendar days from `today` to `date` (both YYYY-MM-DD); negative when past. */
export function daysBetween(today: string, date: string): number {
  const toUtc = (iso: string): number => {
    const [year, month, day] = iso.split("-").map(Number);
    return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  };
  return Math.round((toUtc(date) - toUtc(today)) / 86_400_000);
}

export type ChargeTiming =
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "inDays"; days: number }
  | { kind: "past" };

export function chargeTiming(today: string, charge: Pick<CardCharge, "kind" | "date">): ChargeTiming {
  if (charge.kind !== "upcoming" || charge.date === null) {
    return { kind: "past" };
  }
  const days = daysBetween(today, charge.date);
  if (days <= 0) return { kind: "today" };
  if (days === 1) return { kind: "tomorrow" };
  return { kind: "inDays", days };
}

/** Everything the page asks the API for: the period, the chosen basis, only the chosen cards. */
export function creditFilter(
  period: GlobalPeriod,
  basis: DateBasis,
  cardIds: readonly string[],
): AnalysisFilter {
  return { ...periodToFilter(period, basis), accountIds: [...cardIds] };
}

/** Largest spenders first, refunds and zero rows dropped. */
export function topMerchants(
  items: readonly CategoryBreakdownItem[],
  limit = 5,
): CategoryBreakdownItem[] {
  return items
    .filter((item) => item.amountIls > 0)
    .sort((left, right) => right.amountIls - left.amountIls)
    .slice(0, limit);
}

/** Share of the month's card spend, as a whole percent for a bar width. */
export function sharePercent(amountIls: number, totalIls: number): number {
  return totalIls > 0 ? Math.min(100, Math.round((amountIls / totalIls) * 100)) : 0;
}
