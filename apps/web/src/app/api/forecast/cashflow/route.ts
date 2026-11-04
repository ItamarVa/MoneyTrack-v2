import { forecastCashflow } from "@moneytrack/alerts";
import { NextResponse } from "next/server";
import { guardApi } from "@/server/guard-api";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const days = Number.parseInt(url.searchParams.get("days") ?? "90", 10);
  const horizonDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 90;
  const forecast = forecastCashflow(ctx.db, horizonDays);
  return NextResponse.json(forecast);
}
