import { MerchantListQuerySchema, MerchantListResponseSchema } from "@moneytrack/contracts";
import { and, eq, like, merchants, transactions } from "@moneytrack/db";
import { guardApi } from "@/server/guard-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type MerchantRow = { id: string; name: string };

function mapMerchantRow(row: { id: string; canonicalName: string }): MerchantRow {
  return { id: row.id, name: row.canonicalName };
}

export async function GET(request: Request): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const parsed = MerchantListQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    incomeOnly: url.searchParams.get("incomeOnly") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    includeId: url.searchParams.get("includeId") ?? undefined,
  });

  if (!parsed.success && url.searchParams.size > 0) {
    return NextResponse.json({ error: "Invalid merchant query" }, { status: 400 });
  }

  const query = parsed.success ? parsed.data : {};
  const hasFilters = Boolean(query.q || query.incomeOnly === "1" || query.includeId);

  if (!hasFilters) {
    const rows = ctx.db.select().from(merchants).all();
    const body = MerchantListResponseSchema.parse({
      merchants: rows.map(mapMerchantRow),
    });
    return NextResponse.json(body);
  }

  const limit = query.limit ?? 25;
  const conditions = [eq(transactions.kind, "income"), eq(transactions.excludedFromTotals, false)];
  if (query.q) {
    conditions.push(like(merchants.canonicalName, `%${query.q}%`));
  }

  const rows: MerchantRow[] =
    query.incomeOnly === "1"
      ? ctx.db
          .selectDistinct({ id: merchants.id, canonicalName: merchants.canonicalName })
          .from(merchants)
          .innerJoin(transactions, eq(transactions.merchantId, merchants.id))
          .where(and(...conditions))
          .orderBy(merchants.canonicalName)
          .limit(limit)
          .all()
          .map(mapMerchantRow)
      : query.q
        ? ctx.db
            .select({ id: merchants.id, canonicalName: merchants.canonicalName })
            .from(merchants)
            .where(like(merchants.canonicalName, `%${query.q}%`))
            .orderBy(merchants.canonicalName)
            .limit(limit)
            .all()
            .map(mapMerchantRow)
        : [];

  if (query.includeId && !rows.some((row) => row.id === query.includeId)) {
    const pinned = ctx.db
      .select({ id: merchants.id, canonicalName: merchants.canonicalName })
      .from(merchants)
      .where(eq(merchants.id, query.includeId))
      .get();
    if (pinned) {
      rows.unshift(mapMerchantRow(pinned));
    }
  }

  const body = MerchantListResponseSchema.parse({ merchants: rows });
  return NextResponse.json(body);
}
