import { describe, expect, it } from "vitest";
import { normalizeMerchant } from "@moneytrack/classify";
import { escapeCsvCell } from "./csv-export.js";

const ADVERSARIAL_PAYLOADS = [
  '<script>alert("xss")</script>',
  '<img src=x onerror=alert(1)>',
  "'; DROP TABLE transactions; --",
  "\u202Etxet elpmis",
  "\0hidden",
  "../../etc/passwd",
  "=cmd|'/c calc'!A1",
  "+SUM(A1:A9999)",
  "-2+3+cmd|' /C calc'!A0",
  "@SUM(A1:A1)",
  "a".repeat(10_000),
  "(a+){25}",
];

describe("adversarial merchant descriptors", () => {
  it("normalizes hostile strings without throwing or hanging", () => {
    for (const payload of ADVERSARIAL_PAYLOADS) {
      const started = Date.now();
      const normalized = normalizeMerchant(payload);
      expect(Date.now() - started).toBeLessThan(500);
      expect(typeof normalized).toBe("string");
      expect(normalized).not.toContain("\0");
    }
  });

  it("stores normalized text safely for CSV export (formula neutralization)", () => {
    for (const payload of ADVERSARIAL_PAYLOADS) {
      const cell = escapeCsvCell(normalizeMerchant(payload));
      expect(cell.startsWith("=")).toBe(false);
      expect(cell.startsWith("+")).toBe(false);
      expect(cell.startsWith("-")).toBe(false);
      expect(cell.startsWith("@")).toBe(false);
    }
  });

  it("prefixes CSV formula injection cells safely", () => {
    const formulaPayloads = [
      "=cmd|'/c calc'!A1",
      "+SUM(A1:A9999)",
      "-2+3",
      "@SUM(A1:A1)",
      "\t=injected",
    ];
    for (const payload of formulaPayloads) {
      const cell = escapeCsvCell(normalizeMerchant(payload));
      expect(cell.startsWith("'")).toBe(true);
    }
  });

  it("quotes cells that contain commas or newlines and escapes embedded quotes", () => {
    const value = 'merchant, "quoted" name\nsecond line';
    const cell = escapeCsvCell(value);
    expect(cell.startsWith('"')).toBe(true);
    expect(cell.endsWith('"')).toBe(true);
    expect(cell).toContain('""');
  });
});
