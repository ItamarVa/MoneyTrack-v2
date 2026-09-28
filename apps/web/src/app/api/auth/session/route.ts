import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerDb } from "@/server/db";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const db = await getServerDb();
  const session = getSessionUser(db, token);

  if (!session) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  return NextResponse.json({
    authenticated: true,
    user: session.user,
  });
}
