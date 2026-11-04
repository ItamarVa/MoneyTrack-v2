import { describe, expect, it } from "vitest";
import { parseSettingsTab, SETTINGS_TABS } from "./settings-tabs";

describe("parseSettingsTab", () => {
  it("accepts every known tab id", () => {
    for (const tab of SETTINGS_TABS) {
      expect(parseSettingsTab(tab.id)).toBe(tab.id);
    }
    expect(parseSettingsTab("budgets")).toBe("budgets");
  });

  it("keeps the old rules link working by landing on advanced", () => {
    expect(parseSettingsTab("rules")).toBe("advanced");
  });

  it("returns null for missing, empty or unknown values", () => {
    expect(parseSettingsTab(null)).toBeNull();
    expect(parseSettingsTab(undefined)).toBeNull();
    expect(parseSettingsTab("")).toBeNull();
    expect(parseSettingsTab("Budgets")).toBeNull();
    expect(parseSettingsTab("__proto__")).toBeNull();
  });
});
