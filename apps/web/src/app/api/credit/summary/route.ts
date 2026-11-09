import { queryCreditCardCharges } from "@moneytrack/engine";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { CreditSummaryResponse } from "@/components/credit/credit-types";
import { zodErrorResponse } from "@/server/api-response";
import { guardApi } from "@/server/guard-api";

export const runtime = "nodejs";

// The browser sends its own calendar day: server and phone can disagree around midnight,
// and "next charge" must follow what the person sees on their screen.
const QuerySchema = z.object({
  today: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export async function GET(request: Request): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const today = parsed.data.today ?? localIsoDate(new Date());
  const body = { today, cards: queryCreditCardCharges(ctx.db, today) } satisfies CreditSummaryResponse;
  return NextResponse.json(body);
}
