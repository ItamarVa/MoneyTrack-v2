import { PROVIDER_CATALOG } from "@moneytrack/contracts";
import { guardApi } from "@/server/guard-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Drives the connection form: which institutions exist and what each one asks for. */
export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }
  return NextResponse.json({ providers: PROVIDER_CATALOG });
}
