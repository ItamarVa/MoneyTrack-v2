import { HA_PASSPHRASE_MAX_LENGTH, missingHaPassphraseRequirements } from "@moneytrack/contracts";
import { checkPassword } from "@moneytrack/crypto";
import { describe, expect, it } from "vitest";
import { haDenylistCandidates } from "./ha-passphrase-denylist.js";
import { checkHaPassphrase } from "./ha-vault.js";

// Four Hebrew letters as escapes: source files stay free of Hebrew characters.
const HEBREW = "\u05D0\u05D1\u05D2\u05D3";

function codeOf(passphrase: string, haUsername = "owner"): string | null {
  return checkHaPassphrase(passphrase, haUsername)?.code ?? null;
}

describe("HA master passphrase policy", () => {
  it("accepts eight characters covering all four classes", () => {
    expect(checkHaPassphrase("Aa1!aaaa", "owner")).toBeNull();
    expect(missingHaPassphraseRequirements("Aa1!aaaa")).toEqual([]);
  });

  it("rejects seven characters", () => {
    expect(codeOf("Aa1!aaa")).toBe("passphrase_too_short");
    expect(missingHaPassphraseRequirements("Aa1!aaa")).toEqual(["length"]);
  });

  it.each([
    ["AA1!AAAA", "lower"],
    ["aa1!aaaa", "upper"],
    ["Aa!!aaaa", "digit"],
    ["Aa1aaaaa", "special"],
  ])("rejects %s for missing %s", (passphrase, requirement) => {
    expect(missingHaPassphraseRequirements(passphrase)).toEqual([requirement]);
    expect(checkHaPassphrase(passphrase, "owner")).toMatchObject({
      status: 400,
      code: "passphrase_missing_classes",
      error: expect.stringContaining(`missing: ${requirement}`),
    });
  });

  it("still rejects a common password that meets every class", () => {
    expect(codeOf("Password1 ")).toBe("too_common");
  });

  it("does not count Hebrew letters as lowercase or uppercase", () => {
    expect(missingHaPassphraseRequirements(`${HEBREW}${HEBREW}1!`)).toEqual(["lower", "upper"]);
    expect(codeOf(`${HEBREW}${HEBREW}1!`)).toBe("passphrase_missing_classes");
    expect(checkHaPassphrase(`${HEBREW}aB1!`, "owner")).toBeNull();
  });

  it("counts a space as special and never trims", () => {
    expect(checkHaPassphrase("Aa1 aaaa", "owner")).toBeNull();
    expect(checkHaPassphrase(" Aa1aaaa", "owner")).toBeNull();
    expect(codeOf(" Aa1aaa")).toBe("passphrase_too_short");
  });

  it("caps the length that reaches Argon2id", () => {
    const atCap = `Aa1!${"a".repeat(HA_PASSPHRASE_MAX_LENGTH - 4)}`;
    expect(checkHaPassphrase(atCap, "owner")).toBeNull();
    expect(codeOf(`${atCap}a`)).toBe("passphrase_too_long");
  });

  it("still rejects a passphrase built from the HA username", () => {
    expect(codeOf("Owner-Aa1!", "owner")).toBe("too_similar");
  });
});

describe("HA master password denylist normalization", () => {
  it.each([
    ["Password1!", "trailing digit and symbol"],
    ["!Qwerty123", "leading symbol, trailing digits"],
    ["#2026Football", "leading symbol and digits"],
    ["Sunshine2026!!", "trailing digits and symbols"],
    ["P@ssw0rd#9", "leetspeak"],
  ])("rejects %s as too_common (%s)", (password) => {
    expect(codeOf(password)).toBe("too_common");
  });

  it.each([
    ["Moneytrack2026#", "owner"],
    ["M0neyTrack!7", "owner"],
    ["0wner-Kit3#", "owner"],
  ])("rejects %s as too_similar for user %s", (password, haUsername) => {
    expect(codeOf(password, haUsername)).toBe("too_similar");
  });

  it.each(["Tq8#vLm2", "Rk4$zWp9n", "Blue-Kettle-58", "Hz7!quartz-Lamp"])("accepts %s", (password) => {
    expect(checkHaPassphrase(password, "owner")).toBeNull();
  });

  it("never compares a core shorter than four characters", () => {
    const candidates = haDenylistCandidates("12Ab!!");
    expect(candidates).not.toContain("ab");
    expect(candidates.every((candidate) => candidate.length >= 4)).toBe(true);
  });

  it("leaves the desktop login rule unchanged", () => {
    expect(checkPassword("Password1!")).toEqual({ ok: true });
    expect(checkPassword("!Qwerty123")).toEqual({ ok: true });
  });
});
