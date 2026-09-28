/**
 * Guards the rules that decide whether a shekel counts: card settlements,
 * savings moves, and transfer wording. The strings reproduce the shape of
 * Israeli bank and card statement wording; account and branch numbers, payee
 * names and amounts are placeholders, and fund houses are taken from the
 * pattern lists under test. If a pattern stops matching these, the dashboard
 * silently double-counts again.
 */
import { describe, expect, it } from "vitest";
import { expenseContribution, incomeContribution } from "./amounts.js";
import { isDuplicateSettlement } from "./card-settlements.js";
import { looksLikeAccountTransfer } from "./links.js";
import { looksLikeSavingsMove } from "./savings.js";
import { resolveCardIssuer } from "./settlement.js";
import { resolveTransactionKind } from "./transaction-kind.js";

describe("card settlement wording", () => {
  it.each([
    ["מקס איט פי חיוב", "max"],
    ["לדוגמה לכרטיס ממקס", "max"],
    ["ישראכרט חיוב", "isracard"],
    ["לדוגמה לכרטיס מישראכרט", "isracard"],
    ["כ.א.ל חיוב", "visacal"],
    ["לדוגמה לכרטיס מכאל", "visacal"],
  ])("reads %s as %s", (description, issuer) => {
    expect(resolveCardIssuer(description)).toBe(issuer);
  });

  it.each([
    "העברה למיכאל כהן",
    "מקסים מסעדה",
    "הפקדת המחאה לדוגמה",
    "משכנתא לדוגמה חיוב",
  ])("does not read %s as a settlement", (description) => {
    expect(resolveCardIssuer(description)).toBeNull();
  });

  it("only excludes a settlement whose issuer we scrape", () => {
    const connected = new Set(["max"]);
    expect(isDuplicateSettlement("מקס איט פי חיוב", "מקס איט פי חיוב", connected)).toBe(true);
    expect(isDuplicateSettlement("ישראכרט חיוב", "ישראכרט חיוב", connected)).toBe(false);
  });
});

describe("savings moves", () => {
  it.each([
    'קניית ני"ע קרן כספית לדוגמה',
    "מכירת ניע לדוגמה קסם אקטיב",
    "הראל ביטוח ופיננסים חיוב",
    "העברה לדוגמה באיביאי גמל ל 00-000-0000000000",
    "הע. למגדל לדוגמה 00-000",
    "הלוואות ב.",
  ])("treats %s as savings", (description) => {
    expect(looksLikeSavingsMove(description)).toBe(true);
  });

  it.each(["דוגמה טק משכורת", "הפקדת המחאה לדוגמה", "הע. לדוגמה אנרגיה בסניף 11-000"])(
    "leaves %s alone",
    (description) => {
      expect(looksLikeSavingsMove(description)).toBe(false);
    },
  );

  it("contributes to neither income nor expense once tagged", () => {
    const kind = resolveTransactionKind({
      accountKind: "bank",
      descriptionRaw: "מכירת ני\"ע לדוגמה קסם אקטיב",
      descriptionNormalized: "מכירת ניע לדוגמה קסם אקטיב",
      fallbackKind: "income",
    });
    expect(kind).toBe("transfer");

    const txn = { excludedFromTotals: false, kind, direction: "credit", amountIls: 1000.91 };
    expect(expenseContribution(txn)).toBe(0);
    expect(incomeContribution(txn)).toBe(0);
  });

  it("never re-reads a card purchase as savings", () => {
    expect(
      resolveTransactionKind({
        accountKind: "credit_card",
        descriptionRaw: "מיטב דש מסעדה",
        descriptionNormalized: "מיטב דש מסעדה",
        fallbackKind: "expense",
      }),
    ).toBe("expense");
  });
});

describe("settlement contribution", () => {
  const settlement = {
    excludedFromTotals: false,
    kind: "card_settlement",
    direction: "debit",
    amountIls: 1234.56,
  };

  it("counts while the issuer is not scraped", () => {
    expect(expenseContribution(settlement)).toBe(1234.56);
  });

  it("drops to zero once excluded as a duplicate", () => {
    expect(expenseContribution({ ...settlement, excludedFromTotals: true })).toBe(0);
  });
});

describe("internal transfer wording", () => {
  it.each(["העברה לישראל ישראלי,רות ישראלי", "העברה מisrael israeli,ruth israeli", "הע. לדוגמה ביטוח בסניף 20-000"])(
    "accepts %s",
    (description) => {
      expect(looksLikeAccountTransfer(description)).toBe(true);
    },
  );

  it.each(["משתלת הגן", "cloud hosting services intl", "ביטוח לדוגמה לאומי", "קולנוע לדוגמה אינטרנט"])(
    "rejects %s",
    (description) => {
      expect(looksLikeAccountTransfer(description)).toBe(false);
    },
  );
});
