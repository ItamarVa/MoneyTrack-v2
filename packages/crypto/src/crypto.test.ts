import { describe, expect, it } from "vitest";
import { decrypt, encrypt, generateKey } from "./index.js";

describe("crypto", () => {
  it("round-trips AES-256-GCM", () => {
    const key = generateKey();
    const ciphertext = encrypt(key, "secret payload");
    expect(decrypt(key, ciphertext)).toBe("secret payload");
  });

  it("rejects tampered ciphertext", () => {
    const key = generateKey();
    const ciphertext = encrypt(key, "secret payload");
    expect(() => decrypt(key, ciphertext.slice(0, -2))).toThrow();
  });
});
