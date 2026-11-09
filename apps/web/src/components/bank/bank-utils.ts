/**
 * Pure helpers for the bank page: which accounts are "banks", the default pick, the page filter
 * and the period summary math. No React, no fetches, so every rule is unit-tested (bank-utils.test.ts).
 * Gotcha: amountIls is a magnitude, `direction` carries the sign; the summary sums by direction.
 * Used by: bank-page-client and the bank-* components.
 */
import type { Account, AnalysisFilter, Transaction } from "@moneytrack/contracts";
import { periodToFilter, type GlobalPeriod } from "@/components/period/period-context";
import { accountLabel } from "@/lib/account-label";

/** Household bank accounts only; a business account stays out, like the credit page's cards. */
export function bankAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter((account) => account.kind === "bank" && account.scope === "household");
}

export function bankAccountLabel(account: Pick<Account, "institutionCode" | "numberLast4">): string {
  return accountLabel({ institutionCode: account.institutionCode, last4: account.numberLast4 });
}

/**
 * The account the page opens on: the remembered one if it still exists, else the first account.
 * ponytail: "first" stands in for "most active"; the account list carries no activity count.
 */
export function pickDefaultAccountId(
  accounts: readonly { id: string }[],
  storedId: string | null,
): string | null {
  if (storedId !== null && accounts.some((account) => account.id === storedId)) return storedId;
  return accounts[0]?.id ?? null;
}

export function bankFilter(period: GlobalPeriod, accountId: string): AnalysisFilter {
  // Always the transaction date: card-load rows carry a chargeDate a month later, which hides them from the statement month.
  return { ...periodToFilter(period, "transaction"), accountIds: [accountId] };
}

export type BankSummary = { moneyIn: number; moneyOut: number; net: number; count: number };

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Money in = credits, money out = debits, net = in - out. Every row counts, card bills and other
 * rows excluded from totals included: this is the account's real cash flow, not a spending report.
 */
export function summarizeRows(rows: readonly Pick<Transaction, "direction" | "amountIls">[]): BankSummary {
  let moneyIn = 0;
  let moneyOut = 0;
  for (const row of rows) {
    const amount = Math.abs(row.amountIls);
    if (row.direction === "credit") moneyIn += amount;
    else moneyOut += amount;
  }
  return { moneyIn: round2(moneyIn), moneyOut: round2(moneyOut), net: round2(moneyIn - moneyOut), count: rows.length };
}
