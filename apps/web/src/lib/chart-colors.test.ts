import { describe, expect, it } from "vitest";
import {
  assignStableColors,
  CHART_COLORS,
  INCOME_CHART_COLORS,
  stableColorIndex,
} from "./chart-colors";

describe("stableColorIndex", () => {
  it("returns the same index for the same key", () => {
    const key = "00000000-0000-4000-8000-000000000001";
    expect(stableColorIndex(key, INCOME_CHART_COLORS.length)).toBe(
      stableColorIndex(key, INCOME_CHART_COLORS.length),
    );
  });

  it("is stable regardless of key order in the input list", () => {
    const keys = ["salary-a", "salary-b", "salary-c"];
    const shuffled = [...keys].reverse();
    for (const key of keys) {
      expect(stableColorIndex(key, INCOME_CHART_COLORS.length)).toBe(
        stableColorIndex(key, INCOME_CHART_COLORS.length),
      );
    }
    expect(assignStableColors(keys, INCOME_CHART_COLORS).get("salary-a")).toBe(
      assignStableColors(shuffled, INCOME_CHART_COLORS).get("salary-a"),
    );
  });
});

describe("assignStableColors", () => {
  it("assigns distinct colours within one view", () => {
    const keys = ["id-1", "id-2", "id-3", "id-4"];
    const colors = assignStableColors(keys, INCOME_CHART_COLORS);
    const values = [...colors.values()];
    expect(new Set(values).size).toBe(keys.length);
  });

  it("keeps the same colour when key list order changes", () => {
    const keysA = ["salary-a", "salary-b", "salary-c"];
    const keysB = [...keysA].reverse();
    for (const key of keysA) {
      expect(assignStableColors(keysA, INCOME_CHART_COLORS).get(key)).toBe(
        assignStableColors(keysB, INCOME_CHART_COLORS).get(key),
      );
    }
  });

  it("keeps income palette separate from expense palette", () => {
    for (const incomeColor of INCOME_CHART_COLORS) {
      expect(CHART_COLORS).not.toContain(incomeColor);
    }
  });
});
