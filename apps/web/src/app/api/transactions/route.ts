import {

  TransactionCreateRequestSchema,

  TransactionListQuerySchema,

} from "@moneytrack/contracts";

import {
  accounts,
  and,
  asc,
  cards,
  categories,
  desc,
  eq,
  gte,
  inArray,
  like,
  lte,
  or,
  sql,
  transactionTags,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";

import { classifyTransaction } from "@moneytrack/classify";

import {
  categoryIdsMatchCondition,
  loadSalarySources,
  matchSalarySourceId,
  selectAnalysisTransactions,
  sourceMatchCondition,
} from "@moneytrack/engine";

import { randomUUID } from "node:crypto";

import { assertValidOrigin } from "@/server/csrf";

import { guardApi } from "@/server/guard-api";

import {

  buildManualIdentityHash,

  defaultKind,

  normalizeDescription,

} from "@/server/manual";

import { mapTransaction } from "@/server/mappers";

import { writeAudit } from "@/server/auth";

import { apiError, notFound, zodErrorResponse } from "@/server/api-response";

import { refreshRollupsForTransactions } from "@/server/rollup-refresh";

import { NextResponse } from "next/server";

import { ZodError } from "zod";



export const runtime = "nodejs";



function nowIso(): string {

  return new Date().toISOString();

}



// ponytail: no index on signed amount; 708 rows scan fine — upgrade path is a generated column + index.
const signedAmountKey = sql<number>`CASE WHEN ${transactions.direction} = 'credit' THEN ${transactions.amountIls} ELSE -${transactions.amountIls} END`;
const categorySortKey = sql<string>`COALESCE((SELECT name FROM categories WHERE id = ${transactions.categoryId}), '')`;

type ListQuery = ReturnType<typeof TransactionListQuerySchema.parse>;
type TxRow = typeof transactions.$inferSelect;

function categoryNameLookup(db: MoneyTrackDb): Map<string, string> {
  return new Map(
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .all()
      .map((row) => [row.id, row.name]),
  );
}

function buildCategoryExpander(db: MoneyTrackDb): (ids: string[]) => string[] {
  const allCategories = db.select().from(categories).all();
  const childrenByParent = new Map<string, string[]>();
  for (const category of allCategories) {
    if (!category.parentId) {
      continue;
    }
    const siblings = childrenByParent.get(category.parentId) ?? [];
    siblings.push(category.id);
    childrenByParent.set(category.parentId, siblings);
  }

  const expandedById = new Map<string, Set<string>>();

  function expandOne(id: string): Set<string> {
    const cached = expandedById.get(id);
    if (cached) {
      return cached;
    }

    const result = new Set<string>([id]);
    for (const childId of childrenByParent.get(id) ?? []) {
      for (const descendantId of expandOne(childId)) {
        result.add(descendantId);
      }
    }
    expandedById.set(id, result);
    return result;
  }

  return (ids: string[]) => {
    const combined = new Set<string>();
    for (const id of ids) {
      for (const descendantId of expandOne(id)) {
        combined.add(descendantId);
      }
    }
    return [...combined];
  };
}

function tagIdsByTransactionId(db: MoneyTrackDb, transactionIds: string[]): Map<string, string[]> {
  if (transactionIds.length === 0) {
    return new Map();
  }
  const rows = db
    .select({ transactionId: transactionTags.transactionId, tagId: transactionTags.tagId })
    .from(transactionTags)
    .where(inArray(transactionTags.transactionId, transactionIds))
    .all();
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const existing = map.get(row.transactionId);
    if (existing) {
      existing.push(row.tagId);
    } else {
      map.set(row.transactionId, [row.tagId]);
    }
  }
  return map;
}

function sortKeyValue(
  row: TxRow,
  query: ListQuery,
  categoryNames: Map<string, string>,
): string | number {
  if (query.sortBy === "amount") {
    return row.direction === "credit" ? row.amountIls : -row.amountIls;
  }
  if (query.sortBy === "description") {
    return row.descriptionNormalized;
  }
  if (query.sortBy === "category") {
    return row.categoryId ? (categoryNames.get(row.categoryId) ?? "") : "";
  }
  if (query.sortBy === "kind") {
    return row.kind;
  }
  return query.dateBasis === "charge" ? row.chargeDate : row.transactionDate;
}

function encodeCursor(sortKey: string | number, id: string): string {
  return Buffer.from(`${sortKey}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { sortKey: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const pipeIndex = decoded.lastIndexOf("|");
    if (pipeIndex <= 0) {
      return null;
    }
    return { sortKey: decoded.slice(0, pipeIndex), id: decoded.slice(pipeIndex + 1) };
  } catch {
    return null;
  }
}

function stringCursorPredicate(
  sortExpr:
    | typeof transactions.descriptionNormalized
    | typeof transactions.kind
    | typeof categorySortKey
    | typeof transactions.transactionDate
    | typeof transactions.chargeDate,
  cursorKey: string,
  cursorId: string,
  descending: boolean,
) {
  if (descending) {
    return or(
      sql`${sortExpr} < ${cursorKey}`,
      and(sql`${sortExpr} = ${cursorKey}`, sql`${transactions.id} < ${cursorId}`),
    );
  }
  return or(
    sql`${sortExpr} > ${cursorKey}`,
    and(sql`${sortExpr} = ${cursorKey}`, sql`${transactions.id} > ${cursorId}`),
  );
}

function cursorPredicate(
  query: ListQuery,
  dateColumn: typeof transactions.transactionDate | typeof transactions.chargeDate,
) {
  if (!query.cursor) {
    return undefined;
  }

  const parsed = decodeCursor(query.cursor);
  if (!parsed) {
    return undefined;
  }

  const { sortKey: rawKey, id: cursorId } = parsed;
  const descending = query.sortDir === "desc";

  if (query.sortBy === "amount") {
    const cursorKey = Number(rawKey);
    if (Number.isNaN(cursorKey)) {
      return undefined;
    }
    if (descending) {
      return sql`(
        ${signedAmountKey} < ${cursorKey}
        OR (${signedAmountKey} = ${cursorKey} AND ${transactions.id} < ${cursorId})
      )`;
    }
    return sql`(
      ${signedAmountKey} > ${cursorKey}
      OR (${signedAmountKey} = ${cursorKey} AND ${transactions.id} > ${cursorId})
    )`;
  }

  if (query.sortBy === "description") {
    return stringCursorPredicate(transactions.descriptionNormalized, rawKey, cursorId, descending);
  }
  if (query.sortBy === "category") {
    return stringCursorPredicate(categorySortKey, rawKey, cursorId, descending);
  }
  if (query.sortBy === "kind") {
    return stringCursorPredicate(transactions.kind, rawKey, cursorId, descending);
  }

  return stringCursorPredicate(dateColumn, rawKey, cursorId, descending);
}

function listTransactions(db: MoneyTrackDb, query: ListQuery) {
  const dateColumn =
    query.dateBasis === "charge" ? transactions.chargeDate : transactions.transactionDate;
  const conditions: Parameters<typeof and>[0][] = [];
  const expandCategoryIds = buildCategoryExpander(db);

  if (query.dateFrom) {
    conditions.push(gte(dateColumn, query.dateFrom));
  }
  if (query.dateTo) {
    conditions.push(lte(dateColumn, query.dateTo));
  }
  if (query.amountMin !== undefined) {
    conditions.push(gte(transactions.amountIls, query.amountMin));
  }
  if (query.amountMax !== undefined) {
    conditions.push(lte(transactions.amountIls, query.amountMax));
  }
  if (query.freeText) {
    const pattern = `%${query.freeText}%`;
    conditions.push(
      or(
        like(transactions.descriptionRaw, pattern),
        like(transactions.descriptionNormalized, pattern),
        like(transactions.userNote, pattern),
      ),
    );
  }
  if (query.categoryIds?.length) {
    conditions.push(categoryIdsMatchCondition(expandCategoryIds(query.categoryIds)));
  }
  if (query.merchantIds?.length) {
    conditions.push(inArray(transactions.merchantId, query.merchantIds));
  }
  const sourceCondition = sourceMatchCondition(query.accountIds, query.cardIds);
  if (sourceCondition) {
    conditions.push(sourceCondition);
  }
  if (!query.accountIds?.length) {
    // Mirrors selectAnalysisTransactions: business accounts stay out of the
    // default list and only appear when named explicitly (MEM-DATA).
    conditions.push(
      inArray(
        transactions.accountId,
        db.select({ id: accounts.id }).from(accounts).where(eq(accounts.scope, "household")),
      ),
    );
  }
  if (query.tagIds?.length) {
    conditions.push(
      inArray(
        transactions.id,
        db
          .select({ transactionId: transactionTags.transactionId })
          .from(transactionTags)
          .where(inArray(transactionTags.tagId, query.tagIds)),
      ),
    );
  }
  if (query.personIds?.length) {
    conditions.push(
      sql`COALESCE(
        (SELECT ${cards.cardholderPersonId} FROM ${cards} WHERE ${cards.id} = ${transactions.cardId}),
        (SELECT ${accounts.ownerPersonId} FROM ${accounts} WHERE ${accounts.id} = ${transactions.accountId})
      ) IN (${sql.join(query.personIds.map((id) => sql`${id}`), sql`, `)})`,
    );
  }
  if (query.kinds?.length) {
    conditions.push(inArray(transactions.kind, query.kinds));
  }
  if (query.salaryScope) {
    // ponytail: JS matching over the period's income rows keeps one matcher for
    // ring and list. Ceiling is a month of income rows; move to SQL if that grows.
    const sources = loadSalarySources(db, query.personIds);
    const ids = selectAnalysisTransactions(db, { ...query, dateBasis: query.dateBasis ?? "charge" })
      .filter((row) => row.kind === "income")
      .filter((row) => {
        const matched = matchSalarySourceId(row, sources);
        return query.salaryScope === "other" ? matched === null : matched === query.salaryScope;
      })
      .map((row) => row.id);
    conditions.push(ids.length > 0 ? inArray(transactions.id, ids) : sql`0 = 1`);
  }

  const cursorCondition = cursorPredicate(query, dateColumn);
  if (cursorCondition) {
    conditions.push(cursorCondition);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const idOrder = query.sortDir === "desc" ? desc(transactions.id) : asc(transactions.id);
  const primaryDir = query.sortDir === "desc" ? desc : asc;

  let orderByClause;
  switch (query.sortBy) {
    case "amount":
      orderByClause = [primaryDir(signedAmountKey), idOrder];
      break;
    case "description":
      orderByClause = [primaryDir(transactions.descriptionNormalized), idOrder];
      break;
    case "category":
      orderByClause = [primaryDir(categorySortKey), idOrder];
      break;
    case "kind":
      orderByClause = [primaryDir(transactions.kind), idOrder];
      break;
    default:
      orderByClause = [primaryDir(dateColumn), idOrder];
  }

  const rows = db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(...orderByClause)
    .limit(query.limit + 1)
    .all();

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const lastRow = page.at(-1);
  const categoryNames = categoryNameLookup(db);
  const tagIdsByTx = tagIdsByTransactionId(
    db,
    page.map((row) => row.id),
  );
  const nextCursor =
    hasMore && lastRow ? encodeCursor(sortKeyValue(lastRow, query, categoryNames), lastRow.id) : null;

  return {
    items: page.map((row) => mapTransaction(row, tagIdsByTx.get(row.id) ?? [])),
    nextCursor,
  };
}


export async function GET(request: Request): Promise<Response> {

  const ctx = await guardApi();

  if (ctx instanceof Response) {

    return ctx;

  }



  try {

    const raw = Object.fromEntries(new URL(request.url).searchParams);

    const query = TransactionListQuerySchema.parse({

      ...raw,

      categoryIds: raw.categoryIds?.split(",").filter(Boolean),

      tagIds: raw.tagIds?.split(",").filter(Boolean),

      personIds: raw.personIds?.split(",").filter(Boolean),

      cardIds: raw.cardIds?.split(",").filter(Boolean),

      accountIds: raw.accountIds?.split(",").filter(Boolean),

      merchantIds: raw.merchantIds?.split(",").filter(Boolean),
      kinds: raw.kinds?.split(",").filter(Boolean),
    });

    return NextResponse.json(listTransactions(ctx.db, query));

  } catch (error) {

    if (error instanceof ZodError) {

      return zodErrorResponse(error);

    }

    throw error;

  }

}



export async function POST(request: Request): Promise<Response> {

  try {

    assertValidOrigin(request);

  } catch (response) {

    return response as Response;

  }



  const ctx = await guardApi();

  if (ctx instanceof Response) {

    return ctx;

  }



  try {

    const body = TransactionCreateRequestSchema.parse(await request.json());

    const account = ctx.db

      .select()

      .from(accounts)

      .where(eq(accounts.id, body.accountId))

      .get();



    if (!account) {

      return notFound("Account");

    }



    const chargeDate = body.chargeDate ?? body.transactionDate;

    const descriptionRaw = body.description.trim();

    const descriptionNormalized = normalizeDescription(descriptionRaw);

    const now = nowIso();

    const id = randomUUID();



    ctx.db.insert(transactions).values({

      id,

      firstSeenRawId: null,

      accountId: body.accountId,

      cardId: null,

      identityHash: buildManualIdentityHash(),

      transactionDate: body.transactionDate,

      chargeDate,

      status: "posted",

      direction: body.direction,

      amountIls: body.amount,

      originalAmount: body.amount,

      originalCurrency: account.currency,

      fxRate: null,

      fxFeeIls: null,

      descriptionRaw,

      descriptionNormalized,

      merchantId: null,

      kind: body.kind ?? defaultKind(body.direction),

      purchaseId: null,

      installmentIndex: null,

      installmentTotal: null,

      excludedFromTotals: false,

      exclusionReason: null,

      userNote: body.userNote ?? null,

      createdAt: now,

      updatedAt: now,

    }).run();



    writeAudit(ctx.db, "transaction_create_manual", ctx.session.user.id, {

      transactionId: id,

      accountId: body.accountId,

    });



    classifyTransaction(ctx.db, id);



    refreshRollupsForTransactions(ctx.db, [id]);



    const row = ctx.db.select().from(transactions).where(eq(transactions.id, id)).get();

    if (!row) {

      return apiError(500, "Failed to create transaction", "create_failed");

    }



    return NextResponse.json({ transaction: mapTransaction(row) }, { status: 201 });

  } catch (error) {

    if (error instanceof ZodError) {

      return zodErrorResponse(error);

    }

    throw error;

  }

}


