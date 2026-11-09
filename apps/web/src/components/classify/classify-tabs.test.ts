import { describe, expect, it } from "vitest";
import { CLASSIFY_TABS, parseClassifyTab } from "./classify-tabs";

describe("parseClassifyTab", () => {
  it("accepts every known tab id", () => {
    for (const tab of CLASSIFY_TABS) expect(parseClassifyTab(tab.id)).toBe(tab.id);
  });

  it("returns null for missing or unknown values", () => {
    expect(parseClassifyTab(null)).toBeNull();
    expect(parseClassifyTab("")).toBeNull();
    expect(parseClassifyTab("Rules")).toBeNull();
    expect(parseClassifyTab("__proto__")).toBeNull();
  });
});
