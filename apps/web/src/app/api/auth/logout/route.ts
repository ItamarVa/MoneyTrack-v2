import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { assertValidOrigin } from "@/server/csrf";
import { getServerDb } from "@/server/db";
import {
  SESSION_COOKIE,
  deleteSession,
  getSessionUser,
  sessionCookieOptions,
  writeAudit,
} from "@/server/auth";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const db = await getServerDb();

  if (token) {
    const session = getSessionUser(db, token);
    deleteSession(db, token);
    writeAudit(db, "logout", session?.user.id ?? null);
  } else {
    writeAudit(db, "logout", null);
  }

  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return NextResponse.json({ ok: true as const });
}
