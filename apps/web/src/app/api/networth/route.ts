import { netWorthSnapshots } from "@moneytrack/db";
import {
  computeNetWorth,
  computeNetWorthCompleteness,
  persistNetWorthSnapshot,
} from "@moneytrack/engine";
import { NextResponse } from "next/server";
import { guardApi } from "@/server/guard-api";
import { mapNetWorthSnapshot } from "@/server/intelligence-mappers";

export const runtime = "nodejs";

/**
 * `partial` + `partialReasons` ("no_loans" | "no_savings") tell the UI the figure cannot
 * be the whole picture; `cardDebtIls` is the card bill counted inside liabilities.
 */
export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const today = new Date().toISOString().slice(0, 10);
  // Re-persist today's snapshot so a stale one (written before a rule change) never shows.
  persistNetWorthSnapshot(ctx.db, today);

  const rows = ctx.db
    .select()
    .from(netWorthSnapshots)
    .all()
    .sort((a, b) => a.asOf.localeCompare(b.asOf));

  const completeness = computeNetWorthCompleteness(ctx.db, today);

  return NextResponse.json({
    snapshots: rows.map(mapNetWorthSnapshot),
    partial: completeness.partial,
    partialReasons: completeness.reasons,
    cardDebtIls: computeNetWorth(ctx.db, today).cardDebtIls,
  });
}
