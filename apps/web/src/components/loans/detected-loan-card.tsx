"use client";

/**
 * Shown on the empty Loans page when monthly loan debits exist but no loan is entered.
 * The add button hands lender + display name to the existing new-loan form; the form has
 * no monthly-payment field, so the amount is only shown here as a hint.
 */
import { useEffect, useState } from "react";
import { formatIls } from "@/lib/currency";
import he from "@/locales/he.json";
import { fetchDetectedLoanPayments, type DetectedLoanPayment } from "./loans-api";

type Props = { onAdd: (payment: DetectedLoanPayment) => void };

export function DetectedLoanCard({ onAdd }: Props) {
  const [payment, setPayment] = useState<DetectedLoanPayment | null>(null);

  useEffect(() => {
    void fetchDetectedLoanPayments()
      .then((rows) => setPayment(rows[0] ?? null))
      .catch(() => setPayment(null));
  }, []);

  if (!payment) return null;
  const copy = he.networthUx.detected;

  return (
    <section className="rounded-xl border border-brand-orange-500/40 bg-surface-card p-4 shadow-soft">
      <h2 className="text-sm font-semibold">
        {copy.title
          .replace("{amount}", formatIls(payment.monthlyAmountIls))
          .replace("{merchant}", payment.merchant)}
      </h2>
      <p className="mt-1 text-sm text-text-muted">{copy.hint}</p>
      <button
        type="button"
        className="mt-3 min-h-11 rounded-lg bg-brand-orange-500 px-4 py-2 text-sm font-medium text-white"
        onClick={() => onAdd(payment)}
      >
        {copy.add}
      </button>
    </section>
  );
}
