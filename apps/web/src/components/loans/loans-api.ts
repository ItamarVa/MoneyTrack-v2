/**
 * Loan mutations not yet in the shared api-client seam.
 * Owned by Wave 1 Track J.
 */
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

export async function deleteLoan(loanId: string): Promise<void> {
  await parseJson<{ ok: true }>(
    await fetch(apiUrl(`/api/loans/${loanId}`), {
      method: "DELETE",
      headers: mutatingHeaders(),
    }),
  );
}

export type DetectedLoanPayment = {
  merchant: string;
  monthlyAmountIls: number;
  months: number;
  lastDate: string;
};

export async function fetchDetectedLoanPayments(): Promise<DetectedLoanPayment[]> {
  const data = await parseJson<{ payments: DetectedLoanPayment[] }>(
    await fetch(apiUrl("/api/loans/detected-payments"), { cache: "no-store" }),
  );
  return data.payments;
}
