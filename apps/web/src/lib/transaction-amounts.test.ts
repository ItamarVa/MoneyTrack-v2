import { describe, expect, it } from "vitest";

import { formatIlsExact } from "@/lib/currency";

import {
  expenseContribution,
  formatTransactionAmountDisplay,
  incomeContribution,
} from "./transaction-amounts";

describe("transaction-amounts", () => {
  it("shows expenses as signed red negatives with two decimals", () => {
    const display = formatTransactionAmountDisplay({
      excludedFromTotals: false,
      kind: "expense",
      direction: "debit",
      amountIls: 120,
      originalAmount: 120,
      originalCurrency: "ILS",
    });
    expect(display.tone).toBe("expense");
    expect(display.text).toBe("\u2212120.00 ₪");
    expect(display.secondary).toBeUndefined();
  });

  it("shows income as signed green positives with two decimals", () => {
    const display = formatTransactionAmountDisplay({
      excludedFromTotals: false,
      kind: "income",
      direction: "credit",
      amountIls: 5000,
      originalAmount: 5000,
      originalCurrency: "ILS",
    });
    expect(display.tone).toBe("income");
    expect(display.text).toBe("5,000.00 ₪");
    expect(display.text).not.toContain("\u2212");
  });

  it("shows not-yet-charged with foreign secondary at two decimals", () => {
    const display = formatTransactionAmountDisplay({
      excludedFromTotals: false,
      kind: "expense",
      direction: "debit",
      amountIls: 0,
      originalAmount: 42.5,
      originalCurrency: "USD",
    });
    expect(display.text).toBe("טרם חויב");
    expect(display.tone).toBe("neutral");
    expect(display.secondary).toBe("42.50 USD");
  });

  it("shows foreign original amount as secondary when ILS is set", () => {
    const display = formatTransactionAmountDisplay({
      excludedFromTotals: false,
      kind: "expense",
      direction: "debit",
      amountIls: 150,
      originalAmount: 40,
      originalCurrency: "EUR",
    });
    expect(display.secondary).toBe("40.00 EUR");
  });

  it("shows the real amount, neutral, for rows that count toward no total", () => {
    const base = { originalCurrency: "ILS" };
    const settlement = formatTransactionAmountDisplay({
      ...base,
      excludedFromTotals: false,
      kind: "card_settlement",
      direction: "debit",
      amountIls: 140.45,
      originalAmount: 140.45,
    });
    expect(settlement.text).toBe(formatIlsExact(-140.45));
    expect(settlement.tone).toBe("neutral");

    const transfer = formatTransactionAmountDisplay({
      ...base,
      excludedFromTotals: false,
      kind: "transfer",
      direction: "credit",
      amountIls: 50,
      originalAmount: 50,
    });
    expect(transfer.text).toBe(formatIlsExact(50));
    expect(transfer.tone).toBe("neutral");

    const excluded = formatTransactionAmountDisplay({
      ...base,
      excludedFromTotals: true,
      kind: "expense",
      direction: "debit",
      amountIls: 20,
      originalAmount: 20,
    });
    expect(excluded.text).toBe(formatIlsExact(-20));
    expect(excluded.tone).toBe("neutral");
  });

  it("matches engine contribution rules", () => {
    const txn = {
      excludedFromTotals: false,
      kind: "refund",
      direction: "credit",
      amountIls: 75,
      originalAmount: 75,
      originalCurrency: "ILS",
    };
    expect(expenseContribution(txn)).toBe(-75);
    expect(incomeContribution(txn)).toBe(0);
  });
});
