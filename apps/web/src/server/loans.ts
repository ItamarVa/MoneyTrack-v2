import { accounts, eq, loanTracks, loans, type MoneyTrackDb } from "@moneytrack/db";
import {
  currentAssumptionSetId,
  persistNetWorthSnapshot,
  remainingPrincipalAt,
  totalLoanLiabilitiesAt,
} from "@moneytrack/engine";
import { mapAccount, mapLoan, mapLoanTrack } from "@/server/mappers";

export function loanRemainingPrincipal(db: MoneyTrackDb, loanId: string, asOf?: string): number {
  const tracks = db.select().from(loanTracks).where(eq(loanTracks.loanId, loanId)).all();
  const date = asOf ?? new Date().toISOString().slice(0, 10);
  let total = 0;
  for (const track of tracks) {
    total += remainingPrincipalAt(db, track.id, date);
  }
  return total;
}

export function buildLoanDetail(db: MoneyTrackDb, loanId: string) {
  const loan = db.select().from(loans).where(eq(loans.id, loanId)).get();
  if (!loan) {
    return null;
  }

  const account = db.select().from(accounts).where(eq(accounts.id, loan.accountId)).get();
  if (!account) {
    return null;
  }

  const tracks = db
    .select()
    .from(loanTracks)
    .where(eq(loanTracks.loanId, loanId))
    .all()
    .map(mapLoanTrack);

  return {
    loan: mapLoan(loan),
    account: mapAccount(account),
    tracks,
    remainingPrincipal: loanRemainingPrincipal(db, loanId),
  };
}

export function afterLoanMutation(db: MoneyTrackDb): void {
  const asOf = new Date().toISOString().slice(0, 10);
  totalLoanLiabilitiesAt(db, asOf);
  persistNetWorthSnapshot(db, asOf);
}

export function currentAssumptionSet(db: MoneyTrackDb): string {
  return currentAssumptionSetId(db);
}
