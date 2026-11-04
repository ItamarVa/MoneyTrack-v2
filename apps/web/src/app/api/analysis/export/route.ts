import { AnalysisFilterSchema } from "@moneytrack/contracts";
import { selectAnalysisTransactions } from "@moneytrack/engine";
import { categories } from "@moneytrack/db";
import { escapeCsvCell } from "@/server/csv-export";
import { guardApi } from "@/server/guard-api";
import { zodErrorResponse } from "@/server/api-response";
import { ZodError } from "zod";

export const runtime = "nodejs";

function parseFilterFromUrl(url: URL) {
  const raw = Object.fromEntries(url.searchParams);
  return AnalysisFilterSchema.parse({
    ...raw,
    categoryIds: raw.categoryIds?.split(",").filter(Boolean),
    tagIds: raw.tagIds?.split(",").filter(Boolean),
    personIds: raw.personIds?.split(",").filter(Boolean),
    cardIds: raw.cardIds?.split(",").filter(Boolean),
    merchantIds: raw.merchantIds?.split(",").filter(Boolean),
    amountMin: raw.amountMin !== undefined ? Number(raw.amountMin) : undefined,
    amountMax: raw.amountMax !== undefined ? Number(raw.amountMax) : undefined,
    recurringOnly: raw.recurringOnly === "true" ? true : undefined,
    fixedOnly: raw.fixedOnly === "true" ? true : undefined,
  });
}

export async function GET(request: Request): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  try {
    const filter = parseFilterFromUrl(new URL(request.url));
    const categoryNames = new Map(
      ctx.db
        .select()
        .from(categories)
        .all()
        .map((row) => [row.id, row.name] as const),
    );
    const rows = selectAnalysisTransactions(ctx.db, filter);
    const header = ["date", "charge_date", "description", "category", "amount_ils", "currency"];
    const lines = [
      header.join(","),
      ...rows.map((row) =>
        [
          row.transactionDate,
          row.chargeDate,
          escapeCsvCell(row.descriptionRaw),
          escapeCsvCell(
            row.categoryId ? (categoryNames.get(row.categoryId) ?? "") : "ללא קטגוריה",
          ),
          String(row.amountIls),
          row.originalCurrency,
        ].join(","),
      ),
    ];

    return new Response(`\uFEFF${lines.join("\n")}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="moneytrack-export.csv"',
      },
    });
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}
