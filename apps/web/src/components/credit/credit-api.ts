/**
 * Browser calls for the credit page. Lives here, not in lib/api-client.ts, because that file
 * is shared; the other fetches the page needs (accounts, breakdown, transactions, categories)
 * are the existing api-client helpers. apiUrl() keeps the Home Assistant ingress prefix.
 */
import { apiUrl } from "@/lib/base-path";
import type { CreditSummaryResponse } from "./credit-types";

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
