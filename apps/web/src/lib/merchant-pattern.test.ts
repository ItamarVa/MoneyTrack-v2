import { describe, expect, it } from "vitest";
import { suggestMerchantPattern } from "./merchant-pattern";

describe("suggestMerchantPattern", () => {
  it("uses the first two words for long chain-store descriptors", () => {
    expect(suggestMerchantPattern("acme market 104 springfield")).toBe("acme market");
    expect(suggestMerchantPattern("acme market 207 shelbyville")).toBe("acme market");
  });

  it("keeps short Hebrew merchant names whole", () => {
    expect(suggestMerchantPattern("מאפיית הכפר")).toBe("מאפיית הכפר");
    expect(suggestMerchantPattern("שופרסל")).toBe("שופרסל");
  });
});
