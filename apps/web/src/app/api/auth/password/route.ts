import { ChangePasswordRequestSchema } from "@moneytrack/contracts";
import { checkPassword } from "@moneytrack/crypto";
import { eq, users } from "@moneytrack/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodErrorResponse } from "@/server/api-response";
import { assertValidOrigin } from "@/server/csrf";
import {
  SESSION_COOKIE,
  createSession,
  createSessionToken,
  hashPassword,
  invalidateUserSessions,
  sessionCookieOptions,
  verifyPassword,
  writeAudit,
} from "@/server/auth";
import { guardApi } from "@/server/guard-api";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const guarded = await guardApi({ allowPasswordChange: true });
  if (guarded instanceof Response) {
    return guarded;
  }

  const { session, db } = guarded;
  const jar = await cookies();

  let body: ReturnType<typeof ChangePasswordRequestSchema.parse>;
  try {
    body = ChangePasswordRequestSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return zodErrorResponse(error);
    }
    return NextResponse.json({ error: "Invalid request", code: "validation_error" }, { status: 400 });
  }

  const user = db.select().from(users).where(eq(users.id, session.user.id)).get();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const currentValid = await verifyPassword(body.currentPassword, user.passwordHash);
  if (!currentValid) {
    writeAudit(db, "password_change_failed", user.id);
    return NextResponse.json({ error: "Invalid current password", code: "auth_failed" }, { status: 401 });
  }

  // Checked only after the current password proves identity, so the denylist
  // cannot be probed by anyone holding nothing but a stolen session cookie.
  const policy = checkPassword(body.newPassword, { username: user.username });
  if (!policy.ok) {
    return NextResponse.json(
      { error: "Password rejected by policy", code: `password_${policy.reason}` },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(body.newPassword);
  const now = new Date().toISOString();
  db.update(users)
    .set({
      passwordHash,
      mustChangePassword: false,
      updatedAt: now,
    })
    .where(eq(users.id, user.id)).run();

  invalidateUserSessions(db, user.id);
  const newToken = createSessionToken();
  createSession(db, user.id, newToken);
  writeAudit(db, "password_changed", user.id);

  jar.set(SESSION_COOKIE, newToken, sessionCookieOptions());
  return NextResponse.json({ ok: true as const });
}
