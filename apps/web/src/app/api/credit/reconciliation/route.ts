import { queryCardReconciliation } from "@moneytrack/engine";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { CreditReconciliationResponse } from "@/components/credit/credit-types";
import { accountLabel } from "@/lib/account-label";
import { zodErrorResponse } from "@/server/api-response";
import { guardApi } from "@/server/guard-api";

export const runtime = "nodejs";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

// `today` comes from the browser, like /api/credit/summary: "already charged" follows the phone's day.
const QuerySchema = z
  .object({
    from: z.string().regex(MONTH).optional(),
    to: z.string().regex(MONTH).optional(),
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "from must not be after to" });

function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function shiftMonth(month: string, delta: number): string {
  const [year, mm] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (mm - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export async function GET(request: Request): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const today = parsed.data.today ?? localIsoDate(new Date());
  const to = parsed.data.to ?? today.slice(0, 7);
  const from = parsed.data.from ?? shiftMonth(to, -11);
  const cards = queryCardReconciliation(ctx.db, { from, to, today }).map((card) => ({
    accountId: card.accountId,
    label: accountLabel({
      displayName: card.cardName ?? card.displayName,
      institutionCode: card.institutionCode,
      last4: card.numberLast4,
    }),
    institutionCode: card.institutionCode,
    months: card.months,
  }));
  const body = { from, to, today, cards } satisfies CreditReconciliationResponse;
  return NextResponse.json(body);
}
