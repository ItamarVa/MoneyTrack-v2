import type { TransactionKind } from "@moneytrack/contracts";
import type { RawTransactionPayload } from "./types.js";

type ScraperTxn = {
  type?: string;
  identifier?: string | number;
  date: string;
  processedDate?: string;
  originalAmount: number;
  originalCurrency?: string;
  chargedAmount: number;
  chargedCurrency?: string;
  description: string;
  memo?: string | null;
  category?: string;
  installments?: { number: number; total: number };
  status?: string;
};

function toIsoDate(value: string): string {
  return value.slice(0, 10);
}

/** Pending rows often report chargedAmount 0; the real signed value sits in originalAmount. */
function effectiveAmount(txn: ScraperTxn): number {
  return txn.chargedAmount !== 0 && txn.chargedAmount != null
    ? txn.chargedAmount
    : txn.originalAmount;
}

function inferDirection(amount: number): "debit" | "credit" {
  return amount < 0 ? "debit" : "credit";
}

function inferKind(txn: ScraperTxn, amount: number): TransactionKind {
  if (txn.type === "installments") {
    return "expense";
  }
  return amount < 0 ? "expense" : "income";
}

function mapStatus(status: string | undefined): "pending" | "posted" {
  return status === "pending" ? "pending" : "posted";
}

function resolveAmountIls(txn: ScraperTxn, originalCurrency: string): number {
  const currency = originalCurrency.toUpperCase();
  if (currency === "ILS") {
    return Math.abs(effectiveAmount(txn));
  }
  if (txn.chargedAmount !== 0 && txn.chargedAmount != null) {
    return Math.abs(txn.chargedAmount);
  }
  return 0;
}

/** Map an israeli-bank-scrapers Transaction row to our internal payload shape. */
export function mapScraperTransaction(
  providerAccountNumber: string,
  txn: ScraperTxn,
): RawTransactionPayload {
  const transactionDate = toIsoDate(txn.date);
  const chargeDate = toIsoDate(txn.processedDate ?? txn.date);
  const originalCurrency = txn.originalCurrency ?? txn.chargedCurrency ?? "ILS";
  const signed = effectiveAmount(txn);
  const originalAmount = Math.abs(txn.originalAmount);
  const amountIls = resolveAmountIls(txn, originalCurrency);

  return {
    providerAccountNumber,
    scraperIdentifier: txn.identifier ?? null,
    transactionDate,
    chargeDate,
    status: mapStatus(txn.status),
    direction: inferDirection(signed),
    originalAmount,
    originalCurrency,
    amountIls,
    descriptionRaw: txn.description,
    installmentIndex: txn.installments?.number ?? null,
    installmentTotal: txn.installments?.total ?? null,
    kind: inferKind(txn, signed),
    providerCategory: txn.category,
    payload: txn as Record<string, unknown>,
  };
}
