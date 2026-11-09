import { describe, expect, it } from "vitest";
import type { CardReconciliationRow } from "@/components/credit/credit-types";
import { cardBillProblems } from "./card-bills-logic";

const entry = (month: string, status: CardReconciliationRow["months"][number]["status"]) => ({
  month,
  billed: 100,
  detailed: 90,
  diff: 10,
  status,
  combined: false,
  debits: [],
});

describe("cardBillProblems", () => {
  const rows: CardReconciliationRow[] = [
    {
      accountId: "a",
      label: "A",
      institutionCode: "isracard",
      months: [entry("2026-10", "mismatch"), entry("2026-09", "match"), entry("2026-08", "no_bill"), entry("2026-11", "open"), entry("2025-01", "mismatch"), entry("2026-07", "no_details")],
    },
  ];

  it("keeps mismatch and no_bill inside the last 12 months, newest first", () => {
    expect(cardBillProblems(rows, "2026-11-09").map((p) => p.entry.month)).toEqual(["2026-10", "2026-08"]);
  });

  it("never counts extra issuer debits of a matching month as a problem", () => {
    const extras = [{ id: "synth-extra-1", date: "2026-10-09", amount: 500, description: "SYNTH OLD CARD" }];
    expect(cardBillProblems([{ ...rows[0]!, months: [{ ...entry("2026-10", "match"), extras }] }], "2026-11-09")).toEqual([]);
  });

  it("is empty when everything matches", () => {
    expect(cardBillProblems([{ ...rows[0]!, months: [entry("2026-10", "match")] }], "2026-11-09")).toEqual([]);
  });
});
