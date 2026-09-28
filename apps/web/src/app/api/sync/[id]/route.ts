import { SyncJobResponseSchema } from "@moneytrack/contracts";
import { eq, jobs } from "@moneytrack/db";
import { rowToJob } from "@moneytrack/ingest";
import { NextResponse } from "next/server";
import { guardApi } from "@/server/guard-api";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const guarded = await guardApi();
  if (guarded instanceof Response) {
    return guarded;
  }

  const { id } = await context.params;
  const row = guarded.db.select().from(jobs).where(eq(jobs.id, id)).get();

  if (!row || row.kind !== "scrape") {
    return NextResponse.json({ error: "Job not found", code: "not_found" }, { status: 404 });
  }

  const response = SyncJobResponseSchema.parse({ job: rowToJob(row) });
  return NextResponse.json(response);
}
