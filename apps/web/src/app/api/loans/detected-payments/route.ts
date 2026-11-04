import { queryDetectedLoanPayments } from "@moneytrack/engine";
import { NextResponse } from "next/server";
import { guardApi } from "@/server/guard-api";

export const runtime = "nodejs";

/** Recurring `loan_payment` debits of the last 6 months, for the empty Loans page. */
export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const today = new Date().toISOString().slice(0, 10);
  return NextResponse.json({ payments: queryDetectedLoanPayments(ctx.db, today) });
}
