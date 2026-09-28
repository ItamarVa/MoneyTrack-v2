import { HaUnlockRequestSchema } from "@moneytrack/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodErrorResponse } from "@/server/api-response";
import { assertValidOrigin } from "@/server/csrf";
import { isHaUsernameAllowed } from "@/server/ha-allowed-users";
import { haModeOnly } from "@/server/ha-api";
import { HaIdentityError, requireHaIdentity } from "@/server/ha-identity";
import { unlockHaVault } from "@/server/ha-vault";

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
    body = HaUnlockRequestSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return zodErrorResponse(error);
    }
    return NextResponse.json({ error: "Invalid request", code: "validation_error" }, { status: 400 });
  }

  const result = await unlockHaVault(identity, body.passphrase);
  if (!result.ok) {
    console.warn(`[ha] unlock refused: ${result.code}`);
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
      },
      { status: result.status },
    );
  }
  console.info(`[ha] vault unlocked by user ${result.userId}`);
  return NextResponse.json({ ok: true as const });
}
