import { randomUUID } from "node:crypto";
import {
  accounts,
  alerts,
  cards,
  eq,
  transactionLinks,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import type { LinkSource, TransactionLinkType } from "@moneytrack/contracts";
import { amountsMatch } from "./amounts.js";
import { connectedIssuers, isDuplicateSettlement } from "./card-settlements.js";
import { addDays, nowIso, periodFromDate, withinDays } from "./dates.js";

const SETTLEMENT_WINDOW_DAYS = 35;

function hasLink(
  db: MoneyTrackDb,
  fromId: string,
  toId: string,
  linkType: TransactionLinkType,
): boolean {
  return db
    .select()
    .from(transactionLinks)
    .all()
    .some(
      (row) =>
        row.fromId === fromId && row.toId === toId && row.linkType === linkType,
    );
}

export function createTransactionLink(
  db: MoneyTrackDb,
  fromId: string,
  toId: string,
  linkType: TransactionLinkType,
  source: LinkSource,
  confidence: number,
): string {
  if (hasLink(db, fromId, toId, linkType)) {
    return "";
  }

  const id = randomUUID();
  const timestamp = nowIso();
  db.insert(transactionLinks)
    .values({
      id,
      fromId,
      toId,
      linkType,
      confidence,
      source,
      confirmedAt: source === "manual" ? timestamp : null,
      createdAt: timestamp,
    })
    .run();

  if (linkType === "internal_transfer") {
    db.update(transactions)
      .set({
        excludedFromTotals: true,
        exclusionReason: "internal_transfer",
        updatedAt: timestamp,
      })
      .where(eq(transactions.id, fromId))
      .run();
    db.update(transactions)
      .set({
        excludedFromTotals: true,
        exclusionReason: "internal_transfer",
        updatedAt: timestamp,
      })
      .where(eq(transactions.id, toId))
      .run();
  }

  if (linkType === "card_settlement") {
    db.update(transactions)
      .set({
        excludedFromTotals: true,
        exclusionReason: "card_settlement",
        updatedAt: timestamp,
      })
      .where(eq(transactions.id, fromId))
      .run();
  }

  if (linkType === "refund_of") {
    db.update(transactions)
      .set({
        kind: "refund",
        updatedAt: timestamp,
      })
      .where(eq(transactions.id, fromId))
      .run();
  }

  return id;
}

export function manualLinkTransactions(
  db: MoneyTrackDb,
  fromId: string,
  toId: string,
  linkType: TransactionLinkType,
): string {
  return createTransactionLink(db, fromId, toId, linkType, "manual", 1);
}

function resolveCardForSettlement(
  db: MoneyTrackDb,
  settlement: typeof transactions.$inferSelect,
): typeof cards.$inferSelect | undefined {
  const description = settlement.descriptionRaw;
  const last4Match = description.match(/(\d{4})\b/);
  if (last4Match) {
    const card = db
      .select()
      .from(cards)
      .all()
      .find((row) => row.last4 === last4Match[1]);
    if (card) {
      return card;
    }
  }

  const account = db.select().from(accounts).where(eq(accounts.id, settlement.accountId)).get();
  if (!account?.numberLast4) {
    return undefined;
  }

  return db
    .select()
    .from(cards)
    .all()
    .find((row) => row.last4 === account.numberLast4);
}

function createUnmatchedSettlementAlert(
  db: MoneyTrackDb,
  settlementId: string,
  amountIls: number,
): void {
  const existing = db
    .select()
    .from(alerts)
    .all()
    .find(
      (row) =>
        row.type === "unmatched_settlement" &&
        row.transactionId === settlementId &&
        row.status === "open",
    );
  if (existing) {
    return;
  }

  db.insert(alerts)
    .values({
      id: randomUUID(),
      type: "unmatched_settlement",
      severity: "warning",
      title: "Unmatched card settlement",
      message: `Bank settlement of ${amountIls.toFixed(2)} ILS has no matching card charges`,
      transactionId: settlementId,
      status: "open",
      metadata: JSON.stringify({ amountIls }),
      createdAt: nowIso(),
    })
    .run();
}

export function processSettlementMatching(
  db: MoneyTrackDb,
  dirtyPeriods: Set<string>,
): number {
  // A settlement still counted here belongs to an issuer we do not scrape, so
  // there are no itemised charges to match and an alert would be pure noise.
  const issuers = connectedIssuers(db);
  const settlements = db
    .select()
    .from(transactions)
    .all()
    .filter(
      (row) =>
        row.kind === "card_settlement" &&
        !row.excludedFromTotals &&
        isDuplicateSettlement(row.descriptionRaw, row.descriptionNormalized, issuers),
    );

  let matched = 0;
  for (const settlement of settlements) {
    const card = resolveCardForSettlement(db, settlement);
    if (!card) {
      createUnmatchedSettlementAlert(db, settlement.id, settlement.amountIls);
      continue;
    }

    const windowStart = addDays(settlement.transactionDate, -SETTLEMENT_WINDOW_DAYS);
    const charges = db
      .select()
      .from(transactions)
      .all()
      .filter(
        (row) =>
          row.cardId === card.id &&
          row.kind === "expense" &&
          row.direction === "debit" &&
          !row.excludedFromTotals &&
          row.chargeDate >= windowStart &&
          row.chargeDate <= settlement.transactionDate,
      );

    const chargeTotal = charges.reduce((sum, row) => sum + row.amountIls, 0);
    if (!amountsMatch(chargeTotal, settlement.amountIls)) {
      createUnmatchedSettlementAlert(db, settlement.id, settlement.amountIls);
      continue;
    }

    for (const charge of charges) {
      createTransactionLink(
        db,
        settlement.id,
        charge.id,
        "card_settlement",
        "auto",
        0.9,
      );
    }
    matched += 1;
    dirtyPeriods.add(periodFromDate(settlement.transactionDate));
    dirtyPeriods.add(periodFromDate(settlement.chargeDate));
  }

  return matched;
}

/**
 * Both sides of a real transfer are worded as one by the bank ("העברה ל…" on the
 * payer, "העברה מ…" on the payee). Matching on amount alone paired a nursery
 * purchase with a Bit withdrawal and wrote 19 false links out of 25, each one
 * deleting a real expense and a real income from the books (owner report
 * 2026-09-14). The description is the evidence; the amount is only corroboration.
 */
const TRANSFER_WORDING = /העברה|הע\.\s*ל|transfer|זיכוי\s+מחשבון/i;

export function looksLikeAccountTransfer(description: string): boolean {
  return TRANSFER_WORDING.test(description);
}

export function processInternalTransfers(
  db: MoneyTrackDb,
  dirtyPeriods: Set<string>,
): number {
  const householdAccounts = new Set(db.select().from(accounts).all().map((row) => row.id));
  const candidates = db
    .select()
    .from(transactions)
    .all()
    .filter(
      (row) =>
        householdAccounts.has(row.accountId) &&
        !row.excludedFromTotals &&
        (looksLikeAccountTransfer(row.descriptionRaw) ||
          looksLikeAccountTransfer(row.descriptionNormalized)),
    );

  const debits = candidates.filter((row) => row.direction === "debit");
  const credits = candidates.filter((row) => row.direction === "credit");
  let linked = 0;

  for (const debit of debits) {
    const alreadyLinked = db
      .select()
      .from(transactionLinks)
      .all()
      .some((row) => row.linkType === "internal_transfer" && row.fromId === debit.id);
    if (alreadyLinked) {
      continue;
    }

    const match = credits.find(
      (credit) =>
        credit.accountId !== debit.accountId &&
        amountsMatch(credit.amountIls, debit.amountIls) &&
        withinDays(debit.transactionDate, credit.transactionDate, 3),
    );
    if (!match) {
      continue;
    }

    createTransactionLink(db, debit.id, match.id, "internal_transfer", "auto", 0.85);
    linked += 1;
    dirtyPeriods.add(periodFromDate(debit.transactionDate));
    dirtyPeriods.add(periodFromDate(match.transactionDate));
    dirtyPeriods.add(periodFromDate(debit.chargeDate));
    dirtyPeriods.add(periodFromDate(match.chargeDate));
  }

  return linked;
}

/**
 * A credit with no matching debit is only assumed to be a refund when it lands
 * on a credit card: cards receive money back, they are not paid a salary. On a
 * bank account the same credit stays income, so wages are not swallowed.
 */
function isCardCredit(db: MoneyTrackDb, txn: typeof transactions.$inferSelect): boolean {
  if (txn.cardId) {
    return true;
  }
  const account = db.select().from(accounts).where(eq(accounts.id, txn.accountId)).get();
  return account?.kind === "credit_card";
}

export function processRefunds(db: MoneyTrackDb, dirtyPeriods: Set<string>): number {
  const credits = db
    .select()
    .from(transactions)
    .all()
    .filter(
      (row) =>
        row.direction === "credit" &&
        !row.excludedFromTotals &&
        row.kind !== "card_settlement",
    );

  let matched = 0;
  for (const credit of credits) {
    const linked = db
      .select()
      .from(transactionLinks)
      .all()
      .some((row) => row.fromId === credit.id && row.linkType === "refund_of");
    if (linked) {
      continue;
    }

    const prior = db
      .select()
      .from(transactions)
      .all()
      .filter(
        (row) =>
          row.direction === "debit" &&
          row.descriptionNormalized === credit.descriptionNormalized &&
          row.transactionDate <= credit.transactionDate &&
          amountsMatch(row.amountIls, credit.amountIls),
      )
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))[0];

    if (!prior) {
      if (isCardCredit(db, credit) && credit.kind !== "refund") {
        db.update(transactions)
          .set({ kind: "refund", updatedAt: nowIso() })
          .where(eq(transactions.id, credit.id))
          .run();
        // The kind decides which side of the rollup the row lands on.
        dirtyPeriods.add(periodFromDate(credit.transactionDate));
        dirtyPeriods.add(periodFromDate(credit.chargeDate));
      }
      continue;
    }

    createTransactionLink(db, credit.id, prior.id, "refund_of", "auto", 0.8);
    matched += 1;
    dirtyPeriods.add(periodFromDate(credit.transactionDate));
    dirtyPeriods.add(periodFromDate(prior.transactionDate));
  }

  return matched;
}
