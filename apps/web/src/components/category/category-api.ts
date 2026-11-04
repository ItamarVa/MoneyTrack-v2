/**
 * Browser call for "back to automatic" (DELETE on the transaction category route).
 * Lives beside the chooser because lib/api-client.ts belongs to other work; the PATCH twin is
 * setTransactionCategory there. Returns the updated row like PATCH does.
 */
import type { Transaction } from "@moneytrack/contracts";
import { apiUrl } from "@/lib/base-path";

export async function clearTransactionCategory(transactionId: string): Promise<Transaction> {
  const response = await fetch(apiUrl(`/api/transactions/${transactionId}/category`), {
    method: "DELETE",
    headers: { "content-type": "application/json" },
  });
  const data = (await response.json()) as { transaction: Transaction; error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data.transaction;
}
