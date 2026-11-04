import {
  SalarySourceCreateRequestSchema,
  SalarySourceListResponseSchema,
} from "@moneytrack/contracts";
import { eq, salarySources } from "@moneytrack/db";
import { randomUUID } from "node:crypto";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapSalarySource } from "@/server/salary-source-mappers";
import { writeAudit } from "@/server/auth";
import { zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const rows = ctx.db.select().from(salarySources).all();
  const body = SalarySourceListResponseSchema.parse({
    salarySources: rows
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(mapSalarySource),
  });
  return NextResponse.json(body);
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  try {
    const body = SalarySourceCreateRequestSchema.parse(await request.json());
    const now = nowIso();
    const id = randomUUID();

    ctx.db
      .insert(salarySources)
      .values({
        id,
        displayName: body.displayName,
        personId: body.personId ?? null,
        merchantId: body.merchantId ?? null,
        accountId: body.accountId ?? null,
        matchPattern: body.matchPattern ?? null,
        sortOrder: body.sortOrder,
        enabled: body.enabled,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    writeAudit(ctx.db, "salary_source_create", ctx.session.user.id, { salarySourceId: id });

    const row = ctx.db.select().from(salarySources).where(eq(salarySources.id, id)).get()!;
    return NextResponse.json(mapSalarySource(row), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}
