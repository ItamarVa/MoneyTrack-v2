import { SyncJobOtpRequestSchema, SyncJobResponseSchema } from "@moneytrack/contracts";
import { eq, jobs } from "@moneytrack/db";
import { rowToJob } from "@moneytrack/ingest";
import { NextResponse } from "next/server";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const guarded = await guardApi();
  if (guarded instanceof Response) {
    return guarded;
  }

  const { id } = await context.params;
  const row = guarded.db.select().from(jobs).where(eq(jobs.id, id)).get();

  if (!row || row.kind !== "scrape") {
    return NextResponse.json({ error: "Job not found", code: "not_found" }, { status: 404 });
  }

  if (row.status !== "otp_required") {
    return NextResponse.json(
      { error: "Job is not waiting for OTP", code: "invalid_state" },
      { status: 409 },
    );
  }

  const body = SyncJobOtpRequestSchema.parse(await request.json());
  const updatedAt = new Date().toISOString();

  guarded.db
    .update(jobs)
    .set({
      otpResponse: body.otp,
      status: "running",
      updatedAt,
    })
    .where(eq(jobs.id, id))
    .run();

  const updated = guarded.db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!updated) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const response = SyncJobResponseSchema.parse({ job: rowToJob(updated) });
  return NextResponse.json(response);
}
