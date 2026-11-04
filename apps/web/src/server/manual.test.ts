import { describe, expect, it } from "vitest";
import {
  buildManualIdentityHash,
  defaultKind,
  isManualInstitution,
  normalizeDescription,
} from "./manual.js";

describe("manual entry helpers", () => {
  it("normalizes descriptions", () => {
    expect(normalizeDescription("  קפה   תל אביב  ")).toBe("קפה");
  });

  it("builds unique manual identity hashes", () => {
    const a = buildManualIdentityHash();
    const b = buildManualIdentityHash();
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(b);
  });

  it("defaults kind from direction", () => {
    expect(defaultKind("debit")).toBe("expense");
    expect(defaultKind("credit")).toBe("income");
  });

  it("recognizes manual institution codes", () => {
    expect(isManualInstitution("bit")).toBe(true);
    expect(isManualInstitution("isracard")).toBe(false);
  });
});
