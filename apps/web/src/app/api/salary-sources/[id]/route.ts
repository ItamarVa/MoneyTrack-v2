import { SalarySourceUpdateRequestSchema } from "@moneytrack/contracts";
import { eq, salarySources } from "@moneytrack/db";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapSalarySource } from "@/server/salary-source-mappers";
import { writeAudit } from "@/server/auth";
import { notFound, zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { id } = await context.params;
  const existing = ctx.db.select().from(salarySources).where(eq(salarySources.id, id)).get();
  if (!existing) return notFound("Salary source");

  try {
    const body = SalarySourceUpdateRequestSchema.parse(await request.json());
    const updates: Partial<typeof salarySources.$inferInsert> = { updatedAt: nowIso() };
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.personId !== undefined) updates.personId = body.personId;
    if (body.merchantId !== undefined) updates.merchantId = body.merchantId;
    if (body.accountId !== undefined) updates.accountId = body.accountId;
    if (body.matchPattern !== undefined) updates.matchPattern = body.matchPattern;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    ctx.db.update(salarySources).set(updates).where(eq(salarySources.id, id)).run();
    writeAudit(ctx.db, "salary_source_update", ctx.session.user.id, { salarySourceId: id });

    const row = ctx.db.select().from(salarySources).where(eq(salarySources.id, id)).get()!;
    return NextResponse.json(mapSalarySource(row));
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { id } = await context.params;
  const existing = ctx.db.select().from(salarySources).where(eq(salarySources.id, id)).get();
  if (!existing) return notFound("Salary source");

  ctx.db.delete(salarySources).where(eq(salarySources.id, id)).run();
  writeAudit(ctx.db, "salary_source_delete", ctx.session.user.id, { salarySourceId: id });

  return NextResponse.json({ ok: true });
}
