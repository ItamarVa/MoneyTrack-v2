import { describe, expect, it } from "vitest";
import { classifyRedirectTab, parseSettingsTab, SETTINGS_TABS } from "./settings-tabs";

describe("parseSettingsTab", () => {
  it("accepts every known tab id", () => {
    for (const tab of SETTINGS_TABS) {
      expect(parseSettingsTab(tab.id)).toBe(tab.id);
    }
    expect(parseSettingsTab("budgets")).toBe("budgets");
  });

  it("sends the old rules and categories links to the classification hub", () => {
    expect(parseSettingsTab("rules")).toBeNull();
    expect(parseSettingsTab("categories")).toBeNull();
    expect(classifyRedirectTab("rules")).toBe("rules");
    expect(classifyRedirectTab("categories")).toBe("categories");
    expect(classifyRedirectTab("budgets")).toBeNull();
    expect(classifyRedirectTab(null)).toBeNull();
  });

  it("returns null for missing, empty or unknown values", () => {
    expect(parseSettingsTab(null)).toBeNull();
    expect(parseSettingsTab(undefined)).toBeNull();
    expect(parseSettingsTab("")).toBeNull();
    expect(parseSettingsTab("Budgets")).toBeNull();
    expect(parseSettingsTab("__proto__")).toBeNull();
  });
});
