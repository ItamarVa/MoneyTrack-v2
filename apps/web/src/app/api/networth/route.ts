import { netWorthSnapshots } from "@moneytrack/db";
import { NextResponse } from "next/server";
import { guardApi } from "@/server/guard-api";
import { mapNetWorthSnapshot } from "@/server/intelligence-mappers";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const rows = ctx.db
    .select()
    .from(netWorthSnapshots)
    .all()
    .sort((a, b) => a.asOf.localeCompare(b.asOf));

  return NextResponse.json({ snapshots: rows.map(mapNetWorthSnapshot) });
}
