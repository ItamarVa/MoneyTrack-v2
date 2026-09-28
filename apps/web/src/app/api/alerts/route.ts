import { alerts } from "@moneytrack/db";
import { NextResponse } from "next/server";
import { guardApi } from "@/server/guard-api";
import { mapAlert } from "@/server/intelligence-mappers";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const rows = ctx.db
    .select()
    .from(alerts)
    .all()
    .filter((row) => row.status !== "dismissed")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ alerts: rows.map(mapAlert) });
}
