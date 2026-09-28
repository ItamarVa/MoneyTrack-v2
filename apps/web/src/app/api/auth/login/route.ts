import { LoginRequestSchema } from "@moneytrack/contracts";
import { eq, loginAttempts, users } from "@moneytrack/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodErrorResponse } from "@/server/api-response";
import { assertValidOrigin } from "@/server/csrf";
import { getServerDb } from "@/server/db";
import {
  SESSION_COOKIE,
  createSession,
  createSessionToken,
  isAddressThrottled,
  isLoginLocked,
  lockoutRetryAfterSeconds,
  recordLoginAttempt,
  sessionCookieOptions,
  verifyPassword,
  writeAudit,
} from "@/server/auth";

export const runtime = "nodejs";

const GENERIC_FAILURE = "Invalid username or password";

export async function POST(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const db = await getServerDb();

  let body: ReturnType<typeof LoginRequestSchema.parse>;
  try {
    body = LoginRequestSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return zodErrorResponse(error);
    }
    return NextResponse.json({ error: GENERIC_FAILURE, code: "auth_failed" }, { status: 401 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // While throttled the attempt is deliberately not recorded, so a flood of
  // requests cannot keep pushing the unlock time further away.
  if (isLoginLocked(db, body.username)) {
    writeAudit(db, "login_lockout", null, { username: body.username, reason: "account_locked" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    return NextResponse.json(
      {
        error: "Too many failed login attempts for this account.",
        code: "account_locked",
        retryAfterSeconds: lockoutRetryAfterSeconds(db, loginAttempts.username, body.username),
      },
      { status: 401 },
    );
  }

  if (isAddressThrottled(db, ip)) {
    writeAudit(db, "login_lockout", null, { username: body.username, reason: "ip_throttled" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    return NextResponse.json(
      {
        error: "Too many failed login attempts from this address.",
        code: "ip_throttled",
        retryAfterSeconds: lockoutRetryAfterSeconds(db, loginAttempts.ipAddress, ip!),
      },
      { status: 401 },
    );
  }

  const user = db
    .select()
    .from(users)
    .where(eq(users.username, body.username))
    .get();

  const valid =
    user !== undefined &&
    (await verifyPassword(body.password, user.passwordHash));

  recordLoginAttempt(db, body.username, valid, ip);

  if (!valid) {
    writeAudit(db, "login_failed", user?.id ?? null, { username: body.username });
    await new Promise((resolve) => setTimeout(resolve, 200));
    return NextResponse.json({ error: GENERIC_FAILURE, code: "auth_failed" }, { status: 401 });
  }

  const token = createSessionToken();
  const session = createSession(db, user.id, token);
  writeAudit(db, "login_success", user.id);

  const response = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      personId: user.personId,
      mustChangePassword: user.mustChangePassword,
    },
    session: { id: session.id, expiresAt: session.expiresAt },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
