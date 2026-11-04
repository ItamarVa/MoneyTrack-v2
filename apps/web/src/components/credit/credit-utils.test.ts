import type { Account, CategoryBreakdownItem } from "@moneytrack/contracts";
import { describe, expect, it } from "vitest";
import {
  cardLabel,
  chargeHero,
  chargesForCards,
  chargeTiming,
  creditCardAccounts,
  creditFilter,
  daysBetween,
  selectedCardIds,
  sharePercent,
  topMerchants,
} from "./credit-utils";
import type { CreditCardCharges } from "./credit-types";

// Synthetic data only.
function account(id: string, kind: Account["kind"], scope: Account["scope"] = "household"): Account {
  return { id, kind, scope } as Account;
}

function charge(
  accountId: string,
  kind: CreditCardCharges["charge"]["kind"],
  date: string | null,
  amountIls: number,
  transactionCount = 1,
): CreditCardCharges {
  return {
    accountId,
    displayName: accountId,
    institutionCode: "max",
    numberLast4: "1234",
    charge: { kind, date, amountIls, transactionCount },
  };
}

describe("creditCardAccounts", () => {
  it("keeps household credit cards only", () => {
    const rows = [
      account("a", "credit_card"),
      account("b", "bank"),
      account("c", "credit_card", "business"),
      account("d", "credit_card"),
    ];
    expect(creditCardAccounts(rows).map((row) => row.id)).toEqual(["a", "d"]);
  });
});

describe("selectedCardIds", () => {
  const cards = [{ id: "a" }, { id: "b" }];
  it("filters on every card when nothing is selected", () => {
    expect(selectedCardIds(cards, null)).toEqual(["a", "b"]);
  });
  it("filters on the selected card", () => {
    expect(selectedCardIds(cards, "b")).toEqual(["b"]);
  });
  it("falls back to all cards when the selection no longer exists", () => {
    expect(selectedCardIds(cards, "gone")).toEqual(["a", "b"]);
  });
  it("is empty without cards", () => {
    expect(selectedCardIds([], "a")).toEqual([]);
  });
});

describe("chargesForCards", () => {
  it("keeps only the cards in play", () => {
    const rows = [charge("a", "upcoming", "2026-11-10", 1), charge("b", "upcoming", "2026-11-10", 2)];
    expect(chargesForCards(rows, ["b"]).map((row) => row.accountId)).toEqual(["b"]);
  });
});

describe("chargeHero", () => {
  it("sums upcoming charges and reports the shared date", () => {
    const hero = chargeHero([
      charge("a", "upcoming", "2026-11-10", 100.1, 2),
      charge("b", "upcoming", "2026-11-10", 50.2, 3),
    ]);
    expect(hero).toEqual({ kind: "upcoming", amountIls: 150.3, transactionCount: 5, date: "2026-11-10" });
  });

  it("has no single date when cards bill on different days", () => {
    const hero = chargeHero([charge("a", "upcoming", "2026-11-02", 10), charge("b", "upcoming", "2026-11-10", 20)]);
    expect(hero?.date).toBeNull();
    expect(hero?.amountIls).toBe(30);
  });

  it("ignores a past charge when another card has one upcoming", () => {
    const hero = chargeHero([charge("a", "last", "2026-10-10", 900), charge("b", "upcoming", "2026-11-10", 20)]);
    expect(hero).toMatchObject({ kind: "upcoming", amountIls: 20, date: "2026-11-10" });
  });

  it("falls back to the last charges, labelled as last", () => {
    const hero = chargeHero([charge("a", "last", "2026-10-10", 70), charge("b", "none", null, 0, 0)]);
    expect(hero).toMatchObject({ kind: "last", amountIls: 70, date: "2026-10-10" });
  });

  it("is null when no card has any charge", () => {
    expect(chargeHero([charge("a", "none", null, 0, 0)])).toBeNull();
    expect(chargeHero([])).toBeNull();
  });
});

describe("chargeTiming", () => {
  it("counts calendar days across a month end", () => {
    expect(daysBetween("2026-11-28", "2026-12-02")).toBe(4);
  });
  it("labels today, tomorrow and later", () => {
    expect(chargeTiming("2026-11-04", { kind: "upcoming", date: "2026-11-04" })).toEqual({ kind: "today" });
    expect(chargeTiming("2026-11-04", { kind: "upcoming", date: "2026-11-05" })).toEqual({ kind: "tomorrow" });
    expect(chargeTiming("2026-11-04", { kind: "upcoming", date: "2026-11-10" })).toEqual({
      kind: "inDays",
      days: 6,
    });
  });
  it("treats a last charge as past", () => {
    expect(chargeTiming("2026-11-04", { kind: "last", date: "2026-10-10" })).toEqual({ kind: "past" });
  });
});

describe("creditFilter", () => {
  it("bounds a month on the chosen basis and names the cards", () => {
    expect(creditFilter("2026-11", "charge", ["a"])).toEqual({
      dateBasis: "charge",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-30",
      accountIds: ["a"],
    });
  });
  it("leaves dates open for the all-period view", () => {
    expect(creditFilter("all", "transaction", ["a", "b"])).toEqual({
      dateBasis: "transaction",
      accountIds: ["a", "b"],
    });
  });
});

describe("topMerchants", () => {
  const item = (name: string, amountIls: number): CategoryBreakdownItem =>
    ({ categoryId: name, categoryName: name, amountIls, transactionCount: 1 }) as CategoryBreakdownItem;

  it("returns the five biggest and skips refunds", () => {
    const items = [
      item("a", 10),
      item("b", 90),
      item("c", -5),
      item("d", 40),
      item("e", 30),
      item("f", 20),
      item("g", 70),
    ];
    expect(topMerchants(items).map((row) => row.categoryName)).toEqual(["b", "g", "d", "e", "f"]);
  });
});

describe("sharePercent and cardLabel", () => {
  it("rounds a share and guards a zero total", () => {
    expect(sharePercent(25, 200)).toBe(13);
    expect(sharePercent(5, 0)).toBe(0);
  });
  it("shows issuer and last four", () => {
    expect(cardLabel({ institutionCode: "isracard", numberLast4: "4321" })).toBe(
      "ישראכרט ••4321",
    );
    expect(cardLabel({ institutionCode: "max", numberLast4: null })).toBe("מקס");
  });
});
