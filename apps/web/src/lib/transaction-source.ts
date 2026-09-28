/**
 * Client-safe helpers for transaction source labels and picker state.
 * Imports contracts types only — never @moneytrack/engine (see memory/lessons.md).
 */
import type { Account, AnalysisFilter, Card, Transaction } from "@moneytrack/contracts";

export type SourceOption = {
  id: string;
  kind: "account" | "card";
  label: string;
  /** Settlement account for a card; null for an account row. */
  parentAccountId: string | null;
};

export type SourceIndex = { accounts: Map<string, Account>; cards: Map<string, Card> };

function accountLabel(account: Account): string {
  const suffix = account.numberLast4 ? ` ••${account.numberLast4}` : "";
  return `${account.displayName}${suffix}`;
}

function cardLabel(card: Card): string {
  return `${card.displayName} ••${card.last4}`;
}

export function buildSourceIndex(accounts: Account[], cards: Card[]): SourceIndex {
  return {
    accounts: new Map(accounts.map((row) => [row.id, row])),
    cards: new Map(cards.map((row) => [row.id, row])),
  };
}

/** Card first — that is the real source; then the account; then an em dash. */
export function sourceLabelFor(
  txn: Pick<Transaction, "accountId" | "cardId">,
  index: SourceIndex,
): string {
  if (txn.cardId) {
    const card = index.cards.get(txn.cardId);
    if (card) {
      return cardLabel(card);
    }
  }
  const account = index.accounts.get(txn.accountId);
  if (account) {
    return accountLabel(account);
  }
  return "—";
}

/** Accounts in display order, each immediately followed by its cards. */
export function sourceOptions(accounts: Account[], cards: Card[]): SourceOption[] {
  const cardsBySettlement = new Map<string, Card[]>();
  for (const card of cards) {
    const bucket = cardsBySettlement.get(card.settlementAccountId) ?? [];
    bucket.push(card);
    cardsBySettlement.set(card.settlementAccountId, bucket);
  }

  const options: SourceOption[] = [];
  for (const account of accounts) {
    options.push({
      id: account.id,
      kind: "account",
      label: accountLabel(account),
      parentAccountId: null,
    });
    for (const card of cardsBySettlement.get(account.id) ?? []) {
      options.push({
        id: card.id,
        kind: "card",
        label: cardLabel(card),
        parentAccountId: account.id,
      });
    }
  }
  return options;
}

/** Split a picker selection back into the two filter fields. */
export function splitSourceIds(
  selected: string[],
  options: SourceOption[],
): { accountIds: string[] | undefined; cardIds: string[] | undefined } {
  const byId = new Map(options.map((row) => [row.id, row]));
  const accountIds: string[] = [];
  const cardIds: string[] = [];
  for (const id of selected) {
    const option = byId.get(id);
    if (!option) {
      continue;
    }
    if (option.kind === "account") {
      accountIds.push(id);
    } else {
      cardIds.push(id);
    }
  }
  return {
    accountIds: accountIds.length > 0 ? accountIds : undefined,
    cardIds: cardIds.length > 0 ? cardIds : undefined,
  };
}

/** Current selection from a filter, for rehydrating the picker. */
export function selectedSourceIds(
  filter: Pick<AnalysisFilter, "accountIds" | "cardIds">,
): string[] {
  return [...(filter.accountIds ?? []), ...(filter.cardIds ?? [])];
}
