import { randomUUID } from "node:crypto";
import {
  eq,
  accounts,
  holdings,
  instruments,
  loans,
  netWorthSnapshots,
  priceObservations,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { roundToAgora } from "./amortization.js";
import { totalLoanLiabilitiesAt } from "./loan-schedule.js";
import { addDays, nowIso } from "./dates.js";

/**
 * Splits synced balances into assets and card debt. A negative credit-card balance is
 * the upcoming card bill (a liability), never a negative asset. Business accounts and
 * loan-kind accounts (principal comes from loan schedules) are excluded.
 */
function latestAccountBalances(
  db: MoneyTrackDb,
  asOf: string,
): { assetsIls: number; cardDebtIls: number } {
  const rows = db
    .select()
    .from(accounts)
    .all()
    .filter(
      (row) =>
        row.scope === "household" &&
        row.kind !== "loan" &&
        row.balanceIls !== null &&
        row.balanceDate !== null &&
        row.balanceDate <= asOf,
    );

  let assets = 0;
  let cardDebt = 0;
  for (const row of rows) {
    if (row.kind === "credit_card" && row.balanceIls! < 0) {
      cardDebt += -row.balanceIls!;
    } else {
      assets += row.balanceIls!;
    }
  }
  return { assetsIls: roundToAgora(assets), cardDebtIls: roundToAgora(cardDebt) };
}

function holdingsMarketValue(db: MoneyTrackDb, asOf: string): number {
  const allHoldings = db.select().from(holdings).all().filter((row) => row.asOf <= asOf);
  let total = 0;

  for (const holding of allHoldings) {
    const prices = db
      .select()
      .from(priceObservations)
      .where(eq(priceObservations.instrumentId, holding.instrumentId))
      .all()
      .filter((row) => row.asOf <= asOf)
      .sort((a, b) => b.asOf.localeCompare(a.asOf));

    const price = prices[0]?.price ?? 0;
    const instrument = db
      .select()
      .from(instruments)
      .where(eq(instruments.id, holding.instrumentId))
      .get();

    if (!instrument) {
      continue;
    }

    const value = holding.quantity * price;
    total += instrument.currency === "ILA" ? value / 100 : value;
  }

  return roundToAgora(total);
}

export function computeNetWorth(db: MoneyTrackDb, asOf: string): {
  totalAssetsIls: number;
  totalLiabilitiesIls: number;
  netWorthIls: number;
  cardDebtIls: number;
} {
  const { assetsIls, cardDebtIls } = latestAccountBalances(db, asOf);
  const investments = holdingsMarketValue(db, asOf);
  const totalAssetsIls = roundToAgora(assetsIls + investments);
  const totalLiabilitiesIls = roundToAgora(totalLoanLiabilitiesAt(db, asOf) + cardDebtIls);
  const netWorthIls = roundToAgora(totalAssetsIls - totalLiabilitiesIls);

  return { totalAssetsIls, totalLiabilitiesIls, netWorthIls, cardDebtIls };
}

export type NetWorthPartialReason = "no_loans" | "no_savings";

/**
 * True when net worth cannot be the whole picture: monthly loan debits exist but no loan
 * is entered, or no savings/pension/investment account or holding exists.
 */
export function computeNetWorthCompleteness(
  db: MoneyTrackDb,
  asOf: string,
): { partial: boolean; reasons: NetWorthPartialReason[] } {
  const reasons: NetWorthPartialReason[] = [];

  if (db.select().from(loans).all().length === 0) {
    const since = addDays(asOf, -90);
    const hasLoanPayments = db
      .select()
      .from(transactions)
      .where(eq(transactions.kind, "loan_payment"))
      .all()
      .some((row) => row.direction === "debit" && row.transactionDate >= since && row.transactionDate <= asOf);
    if (hasLoanPayments) reasons.push("no_loans");
  }

  const hasSavings =
    db
      .select()
      .from(accounts)
      .all()
      .some((row) => row.scope === "household" && (row.kind === "savings" || row.kind === "investment")) ||
    db.select().from(holdings).all().length > 0;
  if (!hasSavings) reasons.push("no_savings");

  return { partial: reasons.length > 0, reasons };
}

export function persistNetWorthSnapshot(db: MoneyTrackDb, asOf: string): string {
  const { totalAssetsIls, totalLiabilitiesIls, netWorthIls } = computeNetWorth(db, asOf);
  db.delete(netWorthSnapshots).where(eq(netWorthSnapshots.asOf, asOf)).run();
  const id = randomUUID();
  db.insert(netWorthSnapshots)
    .values({
      id,
      asOf,
      totalAssetsIls,
      totalLiabilitiesIls,
      netWorthIls,
      computedAt: nowIso(),
    })
    .run();
  return id;
}
