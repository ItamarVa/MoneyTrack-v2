/**
 * Transaction identity hashes (MEM-DATA "Transaction identity"). The base formula below is frozen:
 * thousands of stored rows carry it, and a changed formula would make the next sync duplicate them.
 * Legitimate repeats inside one ingest batch (two identical purchases, a charge and its same-day
 * refund: originalAmount is absolute, direction is separate) share a base hash, so
 * discriminateOccurrences gives the 2nd+ row of a base hash sha256(base + "#" + n). Used by
 * sync-runner.ts ingestRows (sync and statement import).
 */
import { createHash } from "node:crypto";

export type IdentityHashInput = {
  providerCode: string;
  accountNumber: string;
  transactionDate: string;
  originalAmount: number;
  originalCurrency: string;
  normalizedDescription: string;
  installmentIndex: number | null;
};

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function formatInstallment(index: number | null): string {
  return index === null ? "" : String(index);
}

/** sha256(provider|account|date|amount|currency|normalized_desc|installment_index) */
export function buildIdentityHash(input: IdentityHashInput): string {
  const parts = [
    input.providerCode,
    input.accountNumber,
    input.transactionDate,
    formatAmount(input.originalAmount),
    input.originalCurrency,
    input.normalizedDescription,
    formatInstallment(input.installmentIndex),
  ];
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

export type OccurrenceInput = {
  baseHash: string;
  direction: "debit" | "credit";
  chargeDate: string;
};

/**
 * Final identity hash per row of one batch, in input order. Rows sharing a base hash are ordered
 * debit before credit, then by charge date, then by input order; the 1st keeps the base hash (so
 * pre-existing rows still match), the n-th (n >= 2) gets sha256(base + "#" + n). Deterministic for
 * a stable provider order, and a refund never takes its same-day charge's slot.
 */
export function discriminateOccurrences(items: readonly OccurrenceInput[]): string[] {
  const order = items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        a.item.baseHash.localeCompare(b.item.baseHash) ||
        (a.item.direction === b.item.direction ? 0 : a.item.direction === "debit" ? -1 : 1) ||
        a.item.chargeDate.localeCompare(b.item.chargeDate) ||
        a.index - b.index,
    );
  const result = new Array<string>(items.length);
  const seen = new Map<string, number>();
  for (const { item, index } of order) {
    const n = (seen.get(item.baseHash) ?? 0) + 1;
    seen.set(item.baseHash, n);
    result[index] =
      n === 1
        ? item.baseHash
        : createHash("sha256").update(`${item.baseHash}#${n}`, "utf8").digest("hex");
  }
  return result;
}

export function sha256Payload(payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
}
