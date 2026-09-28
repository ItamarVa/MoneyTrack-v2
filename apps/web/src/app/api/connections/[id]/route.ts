import { ConnectionUpdateRequestSchema } from "@moneytrack/contracts";
import { accounts, connections, eq, inArray, jobs, transactions, type MoneyTrackDb } from "@moneytrack/db";
import { deleteSecret } from "@moneytrack/vault";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapConnection } from "@/server/mappers";
import { writeAudit } from "@/server/auth";
import { apiError, notFound, zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";

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
  if (ctx instanceof Response) {
    return ctx;
  }

  const { id } = await context.params;
  const existing = ctx.db.select().from(connections).where(eq(connections.id, id)).get();
  if (!existing) {
    return notFound("Connection");
  }

  try {
    const body = ConnectionUpdateRequestSchema.parse(await request.json());
    const now = nowIso();
    const updates: Partial<typeof connections.$inferInsert> = { updatedAt: now };

    if (body.enabled !== undefined) {
      updates.enabled = body.enabled;
    }
    if (body.scheduleCron !== undefined) {
      updates.scheduleCron = body.scheduleCron;
    }

    ctx.db.update(connections).set(updates).where(eq(connections.id, id)).run();
    writeAudit(ctx.db, "connection_update", ctx.session.user.id, { connectionId: id });

    const row = ctx.db.select().from(connections).where(eq(connections.id, id)).get()!;
    return NextResponse.json(mapConnection(row));
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return zodErrorResponse(error as import("zod").ZodError);
    }
    throw error;
  }
}

function readJobConnectionId(payloadJson: string): string | null {
  try {
    const parsed = JSON.parse(payloadJson) as { connectionId?: unknown };
    return typeof parsed.connectionId === "string" ? parsed.connectionId : null;
  } catch {
    return null;
  }
}

function cancelQueuedJobsForConnection(db: MoneyTrackDb, connectionId: string, now: string): void {
  const rows = db.select().from(jobs).all();
  for (const row of rows) {
    if (row.status !== "queued" || row.kind !== "scrape") {
      continue;
    }
    if (readJobConnectionId(row.payloadJson) !== connectionId) {
      continue;
    }
    db.update(jobs)
      .set({
        status: "failed",
        errorClass: "CONNECTION_DELETED",
        updatedAt: now,
      })
      .where(eq(jobs.id, row.id))
      .run();
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
  const existing = ctx.db.select().from(connections).where(eq(connections.id, id)).get();
  if (!existing) {
    return notFound("Connection");
  }

  const linkedAccounts = ctx.db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.connectionId, id))
    .all();
  if (linkedAccounts.length > 0) {
    const accountIds = linkedAccounts.map((row) => row.id);
    const hasTransactions = ctx.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(inArray(transactions.accountId, accountIds))
      .get();
    if (hasTransactions) {
      return apiError(
        409,
        "Cannot delete this connection because synced transactions exist on its accounts. Disable the connection instead.",
        "connection_has_transactions",
      );
    }
  }

  const now = nowIso();

  try {
    await deleteSecret(existing.credentialRef);
  } catch {
    // ponytail: vault entry may never have been written for credential-less connections
  }

  cancelQueuedJobsForConnection(ctx.db, id, now);

  ctx.db
    .update(accounts)
    .set({ connectionId: null, updatedAt: now })
    .where(eq(accounts.connectionId, id))
    .run();
  ctx.db.delete(connections).where(eq(connections.id, id)).run();

  writeAudit(ctx.db, "connection_delete", ctx.session.user.id, {
    connectionId: id,
    providerCode: existing.providerCode,
  });

  return NextResponse.json({ ok: true as const });
}
