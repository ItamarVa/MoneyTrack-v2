import { alerts, eq } from "@moneytrack/db";
import { AlertPatchRequestSchema } from "@moneytrack/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapAlert } from "@/server/intelligence-mappers";
import { zodErrorResponse } from "@/server/api-response";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  try {
    const { id } = await params;
    const body = AlertPatchRequestSchema.parse(await request.json());
    const row = ctx.db.select().from(alerts).where(eq(alerts.id, id)).get();
    if (!row) {
      return NextResponse.json({ error: "Alert not found", code: "not_found" }, { status: 404 });
    }

    ctx.db.update(alerts).set({ status: body.status }).where(eq(alerts.id, id)).run();
    const updated = ctx.db.select().from(alerts).where(eq(alerts.id, id)).get();
    return NextResponse.json(mapAlert(updated!));
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}
