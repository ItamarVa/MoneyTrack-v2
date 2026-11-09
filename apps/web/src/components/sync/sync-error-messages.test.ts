import { describe, expect, it } from "vitest";
import he from "@/locales/he.json";
import { KNOWN_SYNC_ERROR_CLASSES, describeSyncError } from "./sync-error-messages";

const HEBREW = /[֐-׿]/;

describe("describeSyncError", () => {
  it("maps every known error class to a Hebrew message that names the provider and a next step", () => {
    expect(KNOWN_SYNC_ERROR_CLASSES).toEqual(
      expect.arrayContaining([
        "CREDENTIALS_MISSING",
        "INVALID_PASSWORD",
        "CHANGE_PASSWORD",
        "ACCOUNT_BLOCKED",
        "TWO_FACTOR_RETRIEVER_MISSING",
        "TIMEOUT",
        "GENERIC",
        "GENERAL_ERROR",
        "SCRAPE_EXCEPTION",
        "SYNC_FAILED",
        "NOT_IMPLEMENTED",
      ]),
    );
    for (const errorClass of KNOWN_SYNC_ERROR_CLASSES) {
      const message = describeSyncError(errorClass, "discount");
      expect(message.what).toMatch(HEBREW);
      expect(message.todo).toMatch(HEBREW);
      expect(message.what).toContain("בנק דיסקונט");
      expect(message.text).not.toContain("{provider}");
      expect(message.text).not.toContain(errorClass);
    }
  });

  it("gives specific messages for the specific classes", () => {
    const wrong = describeSyncError("INVALID_PASSWORD", "discount").text;
    expect(wrong).toContain("סיסמה");
    expect(wrong).toContain("פרטי התחברות");
    expect(describeSyncError("ACCOUNT_BLOCKED", "max").text).toContain("חסימ");
    expect(describeSyncError("TIMEOUT", "max").text).not.toBe(describeSyncError("INVALID_PASSWORD", "max").text);
  });

  it("falls back to the generic message for unknown, empty and missing classes", () => {
    const generic = describeSyncError("GENERIC", "max").text;
    expect(describeSyncError("SOMETHING_NEW", "max").text).toBe(generic);
    expect(describeSyncError("", "max").text).toBe(generic);
    expect(describeSyncError(null, "max").text).toBe(generic);
    expect(describeSyncError("SOMETHING_NEW", "max").text).not.toContain("SOMETHING_NEW");
  });

  it("has a he.json entry for every message key", () => {
    for (const key of Object.keys(he.autoSync.errors)) {
      expect(KNOWN_SYNC_ERROR_CLASSES).toContain(key);
    }
  });
});
