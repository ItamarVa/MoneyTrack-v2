import type { Account } from "@moneytrack/contracts";
import { describe, expect, it } from "vitest";
import { bankAccounts, bankFilter, pickDefaultAccountId, summarizeRows } from "./bank-utils";

const account = (id: string, kind: string, scope = "household") => ({ id, kind, scope }) as unknown as Account;

describe("bankAccounts", () => {
  it("keeps household bank accounts only", () => {
    const rows = [account("a", "bank"), account("b", "credit_card"), account("c", "bank", "business")];
    expect(bankAccounts(rows).map((row) => row.id)).toEqual(["a"]);
  });
});

describe("pickDefaultAccountId", () => {
  const rows = [{ id: "a" }, { id: "b" }];
  it("uses the remembered account when it still exists", () => {
    expect(pickDefaultAccountId(rows, "b")).toBe("b");
  });
  it("falls back to the first account for a stale or missing choice", () => {
    expect(pickDefaultAccountId(rows, "gone")).toBe("a");
    expect(pickDefaultAccountId(rows, null)).toBe("a");
  });
  it("is null with no accounts", () => {
    expect(pickDefaultAccountId([], "a")).toBeNull();
  });
});

describe("summarizeRows", () => {
  it("sums credits in, debits out, and the net", () => {
    const summary = summarizeRows([
      { direction: "credit", amountIls: 1000.1 },
      { direction: "debit", amountIls: 250.2 },
      { direction: "debit", amountIls: -100 },
    ]);
    expect(summary).toEqual({ moneyIn: 1000.1, moneyOut: 350.2, net: 649.9, count: 3 });
  });
  it("is zero for no rows", () => {
    expect(summarizeRows([])).toEqual({ moneyIn: 0, moneyOut: 0, net: 0, count: 0 });
  });
});

describe("bankFilter", () => {
  it("names the one account and the month bounds", () => {
    const filter = bankFilter("2026-03", "acc");
    expect(filter.accountIds).toEqual(["acc"]);
    expect(filter.dateFrom).toBe("2026-03-01");
    expect(filter.dateBasis).toBe("transaction");
  });
  it("has no bounds for the all period", () => {
    expect(bankFilter("all", "acc").dateFrom).toBeUndefined();
  });
});
