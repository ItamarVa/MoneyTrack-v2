import { UserCredentialResetRequestSchema } from "@moneytrack/contracts";
import { eq, users } from "@moneytrack/db";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodErrorResponse } from "@/server/api-response";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { haModeOnly } from "@/server/ha-api";
import { resetHaUserCredentials } from "@/server/ha-auth";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const blocked = haModeOnly();
  if (blocked) {
    return blocked;
  }
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  const { id: targetUserId } = await context.params;
  const target = ctx.db.select().from(users).where(eq(users.id, targetUserId)).get();
  if (!target) {
    return NextResponse.json({ error: "User not found", code: "not_found" }, { status: 404 });
  }

  if (target.id === ctx.session.user.id) {
    return NextResponse.json({ error: "Cannot reset yourself", code: "invalid_target" }, { status: 400 });
  }

  let body: { reason?: string } = {};
  try {
    const raw = await request.json();
    body = UserCredentialResetRequestSchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      return zodErrorResponse(error);
    }
    body = {};
  }

  await resetHaUserCredentials(ctx.db, targetUserId, ctx.session.user.id, body.reason);
  return NextResponse.json({ ok: true as const });
}
