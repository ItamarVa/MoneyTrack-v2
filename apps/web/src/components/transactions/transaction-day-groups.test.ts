import { describe, expect, it } from "vitest";
import { formatDayLabel, groupRowsByDay } from "./transaction-day-groups";

function row(transactionDate: string, amountIls: number, over: Record<string, unknown> = {}) {
  return {
    transactionDate,
    amountIls,
    excludedFromTotals: false,
    kind: "expense" as const,
    direction: "debit" as const,
    originalAmount: amountIls,
    originalCurrency: "ILS",
    ...over,
  };
}

describe("groupRowsByDay", () => {
  it("groups consecutive rows of the same date and keeps order", () => {
    const groups = groupRowsByDay([
      row("2026-09-10", 50),
      row("2026-09-10", 25.5),
      row("2026-09-09", 10),
    ]);
    expect(groups.map((g) => [g.date, g.rows.length])).toEqual([
      ["2026-09-10", 2],
      ["2026-09-09", 1],
    ]);
    expect(groups[0]!.expenseIls).toBeCloseTo(75.5);
    expect(groups[0]!.incomeIls).toBe(0);
  });

  it("does not merge a date that reappears after another day", () => {
    const groups = groupRowsByDay([row("2026-09-10", 1), row("2026-09-09", 1), row("2026-09-10", 1)]);
    expect(groups.map((g) => g.date)).toEqual(["2026-09-10", "2026-09-09", "2026-09-10"]);
  });

  it("separates income, ignores excluded rows and transfers", () => {
    const groups = groupRowsByDay([
      row("2026-09-10", 40),
      row("2026-09-10", 900, { kind: "income", direction: "credit" }),
      row("2026-09-10", 500, { excludedFromTotals: true }),
      row("2026-09-10", 300, { kind: "transfer" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.expenseIls).toBe(40);
    expect(groups[0]!.incomeIls).toBe(900);
  });

  it("returns no groups for no rows", () => {
    expect(groupRowsByDay([])).toEqual([]);
  });
});

describe("formatDayLabel", () => {
  const now = new Date(2026, 10, 4);

  it("prints weekday, day and month without a year in the current year", () => {
    expect(formatDayLabel("2026-09-10", now)).toBe("יום ה׳, 10 בספטמבר");
  });

  it("adds the year for another year", () => {
    expect(formatDayLabel("2025-09-10", now)).toContain("2025");
  });
});
