/**
 * Decides whether the bank's payment to a card issuer should be counted.
 * If that issuer is connected we already hold every individual charge, so the
 * bank row is a duplicate and gets excluded; if it is not connected the bank row
 * is the only record of the spend and stays. Without this the same shekel was
 * counted twice (owner report 2026-09-14, MEM-DOMAIN).
 *
 * `processSettlementMatching` in links.ts is the finer, card-level matcher; this
 * runs first and deliberately works at issuer level, because `cards` is empty
 * for scraped-only households.
 */
import { accounts, eq, transactions, type MoneyTrackDb } from "@moneytrack/db";
import { resolveCardIssuer } from "./settlement.js";
import { nowIso, periodFromDate } from "./dates.js";

const EXCLUSION_REASON = "card_settlement";

/** Institution codes of card accounts we actually scrape. */
export function connectedIssuers(db: MoneyTrackDb): Set<string> {
  return new Set(
    db
      .select()
      .from(accounts)
      .all()
      .filter((row) => row.kind === "credit_card")
      .map((row) => row.institutionCode.toLowerCase()),
  );
}

export function isDuplicateSettlement(
  descriptionRaw: string,
  descriptionNormalized: string,
  issuers: ReadonlySet<string>,
): boolean {
  const issuer =
    resolveCardIssuer(descriptionRaw) ?? resolveCardIssuer(descriptionNormalized);
  return issuer !== null && issuers.has(issuer);
}

/**
 * Re-evaluates every card_settlement row and returns how many changed.
 * Idempotent: it also un-excludes a row whose card connection was removed.
 */
export function processCardSettlements(
  db: MoneyTrackDb,
  dirtyPeriods: Set<string>,
): number {
  const issuers = connectedIssuers(db);
  let changed = 0;

  for (const txn of db.select().from(transactions).all()) {
    if (txn.kind !== "card_settlement") {
      continue;
    }
    const shouldExclude = isDuplicateSettlement(
      txn.descriptionRaw,
      txn.descriptionNormalized,
      issuers,
    );
    // Never touch a row a human or another rule excluded for a different reason.
    if (txn.excludedFromTotals && txn.exclusionReason !== EXCLUSION_REASON) {
      continue;
    }
    if (txn.excludedFromTotals === shouldExclude) {
      continue;
    }

    db.update(transactions)
      .set({
        excludedFromTotals: shouldExclude,
        exclusionReason: shouldExclude ? EXCLUSION_REASON : null,
        updatedAt: nowIso(),
      })
      .where(eq(transactions.id, txn.id))
      .run();
    dirtyPeriods.add(periodFromDate(txn.transactionDate));
    dirtyPeriods.add(periodFromDate(txn.chargeDate));
    changed += 1;
  }

  return changed;
}
