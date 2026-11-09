import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/auth";
import { buildHaStatus } from "@/server/ha-auth";
import { haModeOnly } from "@/server/ha-api";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const blocked = haModeOnly();
  if (blocked) {
    return blocked;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return NextResponse.json(await buildHaStatus(request.headers, token));
}
