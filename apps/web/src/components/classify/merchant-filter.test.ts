import type { UncategorizedMerchant } from "@moneytrack/contracts";
import { describe, expect, it } from "vitest";
import { filterAndSortMerchants } from "./merchant-filter";

function m(id: string, name: string, count: number, amount: number): UncategorizedMerchant {
  return {
    merchantId: id,
    merchantName: name,
    transactionCount: count,
    totalAmountIls: amount,
    providerCategories: [],
  } as UncategorizedMerchant;
}

const rows = [m("1", "שופרסל", 5, 100), m("2", "Amazon", 2, 900), m("3", "אלקטרה", 9, -300)];

describe("filterAndSortMerchants", () => {
  it("filters case-insensitively and trims", () => {
    expect(filterAndSortMerchants(rows, "  AMAZ ", "name").map((r) => r.merchantId)).toEqual(["2"]);
  });
  it("matches Hebrew", () => {
    expect(filterAndSortMerchants(rows, "שופ", "name").map((r) => r.merchantId)).toEqual(["1"]);
  });
  it("sorts by absolute amount desc", () => {
    expect(filterAndSortMerchants(rows, "", "amount").map((r) => r.merchantId)).toEqual(["2", "3", "1"]);
  });
  it("sorts by count desc", () => {
    expect(filterAndSortMerchants(rows, "", "count").map((r) => r.merchantId)).toEqual(["3", "1", "2"]);
  });
  it("does not mutate input", () => {
    const copy = [...rows];
    filterAndSortMerchants(rows, "", "count");
    expect(rows).toEqual(copy);
  });
});
