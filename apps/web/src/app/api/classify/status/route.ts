import { guardApi } from "@/server/guard-api";
import { getClassifyStatus } from "@/server/classify-jobs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  return NextResponse.json(getClassifyStatus(ctx.db));
}
