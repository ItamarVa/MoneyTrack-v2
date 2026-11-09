import { describe, expect, it } from "vitest";
import { monthLines, reconciliationWindow, recentProblems, shiftMonth } from "./credit-reconciliation-utils";
import type { CardReconciliationRow, ReconciliationMonth } from "./credit-types";

// Synthetic data only.
function m(month: string, status: ReconciliationMonth["status"], diff: number | null = null): ReconciliationMonth {
  return { month, status, diff, billed: diff === null ? null : 100, detailed: 100 - (diff ?? 0), combined: false, debits: [] };
}

const rows: CardReconciliationRow[] = [
  { accountId: "a", label: "Card A", institutionCode: "isracard", months: [m("2026-09", "mismatch", 40), m("2026-10", "match", 0), m("2025-10", "mismatch", 5)] },
  { accountId: "b", label: "Card B", institutionCode: "max", months: [m("2026-10", "no_bill"), m("2026-11", "open"), m("2026-08", "no_details", 7)] },
];

describe("credit reconciliation helpers", () => {
  it("shifts months across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("asks for the last 12 months, stretched to the selected month", () => {
    expect(reconciliationWindow("all", "2026-11-09")).toEqual({ from: "2025-12", to: "2026-11" });
    expect(reconciliationWindow("2024-05", "2026-11-09")).toEqual({ from: "2024-05", to: "2026-11" });
  });

  it("lists the selected cards' lines for the month", () => {
    expect(monthLines(rows, ["a", "b"], "2026-10").map((l) => [l.accountId, l.entry.status])).toEqual([
      ["a", "match"],
      ["b", "no_bill"],
    ]);
    expect(monthLines(rows, ["b"], "2026-09")).toEqual([]);
  });

  it("keeps recent mismatched and unbilled months, newest first, without the selected one", () => {
    const problems = recentProblems(rows, ["a", "b"], "2026-11", "2026-11-09");
    expect(problems.map((p) => [p.accountId, p.entry.month])).toEqual([
      ["b", "2026-10"],
      ["a", "2026-09"],
    ]);
  });
});
