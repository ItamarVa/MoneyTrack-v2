/**
 * Budget mutations not yet in the shared api-client seam.
 * Owned by Wave 1 Track J; delete awaits API route in integration.
 */
import type { BudgetPatchRequest, BudgetWithVariance } from "@moneytrack/contracts";
import { apiUrl } from "@/lib/base-path";

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data;
}

function mutatingHeaders(): HeadersInit {
  return { "content-type": "application/json" };
}

export async function updateBudget(
  id: string,
  body: BudgetPatchRequest,
): Promise<BudgetWithVariance> {
  return parseJson<BudgetWithVariance>(
    await fetch(apiUrl(`/api/budgets/${id}`), {
      method: "PATCH",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteBudget(id: string): Promise<void> {
  await parseJson<{ ok: true }>(
    await fetch(apiUrl(`/api/budgets/${id}`), {
      method: "DELETE",
      headers: mutatingHeaders(),
    }),
  );
}
