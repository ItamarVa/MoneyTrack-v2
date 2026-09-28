import { HaEnrollRequestSchema } from "@moneytrack/contracts";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodErrorResponse } from "@/server/api-response";
import { assertValidOrigin } from "@/server/csrf";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth";
import { isHaUsernameAllowed } from "@/server/ha-allowed-users";
import { haModeOnly } from "@/server/ha-api";
import { HaIdentityError, requireHaIdentity } from "@/server/ha-identity";
import { enrollHaUser } from "@/server/ha-vault";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const blocked = haModeOnly();
  if (blocked) {
    return blocked;
  }
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  let identity;
  try {
    identity = requireHaIdentity(request.headers);
  } catch (error) {
    if (error instanceof HaIdentityError) {
      return NextResponse.json({ error: "HA identity required", code: "ha_identity_missing" }, { status: 403 });
    }
    throw error;
  }

  if (!isHaUsernameAllowed(identity.haUsername)) {
    return NextResponse.json({ error: "No access", code: "ha_no_access" }, { status: 403 });
  }

  let body;
  try {
    body = HaEnrollRequestSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return zodErrorResponse(error);
    }
    return NextResponse.json({ error: "Invalid request", code: "validation_error" }, { status: 400 });
  }

  if (!body.recoveryKeyAcknowledged) {
    return NextResponse.json(
      { error: "Recovery key must be acknowledged", code: "recovery_not_acknowledged" },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await enrollHaUser(identity, { passphrase: body.passphrase, pin: body.pin });
  } catch (error) {
    console.error("[ha] enroll failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Enroll failed", code: "enroll_failed" }, { status: 500 });
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }

  (await cookies()).set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions(request));
  console.info(`[ha] enrolled user ${result.userId}${result.recoveryKey ? " (vault created)" : ""}`);
  return NextResponse.json({
    ok: true as const,
    userId: result.userId,
    recoveryKey: result.recoveryKey ?? "(existing household — recovery key unchanged)",
  });
}
