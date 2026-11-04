import { describe, expect, it } from "vitest";
import { detectRecurringLoanPayments } from "./loan-detection.js";

// Synthetic data only.
const TODAY = "2026-11-04";

describe("detectRecurringLoanPayments", () => {
  it("returns the median monthly amount and ignores a one-off merchant", () => {
    const rows = [
      { merchant: "Lender A", amountIls: -4000, date: "2026-06-10" },
      { merchant: "Lender A", amountIls: -4200, date: "2026-07-10" },
      { merchant: "Lender A", amountIls: 4100, date: "2026-08-10" },
      { merchant: "Lender A", amountIls: -9000, date: "2026-09-10" },
      { merchant: "Lender A", amountIls: -4100, date: "2026-10-10" },
      { merchant: "One Off Bank", amountIls: -25000, date: "2026-09-02" },
    ];
    const detected = detectRecurringLoanPayments(rows, TODAY);
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      merchant: "Lender A",
      monthlyAmountIls: 4100,
      months: 5,
      lastDate: "2026-10-10",
    });
  });

  it("sums several payments in the same month and skips rows older than 6 months", () => {
    const rows = [
      { merchant: "Lender B", amountIls: -1000, date: "2026-09-05" },
      { merchant: "Lender B", amountIls: -500, date: "2026-09-20" },
      { merchant: "Lender B", amountIls: -1500, date: "2026-10-05" },
      { merchant: "Lender B", amountIls: -99999, date: "2026-01-05" },
    ];
    const detected = detectRecurringLoanPayments(rows, TODAY);
    expect(detected).toEqual([
      { merchant: "Lender B", monthlyAmountIls: 1500, months: 2, lastDate: "2026-10-05" },
    ]);
  });

  it("returns nothing when no merchant repeats", () => {
    expect(
      detectRecurringLoanPayments([{ merchant: "X", amountIls: -100, date: "2026-10-01" }], TODAY),
    ).toEqual([]);
  });
});
