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

export function sha256Payload(payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
}
