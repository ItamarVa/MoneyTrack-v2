import { describe, expect, it } from "vitest";
import { formatMoneyInput, resolveMoneyInput } from "./transaction-money-input";

describe("formatMoneyInput", () => {
  it("shows two decimals instead of raw floats", () => {
    expect(formatMoneyInput(76.60282000000001)).toBe("76.60");
    expect(formatMoneyInput(12)).toBe("12.00");
    expect(formatMoneyInput(0.5)).toBe("0.50");
  });
});

describe("resolveMoneyInput", () => {
  it("keeps the stored precision when the text was not edited", () => {
    const original = 76.60282000000001;
    expect(resolveMoneyInput(formatMoneyInput(original), original)).toBe(original);
  });

  it("uses the typed value once edited", () => {
    expect(resolveMoneyInput("80.25", 76.60282000000001)).toBe(80.25);
  });

  it("parses plain text when there is no original", () => {
    expect(resolveMoneyInput("19.9")).toBe(19.9);
  });
});
