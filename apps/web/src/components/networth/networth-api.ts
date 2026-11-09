import type { NetWorthSnapshot } from "@moneytrack/contracts";
import { apiUrl } from "@/lib/base-path";

export type NetWorthResponse = {
  snapshots: NetWorthSnapshot[];
  partial: boolean;
  partialReasons: Array<"no_loans" | "no_savings">;
  cardDebtIls: number;
};

/** Same endpoint as the shared client, but keeps the completeness fields it drops. */
export async function fetchNetWorth(): Promise<NetWorthResponse> {
  const response = await fetch(apiUrl("/api/networth"), { cache: "no-store" });
  const data = (await response.json()) as NetWorthResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data;
}
