import type { AnalysisFilter, TransactionKind } from "@moneytrack/contracts";
import { describe, expect, it } from "vitest";
import type { TransactionSortBy, TransactionSortDir } from "@/lib/analysis-filter";
import { sourceOptions } from "@/lib/transaction-source";
import { draftFromList, draftToUpdates, parseAmountBound } from "./transaction-filter-sheet-draft";
import {
  clearAllUpdates,
  listQueryString,
  mergeListUpdates,
  type ListFilterUpdates,
  type ListState,
} from "./transaction-list-query";

const base: AnalysisFilter = { dateBasis: "transaction", dateFrom: "2026-09-01", dateTo: "2026-09-30" };

const sources = sourceOptions(
  [{ id: "acc-1", displayName: "Bank", numberLast4: "1234" }] as never,
  [{ id: "card-1", displayName: "Card", last4: "9876", settlementAccountId: "acc-1" }] as never,
);

function query(state: ListState, sortBy: TransactionSortBy = "date", sortDir: TransactionSortDir = "desc") {
  return listQueryString({ ...state, sortBy, sortDir, allPeriod: false });
}

/** What the desktop column menus emit, applied one after another as the page does. */
function applyAll(updates: ListFilterUpdates[]) {
  return updates.reduce<ListState>((state, update) => mergeListUpdates(state, update), { filter: base });
}

describe("filter sheet maps to the same URL params as the desktop menus", () => {
  it("combined sheet apply equals the sequential desktop updates", () => {
    const draft = {
      ...draftFromList({ filter: base, sortBy: "date", sortDir: "desc" }),
      freeText: " coffee ",
      categoryIds: ["cat-1", "cat-2"],
      sourceIds: ["acc-1", "card-1"],
      kinds: ["expense", "refund"] as TransactionKind[],
      amountMin: "10",
      amountMax: "250.5",
      sortBy: "amount" as const,
      sortDir: "asc" as const,
    };
    const { updates, sortBy, sortDir } = draftToUpdates(draft, sources);
    const fromSheet = query(mergeListUpdates({ filter: base }, updates), sortBy, sortDir);

    const desktop = applyAll([
      { freeText: "coffee" },
      { filter: { categoryIds: ["cat-1", "cat-2"] } },
      { filter: { accountIds: ["acc-1"], cardIds: ["card-1"] } },
      { kinds: ["expense", "refund"] },
      { filter: { amountMin: 10, amountMax: 250.5 } },
    ]);
    expect(fromSheet).toBe(query(desktop, "amount", "asc"));
    expect(fromSheet).toContain("categoryIds=cat-1%2Ccat-2");
    expect(fromSheet).toContain("kinds=expense%2Crefund");
    expect(fromSheet).toContain("sortBy=amount");
    expect(fromSheet).toContain("sortDir=asc");
  });

  it("round-trips the current state unchanged", () => {
    const current = applyAll([
      { filter: { categoryIds: ["cat-1"], amountMin: 5 }, kinds: ["income"] },
      { freeText: "salary" },
    ]);
    const { updates } = draftToUpdates(
      draftFromList({ ...current, sortBy: "date", sortDir: "desc" }),
      sources,
    );
    expect(query(mergeListUpdates(current, updates))).toBe(query(current));
  });

  it("empty draft fields clear their filters", () => {
    const current = applyAll([
      { filter: { categoryIds: ["cat-1"], accountIds: ["acc-1"], amountMin: 5, amountMax: 9 }, kinds: ["income"] },
      { freeText: "x" },
    ]);
    const empty = draftFromList({ filter: base, sortBy: "date", sortDir: "desc" });
    const { updates } = draftToUpdates(empty, sources);
    expect(query(mergeListUpdates(current, updates))).toBe(query({ filter: base }));
  });
});

describe("mergeListUpdates", () => {
  it("clears kinds and search text when the key is present but undefined", () => {
    const current = applyAll([{ kinds: ["income"] }, { freeText: "abc" }]);
    const next = mergeListUpdates(current, { kinds: undefined, freeText: undefined });
    expect(next.kinds).toBeUndefined();
    expect(next.filter.freeText).toBeUndefined();
  });

  it("leaves kinds and search text alone when the keys are absent", () => {
    const current = applyAll([{ kinds: ["income"] }, { freeText: "abc" }]);
    const next = mergeListUpdates(current, { filter: { amountMin: 3 } });
    expect(next.kinds).toEqual(["income"]);
    expect(next.filter.freeText).toBe("abc");
  });

  it("clearAllUpdates drops every chip filter and keeps the period", () => {
    const current = applyAll([
      {
        filter: {
          categoryIds: ["c"],
          merchantIds: ["m"],
          personIds: ["p"],
          cardIds: ["k"],
          accountIds: ["a"],
          tagIds: ["t"],
          salaryScope: "other",
          amountMin: 1,
          amountMax: 2,
        },
        kinds: ["income"],
      },
      { freeText: "abc" },
    ]);
    expect(query(mergeListUpdates(current, clearAllUpdates()))).toBe(query({ filter: base }));
  });
});

describe("listQueryString", () => {
  it("drops the dates and marks the all-period view", () => {
    const params = new URLSearchParams(
      listQueryString({ filter: base, sortBy: "date", sortDir: "desc", allPeriod: true, highlight: "tx1" }),
    );
    expect(params.get("period")).toBe("all");
    expect(params.has("dateFrom")).toBe(false);
    expect(params.get("highlight")).toBe("tx1");
  });
});

describe("parseAmountBound", () => {
  it("treats blank and junk as no bound", () => {
    expect(parseAmountBound("")).toBeUndefined();
    expect(parseAmountBound("  ")).toBeUndefined();
    expect(parseAmountBound("abc")).toBeUndefined();
    expect(parseAmountBound("12.5")).toBe(12.5);
    expect(parseAmountBound("0")).toBe(0);
  });
});
