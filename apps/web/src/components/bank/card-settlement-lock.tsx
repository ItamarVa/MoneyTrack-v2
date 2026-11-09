"use client";

/**
 * Read-only stand-in for the category picker on card settlement rows (the monthly card debit in
 * the bank). The category of a card bill lives in the card's own rows on /credit, so the server
 * refuses changes (card_settlement_locked) and the UI never offers them.
 * Used by: compact-transaction-row (compact) and transaction-detail-drawer (full).
 */
import type { Transaction } from "@moneytrack/contracts";
import Link from "next/link";
import he from "@/locales/he.json";

const copy = he.cardSettlementLock;

export function isCardSettlement(row: Pick<Transaction, "kind">): boolean {
  return row.kind === "card_settlement";
}

export function CardSettlementLock({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Link
        href="/credit"
        title={copy.explanation}
        className="inline-flex min-h-6 max-w-full items-center truncate text-xs text-brand-blue-500 hover:underline"
      >
        {copy.label}
      </Link>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-text-primary">{copy.label}</p>
      <p className="text-xs text-text-muted">{copy.explanation}</p>
      <Link
        href="/credit"
        className="inline-flex min-h-11 items-center text-sm text-brand-blue-500 hover:underline"
      >
        {copy.link}
      </Link>
    </div>
  );
}
