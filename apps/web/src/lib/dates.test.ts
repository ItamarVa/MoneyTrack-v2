import { describe, expect, it } from "vitest";
import { formatMonthYear } from "./dates";

describe("formatMonthYear", () => {
  it("formats a YYYY-MM period and a full ISO date", () => {
    expect(formatMonthYear("2026-08")).toContain("2026");
    expect(formatMonthYear("2026-08-31")).toBe(formatMonthYear("2026-08"));
  });

  it("returns the all-period label instead of throwing for an unbounded filter", () => {
    expect(formatMonthYear("")).toBe("כל התקופה");
    expect(formatMonthYear("all")).toBe("כל התקופה");
  });
});
