import type { Category, Transaction } from "@moneytrack/contracts";
import { describe, expect, it } from "vitest";
import {
  dayDistance,
  isMetaDirty,
  isSingleFullSplit,
  isSplitDirty,
  pickCategories,
  rankLinkSuggestions,
  type MetaState,
  type SplitRow,
} from "./transaction-drawer-helpers";

const base: MetaState = { note: "a", tagIds: ["t1", "t2"], excluded: false, reason: "" };

describe("isMetaDirty", () => {
  it("is clean for identical state, tag order and whitespace", () => {
    expect(isMetaDirty({ ...base, tagIds: ["t2", "t1"], note: " a " }, base)).toBe(false);
  });
  it("detects note, tag and exclude changes", () => {
    expect(isMetaDirty({ ...base, note: "b" }, base)).toBe(true);
    expect(isMetaDirty({ ...base, tagIds: ["t1"] }, base)).toBe(true);
    expect(isMetaDirty({ ...base, excluded: true }, base)).toBe(true);
  });
  it("ignores the reason while not excluded", () => {
    expect(isMetaDirty({ ...base, reason: "x" }, base)).toBe(false);
    const excluded = { ...base, excluded: true };
    expect(isMetaDirty({ ...excluded, reason: "x" }, excluded)).toBe(true);
  });
});

describe("split rules", () => {
  const row = (over: Partial<SplitRow>): SplitRow => ({
    categoryId: "c1",
    amount: "100.00",
    note: "",
    ...over,
  });
  it("detects a single row covering the full amount", () => {
    expect(isSingleFullSplit([row({})], -100)).toBe(true);
    expect(isSingleFullSplit([row({ amount: "76.60", original: 76.60282 })], 76.60282)).toBe(true);
  });
  it("allows real splits and partial rows", () => {
    expect(isSingleFullSplit([row({ amount: "60.00" }), row({ amount: "40.00" })], 100)).toBe(false);
    expect(isSingleFullSplit([row({ amount: "60.00" })], 100)).toBe(false);
  });
  it("tracks split dirtiness", () => {
    expect(isSplitDirty([row({})], [row({ note: " " })])).toBe(false);
    expect(isSplitDirty([row({ categoryId: "c2" })], [row({})])).toBe(true);
  });
});

describe("pickCategories", () => {
  const cat = (id: string) => ({ id }) as Category;
  it("prefers freshly fetched categories over the stale page list", () => {
    expect(pickCategories([cat("new"), cat("old")], [cat("old")]).map((c) => c.id)).toEqual([
      "new",
      "old",
    ]);
  });
  it("falls back to props, then empty", () => {
    expect(pickCategories(null, [cat("old")])).toHaveLength(1);
    expect(pickCategories(null, undefined)).toEqual([]);
  });
});

describe("rankLinkSuggestions", () => {
  const tx = (id: string, date: string, amountIls: number) =>
    ({ id, transactionDate: date, amountIls }) as Transaction;
  const self = { id: "self", amountIls: -100, transactionDate: "2026-05-10" };

  it("computes day distance", () => {
    expect(dayDistance("2026-05-10", "2026-05-01")).toBe(9);
  });
  it("puts same-amount in-window first, nearest date first, and drops self/excluded", () => {
    const ranked = rankLinkSuggestions(
      [
        tx("far-text", "2026-05-11", -37),
        tx("exact-far", "2026-04-20", 100),
        tx("exact-near", "2026-05-12", 100),
        tx("self", "2026-05-10", -100),
        tx("linked", "2026-05-10", 100),
        tx("out-of-window", "2025-01-01", 100),
      ],
      self,
      new Set(["linked"]),
    );
    expect(ranked.map((r) => r.id)).toEqual([
      "exact-near",
      "exact-far",
      "far-text",
      "out-of-window",
    ]);
  });
});
