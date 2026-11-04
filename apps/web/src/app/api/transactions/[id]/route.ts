/**
 * Transaction detail, update, and delete.
 * GET returns tags, splits, links, and revision history for the detail drawer.
 */
import { MonthPeriodSchema, TransactionUpdateRequestSchema } from "@moneytrack/contracts";
import { ZodError, z } from "zod";
import {
  categorizationDecisions,
  eq,
  or,
  transactionLinks,
  transactionRevisions,
  transactionSplits,
  transactionTags,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapTransaction } from "@/server/mappers";
import { writeAudit } from "@/server/auth";
import { apiError, notFound, zodErrorResponse } from "@/server/api-response";
import { refreshRollupsForTransactions } from "@/server/rollup-refresh";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function parseReportingPeriodFields(
  raw: unknown,
): { reportingPeriod?: string | null; reportingPeriodLocked?: boolean } {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const record = raw as Record<string, unknown>;
  const result: { reportingPeriod?: string | null; reportingPeriodLocked?: boolean } = {};

  if ("reportingPeriod" in record) {
    try {
      result.reportingPeriod = MonthPeriodSchema.nullable().parse(record.reportingPeriod);
    } catch (error) {
      if (error instanceof ZodError) {
        error.issues.forEach((issue) => {
          issue.path = ["reportingPeriod", ...issue.path];
        });
      }
      throw error;
    }
  }
  if ("reportingPeriodLocked" in record) {
    result.reportingPeriodLocked = z.boolean().parse(record.reportingPeriodLocked);
  }

  return result;
}

function nowIso(): string {
  return new Date().toISOString();
}

type RouteContext = { params: Promise<{ id: string }> };

function loadTagIds(db: MoneyTrackDb, transactionId: string): string[] {
  return db
    .select({ tagId: transactionTags.tagId })
    .from(transactionTags)
    .where(eq(transactionTags.transactionId, transactionId))
    .all()
    .map((row) => row.tagId);
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  const { id } = await context.params;
  const row = ctx.db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row) {
    return notFound("Transaction");
  }

  const decision = ctx.db
    .select()
    .from(categorizationDecisions)
    .where(eq(categorizationDecisions.transactionId, id))
    .all()
    .at(-1);

  const tagIds = loadTagIds(ctx.db, id);

  const splits = ctx.db
    .select()
    .from(transactionSplits)
    .where(eq(transactionSplits.transactionId, id))
    .all()
    .map((split) => ({
      id: split.id,
      transactionId: split.transactionId,
      categoryId: split.categoryId,
      amount: split.amount,
      note: split.note,
    }));

  const links = ctx.db
    .select()
    .from(transactionLinks)
    .where(or(eq(transactionLinks.fromId, id), eq(transactionLinks.toId, id)))
    .all()
    .map((link) => ({
      id: link.id,
      fromId: link.fromId,
      toId: link.toId,
      linkType: link.linkType,
      confidence: link.confidence,
      source: link.source,
      confirmedAt: link.confirmedAt,
      createdAt: link.createdAt,
    }));

  const revisions = ctx.db
    .select()
    .from(transactionRevisions)
    .where(eq(transactionRevisions.transactionId, id))
    .all()
    .map((revision) => ({
      id: revision.id,
      transactionId: revision.transactionId,
      runId: revision.runId,
      fieldName: revision.fieldName,
      oldValue: revision.oldValue,
      newValue: revision.newValue,
      revisedAt: revision.revisedAt,
    }));

  return NextResponse.json({
    transaction: mapTransaction(row),
    categoryId: decision?.categoryId ?? row.categoryId ?? null,
    tags: tagIds,
    splits,
    links,
    revisions,
  });
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  const { id } = await context.params;
  const existing = ctx.db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!existing) {
    return notFound("Transaction");
  }

  try {
    const raw = await request.json();
    const body = {
      ...TransactionUpdateRequestSchema.parse(raw),
      ...parseReportingPeriodFields(raw),
    };
    const now = nowIso();
    const updates: Partial<typeof transactions.$inferInsert> = { updatedAt: now };
    const reportingFieldsTouched =
      body.reportingPeriod !== undefined || body.reportingPeriodLocked !== undefined;

    if (reportingFieldsTouched && existing.kind !== "income") {
      return apiError(
        400,
        "Reporting period applies only to income transactions",
        "not_income",
      );
    }

    if (body.userNote !== undefined) {
      updates.userNote = body.userNote;
    }
    if (body.excludedFromTotals !== undefined) {
      updates.excludedFromTotals = body.excludedFromTotals;
    }
    if (body.exclusionReason !== undefined) {
      updates.exclusionReason = body.exclusionReason;
    }
    if (body.reportingPeriod !== undefined) {
      updates.reportingPeriod = body.reportingPeriod;
    }
    if (body.reportingPeriodLocked !== undefined) {
      updates.reportingPeriodLocked = body.reportingPeriodLocked;
    }

    ctx.db.update(transactions).set(updates).where(eq(transactions.id, id)).run();

    if (body.tagIds !== undefined) {
      ctx.db.delete(transactionTags).where(eq(transactionTags.transactionId, id)).run();
      for (const tagId of body.tagIds) {
        ctx.db
          .insert(transactionTags)
          .values({ transactionId: id, tagId })
          .run();
      }
    }

    writeAudit(ctx.db, "transaction_update", ctx.session.user.id, {
      transactionId: id,
    });

    if (
      body.excludedFromTotals !== undefined ||
      body.exclusionReason !== undefined ||
      reportingFieldsTouched
    ) {
      refreshRollupsForTransactions(ctx.db, [id]);
    }

    const row = ctx.db.select().from(transactions).where(eq(transactions.id, id)).get()!;
    const decision = ctx.db
      .select()
      .from(categorizationDecisions)
      .where(eq(categorizationDecisions.transactionId, id))
      .all()
      .at(-1);

    const tagIds = body.tagIds ?? loadTagIds(ctx.db, id);

    const splits = ctx.db
      .select()
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, id))
      .all()
      .map((split) => ({
        id: split.id,
        transactionId: split.transactionId,
        categoryId: split.categoryId,
        amount: split.amount,
        note: split.note,
      }));

    const links = ctx.db
      .select()
      .from(transactionLinks)
      .where(or(eq(transactionLinks.fromId, id), eq(transactionLinks.toId, id)))
      .all()
      .map((link) => ({
        id: link.id,
        fromId: link.fromId,
        toId: link.toId,
        linkType: link.linkType,
        confidence: link.confidence,
        source: link.source,
        confirmedAt: link.confirmedAt,
        createdAt: link.createdAt,
      }));

    const revisions = ctx.db
      .select()
      .from(transactionRevisions)
      .where(eq(transactionRevisions.transactionId, id))
      .all()
      .map((revision) => ({
        id: revision.id,
        transactionId: revision.transactionId,
        runId: revision.runId,
        fieldName: revision.fieldName,
        oldValue: revision.oldValue,
        newValue: revision.newValue,
        revisedAt: revision.revisedAt,
      }));

    return NextResponse.json({
      transaction: mapTransaction(row),
      categoryId: body.categoryId ?? decision?.categoryId ?? null,
      tags: tagIds,
      splits,
      links,
      revisions,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return zodErrorResponse(error as import("zod").ZodError);
    }
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
  if (ctx instanceof Response) {
    return ctx;
  }

  const { id } = await context.params;
  const existing = ctx.db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!existing) {
    return notFound("Transaction");
  }

  if (existing.firstSeenRawId !== null) {
    return apiError(403, "Only manual transactions can be deleted", "not_manual");
  }

  refreshRollupsForTransactions(ctx.db, [id]);
  ctx.db.delete(transactions).where(eq(transactions.id, id)).run();
  writeAudit(ctx.db, "transaction_delete_manual", ctx.session.user.id, {
    transactionId: id,
  });

  return NextResponse.json({ ok: true });
}
