import { randomUUID } from "node:crypto";
import {
  eq,
  accounts,
  holdings,
  instruments,
  netWorthSnapshots,
  priceObservations,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { roundToAgora } from "./amortization.js";
import { totalLoanLiabilitiesAt } from "./loan-schedule.js";
import { nowIso } from "./dates.js";

function latestAccountBalances(db: MoneyTrackDb, asOf: string): number {
  const rows = db
    .select()
    .from(accounts)
    .all()
    .filter(
      (row) =>
        row.balanceIls !== null &&
        row.balanceDate !== null &&
        row.balanceDate <= asOf,
    );

  let total = 0;
  for (const row of rows) {
    total += row.balanceIls!;
  }
  return roundToAgora(total);
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
} {
  const rawBalances = latestAccountBalances(db, asOf);
  const investments = holdingsMarketValue(db, asOf);
  const totalAssetsIls = roundToAgora(rawBalances + investments);
  const totalLiabilitiesIls = totalLoanLiabilitiesAt(db, asOf);
  const netWorthIls = roundToAgora(totalAssetsIls - totalLiabilitiesIls);

  return { totalAssetsIls, totalLiabilitiesIls, netWorthIls };
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
