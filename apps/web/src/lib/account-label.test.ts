import { describe, expect, it } from "vitest";
import he from "@/locales/he.json";
import { accountLabel, knownBrand } from "./account-label";

const brands = he.plainUx.brands;

describe("accountLabel", () => {
  it("replaces the raw default name with the brand and shows the last four once", () => {
    expect(accountLabel({ displayName: "max 1234", institutionCode: "max", last4: "1234" })).toBe(
      `${brands.max} ••1234`,
    );
    expect(
      accountLabel({ displayName: "discount 1234", institutionCode: "discount", last4: "1234" }),
    ).toBe(`${brands.discount} ••1234`);
  });

  it("takes the last four from the default name when none is given", () => {
    expect(accountLabel({ displayName: "isracard 1234", institutionCode: "isracard" })).toBe(
      `${brands.isracard} ••1234`,
    );
  });

  it("keeps a user-chosen name and appends the last four unless it already has it", () => {
    expect(accountLabel({ displayName: "My card", institutionCode: "max", last4: "1234" })).toBe(
      "My card ••1234",
    );
    expect(accountLabel({ displayName: "Card 1234", institutionCode: "max", last4: "1234" })).toBe(
      "Card 1234",
    );
  });

  it("maps every known provider and leaves unknown codes as they are", () => {
    expect(knownBrand("visaCal")).toBe(brands.cal);
    expect(knownBrand("cal")).toBe(brands.cal);
    expect(knownBrand("amex")).toBe(brands.amex);
    expect(accountLabel({ institutionCode: "someBank", displayName: "someBank 1234", last4: "1234" })).toBe(
      "someBank ••1234",
    );
  });

  it("works for a card without an institution code and for a missing last four", () => {
    expect(accountLabel({ displayName: "Visa card", last4: "1234" })).toBe("Visa card ••1234");
    expect(accountLabel({ displayName: brands.cash, institutionCode: "cash" })).toBe(brands.cash);
    expect(accountLabel({ institutionCode: "max" })).toBe(brands.max);
  });

  it("labels the manual cash-account codes from the locale file", () => {
    expect(accountLabel({ institutionCode: "bit" })).toBe(brands.bit);
    expect(accountLabel({ institutionCode: "paybox" })).toBe(brands.paybox);
    expect(accountLabel({ institutionCode: "cash" })).toBe(brands.cash);
  });
});
