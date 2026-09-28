import { describe, expect, it } from "vitest";
import type { Account, Card } from "@moneytrack/contracts";
import {
  buildSourceIndex,
  selectedSourceIds,
  sourceLabelFor,
  sourceOptions,
  splitSourceIds,
} from "./transaction-source";

const NOW = "2026-06-01T00:00:00.000Z";

function account(
  id: string,
  displayName: string,
  numberLast4: string | null = null,
): Account {
  return {
    id,
    kind: "bank",
    connectionId: null,
    institutionCode: "leumi",
    displayName,
    numberLast4,
    currency: "ILS",
    ownerPersonId: null,
    note: null,
    scope: "household",
    balanceIls: null,
    balanceDate: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function card(
  id: string,
  settlementAccountId: string,
  displayName: string,
  last4: string,
): Card {
  return {
    id,
    settlementAccountId,
    last4,
    cardholderPersonId: "00000000-0000-4000-8000-000000000001",
    brand: "visa",
    displayName,
    note: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("transaction-source", () => {
  it("prefers the card label over the settlement account", () => {
    const bank = account("acc-a", "Checking", "1111");
    const visa = card("card-a", bank.id, "Visa Gold", "4444");
    const index = buildSourceIndex([bank], [visa]);

    expect(
      sourceLabelFor({ accountId: bank.id, cardId: visa.id }, index),
    ).toBe("Visa Gold ••4444");
  });

  it("falls back to the account label and omits last4 when absent", () => {
    const bank = account("acc-a", "Checking");
    const index = buildSourceIndex([bank], []);

    expect(sourceLabelFor({ accountId: bank.id, cardId: null }, index)).toBe("Checking");
  });

  it("appends account last4 when present", () => {
    const bank = account("acc-a", "Checking", "1234");
    const index = buildSourceIndex([bank], []);

    expect(sourceLabelFor({ accountId: bank.id, cardId: null }, index)).toBe("Checking ••1234");
  });

  it("orders options as each account followed by its cards", () => {
    const bankA = account("acc-a", "Bank A", "1111");
    const bankB = account("acc-b", "Bank B", "2222");
    const cardA1 = card("card-a1", bankA.id, "Card A1", "3333");
    const cardA2 = card("card-a2", bankA.id, "Card A2", "4444");
    const cardB1 = card("card-b1", bankB.id, "Card B1", "5555");

    expect(sourceOptions([bankA, bankB], [cardA1, cardA2, cardB1]).map((row) => row.id)).toEqual([
      bankA.id,
      cardA1.id,
      cardA2.id,
      bankB.id,
      cardB1.id,
    ]);
  });

  it("round-trips picker selection through splitSourceIds and selectedSourceIds", () => {
    const bank = account("acc-a", "Checking", "1111");
    const visa = card("card-a", bank.id, "Visa", "4444");
    const options = sourceOptions([bank], [visa]);
    const selected = [bank.id, visa.id];

    const split = splitSourceIds(selected, options);
    expect(split).toEqual({
      accountIds: [bank.id],
      cardIds: [visa.id],
    });
    expect(selectedSourceIds(split)).toEqual(selected);
  });
});
