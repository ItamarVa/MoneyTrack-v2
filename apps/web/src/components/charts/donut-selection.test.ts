import { describe, expect, it } from "vitest";
import { reduceSelection, sliceKey } from "./donut-selection";
import type { DonutSlice } from "./types";

const drillDown = { filter: { dateBasis: "charge" as const }, sourceView: "test" };

function slice(overrides: Partial<DonutSlice>): DonutSlice {
  return {
    categoryId: "cat-a",
    categoryName: "Groceries",
    amountIls: 100,
    transactionCount: 2,
    drillDown,
    displayAmount: 100,
    percent: 10,
    color: "#000",
    ...overrides,
  };
}

describe("reduceSelection", () => {
  it("selects on first tap without drilling", () => {
    expect(reduceSelection(null, { type: "tap", key: "a", canDrill: true })).toEqual({
      selectedKey: "a",
      drill: false,
    });
  });

  it("drills and closes the readout when the selected slice is tapped again", () => {
    expect(reduceSelection("a", { type: "tap", key: "a", canDrill: true })).toEqual({
      selectedKey: null,
      drill: true,
    });
  });

  it("moves the selection when another slice is tapped", () => {
    expect(reduceSelection("a", { type: "tap", key: "b", canDrill: true })).toEqual({
      selectedKey: "b",
      drill: false,
    });
  });

  it("clears the selection", () => {
    expect(reduceSelection("a", { type: "clear" })).toEqual({ selectedKey: null, drill: false });
    expect(reduceSelection(null, { type: "clear" })).toEqual({ selectedKey: null, drill: false });
  });

  it("never drills a slice that cannot drill (balance highlight), even when re-tapped", () => {
    const first = reduceSelection(null, { type: "tap", key: "balance", canDrill: false });
    expect(first).toEqual({ selectedKey: "balance", drill: false });
    expect(reduceSelection(first.selectedKey, { type: "tap", key: "balance", canDrill: false })).toEqual({
      selectedKey: "balance",
      drill: false,
    });
  });

  it("treats a legend tap like a slice tap because both share sliceKey", () => {
    const row = slice({});
    const key = sliceKey(row);
    const afterSlice = reduceSelection(null, { type: "tap", key, canDrill: true });
    const afterLegend = reduceSelection(afterSlice.selectedKey, { type: "tap", key: sliceKey(row), canDrill: true });
    expect(afterSlice.drill).toBe(false);
    expect(afterLegend.drill).toBe(true);
  });
});

describe("sliceKey", () => {
  it("separates the same category on the inner and outer ring", () => {
    expect(sliceKey(slice({ ring: "inner" }))).not.toBe(sliceKey(slice({ ring: "outer" })));
  });

  it("keys balance highlights by ring and kind, and falls back to the name without an id", () => {
    expect(sliceKey(slice({ isBalanceHighlight: true, ring: "outer", balanceKind: "surplus" }))).toBe(
      "balance-outer-surplus",
    );
    expect(sliceKey(slice({ categoryId: null, categoryName: "Other" }))).toBe("slice-Other");
  });
});
