import type { Category } from "@moneytrack/contracts";
import { describe, expect, it } from "vitest";
import {
  buildCategoryGroups,
  categoryPathLabel,
  fillTemplate,
  flattenGroups,
  normalizeSearch,
} from "./category-options";

let counter = 0;
function cat(name: string, parentId: string | null = null, sortOrder = 0): Category {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    parentId,
    name,
    sortOrder,
    note: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const food = cat("אוכל", null, 1);
const groceries = cat("סופר", food.id, 1);
const cafes = cat("בתי קפה", food.id, 2);
const car = cat("רכב", null, 2);
const fuel = cat("דלק", car.id, 1);
const dupFood = cat("סופר", car.id, 2); // same name under another parent
const all = [car, fuel, dupFood, cafes, food, groceries];

describe("buildCategoryGroups", () => {
  it("groups children under their parent in sortOrder", () => {
    const groups = buildCategoryGroups(all, "");
    expect(groups.map((g) => g.root.name)).toEqual(["אוכל", "רכב"]);
    expect(groups[0]!.children.map((c) => c.name)).toEqual(["סופר", "בתי קפה"]);
    expect(groups[0]!.children[0]!.depth).toBe(1);
  });

  it("marks duplicate names as ambiguous", () => {
    const options = flattenGroups(buildCategoryGroups(all, ""));
    expect(options.filter((o) => o.name === "סופר").every((o) => o.ambiguous)).toBe(true);
    expect(options.find((o) => o.name === "דלק")!.ambiguous).toBe(false);
  });

  it("filters by child name and keeps the parent header", () => {
    const groups = buildCategoryGroups(all, "דל");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.root.name).toBe("רכב");
    expect(groups[0]!.children.map((c) => c.name)).toEqual(["דלק"]);
  });

  it("keeps every child when only the parent matches", () => {
    const groups = buildCategoryGroups(all, "אוכל");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.children).toHaveLength(2);
  });

  it("matches across parent and child tokens to tell duplicates apart", () => {
    const groups = buildCategoryGroups(all, "רכב סופר");
    const options = flattenGroups(groups);
    expect(options.map((o) => o.name)).toEqual(["רכב", "סופר"]);
    expect(options[1]!.parentName).toBe("רכב");
  });

  it("returns nothing for an unknown query", () => {
    expect(buildCategoryGroups(all, "zzz")).toEqual([]);
  });

  it("excludes ids and promotes orphans to roots", () => {
    const groups = buildCategoryGroups(all, "", { excludeIds: [food.id] });
    expect(groups.map((g) => g.root.name)).toEqual(["סופר", "בתי קפה", "רכב"]);
  });

  it("survives a parent cycle", () => {
    const a = cat("א");
    const b = cat("ב", a.id);
    const cyclic = { ...a, parentId: b.id };
    expect(() => buildCategoryGroups([cyclic, b], "")).not.toThrow();
  });
});

describe("helpers", () => {
  it("normalizes whitespace, case and niqqud", () => {
    expect(normalizeSearch("  שָׁלוֹם   ABC ")).toBe("שלום abc");
  });

  it("labels a child with its parent", () => {
    expect(categoryPathLabel(all, groceries.id)).toBe("אוכל › סופר");
    expect(categoryPathLabel(all, food.id)).toBe("אוכל");
    expect(categoryPathLabel(all, null)).toBeNull();
  });

  it("fills placeholders and leaves unknown ones", () => {
    expect(fillTemplate("{n} של {x} {y}", { n: 3, x: "a" })).toBe("3 של a {y}");
  });
});
