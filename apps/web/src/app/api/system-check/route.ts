import { NextResponse } from "next/server";
import { guardApi } from "@/server/guard-api";
import { runSystemChecks } from "@/server/system-check";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }
  const body = await runSystemChecks(ctx.db);
  return NextResponse.json(body);
}
