import type { CategorizationRule } from "@moneytrack/contracts";
import { describe, expect, it } from "vitest";
import { filterRules } from "./rules-filter";

const rule = (id: string, pattern: string, categoryId: string) =>
  ({ id, pattern, categoryId, priority: 10, enabled: true }) as CategorizationRule;

const rules = [rule("1", "Shufersal", "c1"), rule("2", "wolt", "c2"), rule("3", "ביטוח", "c2")];
const names = new Map([
  ["c1", "Groceries"],
  ["c2", "מסעדות"],
]);

describe("filterRules", () => {
  it("returns everything for an empty or blank query", () => {
    expect(filterRules(rules, names, "")).toHaveLength(3);
    expect(filterRules(rules, names, "   ")).toHaveLength(3);
  });
  it("matches pattern case-insensitively", () => {
    expect(filterRules(rules, names, "SHUF").map((r) => r.id)).toEqual(["1"]);
  });
  it("matches category name", () => {
    expect(filterRules(rules, names, "מסע").map((r) => r.id)).toEqual(["2", "3"]);
    expect(filterRules(rules, names, "grocer").map((r) => r.id)).toEqual(["1"]);
  });
  it("returns empty when nothing matches and tolerates unknown categories", () => {
    expect(filterRules(rules, names, "zzz")).toEqual([]);
    expect(filterRules([rule("9", "x", "missing")], names, "x")).toHaveLength(1);
  });
});
