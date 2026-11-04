import { eq, transactions } from "@moneytrack/db";
import { getClassificationDetail } from "@moneytrack/classify";
import { guardApi } from "@/server/guard-api";
import { notFound } from "@/server/api-response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { id } = await context.params;
  const existing = ctx.db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!existing) return notFound("Transaction");

  const detail = getClassificationDetail(ctx.db, id);
  if (!detail) return notFound("Transaction");

  return NextResponse.json(detail);
}
