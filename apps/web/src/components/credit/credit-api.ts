/**
 * Browser calls for the credit page. Lives here, not in lib/api-client.ts, because that file
 * is shared; the other fetches the page needs (accounts, breakdown, transactions, categories)
 * are the existing api-client helpers. apiUrl() keeps the Home Assistant ingress prefix.
 */
import { apiUrl } from "@/lib/base-path";
import type { CreditReconciliationResponse, CreditSummaryResponse } from "./credit-types";

/** The phone's own calendar day, so "next charge" matches what the person sees. */
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export async function fetchCreditSummary(today: string): Promise<CreditSummaryResponse> {
  const response = await fetch(apiUrl(`/api/credit/summary?today=${encodeURIComponent(today)}`), {
    cache: "no-store",
  });
  const data = (await response.json()) as CreditSummaryResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data;
}

/** Bank debit vs. card rows per charge month; `from`/`to` are YYYY-MM. */
export async function fetchCreditReconciliation(
  from: string,
  to: string,
  today: string,
): Promise<CreditReconciliationResponse> {
  const query = new URLSearchParams({ from, to, today });
  const response = await fetch(apiUrl(`/api/credit/reconciliation?${query.toString()}`), { cache: "no-store" });
  const data = (await response.json()) as CreditReconciliationResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data;
}
