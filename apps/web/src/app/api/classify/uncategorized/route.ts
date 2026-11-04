import { ClassifyUncategorizedResponseSchema } from "@moneytrack/contracts";
import { NextResponse } from "next/server";
import { guardApi } from "@/server/guard-api";
import { UNCATEGORIZED_CATEGORY_ID } from "@/lib/category-ids";
import { listUncategorizedMerchants } from "@/server/provider-map-helpers";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const merchants = listUncategorizedMerchants(ctx.db, UNCATEGORIZED_CATEGORY_ID);
  const response = ClassifyUncategorizedResponseSchema.parse({ merchants });
  return NextResponse.json(response);
}
