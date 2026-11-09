import {
  HaPinUpdateRequestSchema,
  HaPinVerifyRequestSchema,
} from "@moneytrack/contracts";
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
  sessionCookieOptions,
  writeAudit,
} from "@/server/auth";
import { getServerDb } from "@/server/db";
import { isDbKeyPresent } from "@/server/db-key-handoff";
import { isHaUsernameAllowed } from "@/server/ha-allowed-users";
import { haModeOnly } from "@/server/ha-api";
import {
  HA_PIN_IDLE_MS,
  setUserPin,
  verifyUserPin,
} from "@/server/ha-auth";
import { HaIdentityError, requireHaIdentity } from "@/server/ha-identity";
import { verifyHaPassphrase } from "@/server/ha-vault";

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

  if (!isDbKeyPresent()) {
    return NextResponse.json({ error: "Vault locked", code: "vault_locked" }, { status: 403 });
  }

  let body;
  try {
    body = HaPinVerifyRequestSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return zodErrorResponse(error);
    }
    return NextResponse.json({ error: "Invalid request", code: "validation_error" }, { status: 400 });
  }

  const db = await getServerDb();
  const user = db.select().from(users).where(eq(users.haUserId, identity.haUserId)).get();
  if (!user?.pinHash) {
    return NextResponse.json({ error: "Not enrolled", code: "not_enrolled" }, { status: 403 });
  }

  if (user.pinLockedAt) {
    return NextResponse.json(
      { error: "PIN locked — use the master password", code: "pin_locked" },
      { status: 403 },
    );
  }

  const result = await verifyUserPin(db, user.id, body.pin);
  if (!result.ok) {
    if (result.locked) {
      console.warn(`[ha] PIN locked for user ${user.id}; master passphrase required`);
      return NextResponse.json(
        { error: "PIN locked — use the master password", code: "pin_locked" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Invalid PIN", code: "auth_failed" }, { status: 401 });
  }

  const token = createSessionToken();
  createSession(db, user.id, token);
  writeAudit(db, "ha_pin_success", user.id);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(request));

  const sessionExpiresAt = new Date(Date.now() + HA_PIN_IDLE_MS).toISOString();
  return NextResponse.json({ ok: true as const, sessionExpiresAt });
}

export async function PATCH(request: Request): Promise<Response> {
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
    body = HaPinUpdateRequestSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return zodErrorResponse(error);
    }
    return NextResponse.json({ error: "Invalid request", code: "validation_error" }, { status: 400 });
  }

  if (!isDbKeyPresent()) {
    return NextResponse.json({ error: "Vault locked", code: "vault_locked" }, { status: 403 });
  }

  const db = await getServerDb();
  const user = db.select().from(users).where(eq(users.haUserId, identity.haUserId)).get();
  if (!user) {
    return NextResponse.json({ error: "Not enrolled", code: "not_enrolled" }, { status: 403 });
  }

  const verified = await verifyHaPassphrase(identity, body.passphrase);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error, code: verified.code }, { status: verified.status });
  }
  if (verified.userId !== user.id) {
    return NextResponse.json({ error: "Not enrolled", code: "not_enrolled" }, { status: 403 });
  }

  await setUserPin(db, user.id, body.newPin);
  writeAudit(db, "ha_pin_updated", user.id);
  return NextResponse.json({ ok: true as const });
}
