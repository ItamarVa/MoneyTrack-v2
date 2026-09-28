import {
  accounts,
  and,
  appSettings,
  cards,
  categories,
  eq,
  gte,
  inArray,
  like,
  lte,
  or,
  rawTransactions,
  transactionTags,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import type { AnalysisFilter, SalaryReportingSettings } from "@moneytrack/contracts";
import { SALARY_REPORTING_SETTING_KEYS } from "@moneytrack/contracts";
import { addDays, nowIso } from "./dates.js";
import { categoryIdsMatchCondition } from "./category-filter.js";
import { sourceMatchCondition } from "./source-filter.js";
import {
  DEFAULT_SALARY_REPORTING_SETTINGS,
  reportingPeriodFromChargeDate,
} from "./salary-reporting.js";
import { loadSalarySources, matchSalarySourceId } from "./salary.js";

export function loadSalaryReportingSettings(db: MoneyTrackDb): SalaryReportingSettings {
  const byKey = new Map(
    db
      .select()
      .from(appSettings)
      .all()
      .map((row) => [row.key, row.value] as const),
  );

  const enabled = byKey.get(SALARY_REPORTING_SETTING_KEYS.enabled);
  const startDay = byKey.get(SALARY_REPORTING_SETTING_KEYS.startDay);
  const endDay = byKey.get(SALARY_REPORTING_SETTING_KEYS.endDay);

  return {
    enabled:
      enabled === undefined ? DEFAULT_SALARY_REPORTING_SETTINGS.enabled : enabled === "true",
    startDay: startDay
      ? Number.parseInt(startDay, 10)
      : DEFAULT_SALARY_REPORTING_SETTINGS.startDay,
    endDay: endDay ? Number.parseInt(endDay, 10) : DEFAULT_SALARY_REPORTING_SETTINGS.endDay,
  };
}

/** Effective YYYY-MM bucket for income totals; expenses ignore this helper. */
export function effectiveIncomePeriod(
  txn: typeof transactions.$inferSelect,
  settings: SalaryReportingSettings = DEFAULT_SALARY_REPORTING_SETTINGS,
): string {
  if (txn.reportingPeriodLocked && txn.reportingPeriod) {
    return txn.reportingPeriod;
  }
  if (txn.reportingPeriod) {
    return txn.reportingPeriod;
  }
  return reportingPeriodFromChargeDate(txn.chargeDate, settings);
}

export function incomeMatchesPeriod(
  txn: typeof transactions.$inferSelect,
  period: string,
  settings: SalaryReportingSettings = DEFAULT_SALARY_REPORTING_SETTINGS,
): boolean {
  if (txn.kind !== "income") {
    return false;
  }
  if (!settings.enabled) {
    return false;
  }
  return effectiveIncomePeriod(txn, settings) === period;
}

function transactionMatchesDateFilter(
  txn: typeof transactions.$inferSelect,
  filter: AnalysisFilter,
  settings: SalaryReportingSettings,
): boolean {
  const dateColumn =
    filter.dateBasis === "charge" ? txn.chargeDate : txn.transactionDate;

  if (!filter.dateFrom && !filter.dateTo) {
    return true;
  }

  if (txn.kind === "income" && settings.enabled) {
    const periodFrom = filter.dateFrom?.slice(0, 7);
    const periodTo = filter.dateTo?.slice(0, 7) ?? periodFrom;
    const effective = effectiveIncomePeriod(txn, settings);
    if (periodFrom && effective < periodFrom) {
      return false;
    }
    if (periodTo && effective > periodTo) {
      return false;
    }
    return true;
  }

  if (filter.dateFrom && dateColumn < filter.dateFrom) {
    return false;
  }
  if (filter.dateTo && dateColumn > filter.dateTo) {
    return false;
  }
  return true;
}

/** Persist reporting_period for salary-matched income after sync; skips locked rows. */
export function applySalaryReportingPeriods(db: MoneyTrackDb, runId?: string): number {
  const settings = loadSalaryReportingSettings(db);
  const sources = loadSalarySources(db);
  let candidates = db
    .select()
    .from(transactions)
    .all()
    .filter((row) => row.kind === "income");

  if (runId) {
    const rawIds = new Set(
      db
        .select({ id: rawTransactions.id })
        .from(rawTransactions)
        .where(eq(rawTransactions.runId, runId))
        .all()
        .map((row) => row.id),
    );
    candidates = candidates.filter(
      (row) => row.firstSeenRawId !== null && rawIds.has(row.firstSeenRawId),
    );
  }

  let updated = 0;
  const timestamp = nowIso();
  for (const txn of candidates) {
    if (txn.reportingPeriodLocked) {
      continue;
    }
    if (matchSalarySourceId(txn, sources) === null) {
      continue;
    }

    const computed = reportingPeriodFromChargeDate(txn.chargeDate, settings);
    if (txn.reportingPeriod === computed) {
      continue;
    }

    db.update(transactions)
      .set({ reportingPeriod: computed, updatedAt: timestamp })
      .where(eq(transactions.id, txn.id))
      .run();
    updated += 1;
  }

  return updated;
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

export function selectAnalysisTransactions(
  db: MoneyTrackDb,
  filter: AnalysisFilter,
): (typeof transactions.$inferSelect)[] {
  const dateColumn =
    filter.dateBasis === "charge" ? transactions.chargeDate : transactions.transactionDate;
  const conditions: Parameters<typeof and>[0][] = [];
  const expandCategoryIds = buildCategoryExpander(db);
  const salarySettings = loadSalaryReportingSettings(db);

  if (filter.dateFrom) {
    const sqlDateFrom =
      salarySettings.enabled && filter.dateFrom ? addDays(filter.dateFrom, -35) : filter.dateFrom;
    conditions.push(gte(dateColumn, sqlDateFrom));
  }
  if (filter.dateTo) conditions.push(lte(dateColumn, filter.dateTo));
  if (filter.amountMin !== undefined) conditions.push(gte(transactions.amountIls, filter.amountMin));
  if (filter.amountMax !== undefined) conditions.push(lte(transactions.amountIls, filter.amountMax));
  if (filter.freeText) {
    const pattern = `%${filter.freeText}%`;
    conditions.push(
      or(
        like(transactions.descriptionRaw, pattern),
        like(transactions.descriptionNormalized, pattern),
        like(transactions.userNote, pattern),
      ),
    );
  }
  if (filter.categoryIds?.length) {
    const scopedCategoryIds = expandCategoryIds(filter.categoryIds);
    conditions.push(categoryIdsMatchCondition(scopedCategoryIds));
  }
  const sourceCondition = sourceMatchCondition(filter.accountIds, filter.cardIds);
  if (sourceCondition) {
    conditions.push(sourceCondition);
  }
  if (!filter.accountIds?.length) {
    // Household is the default view: a business account only surfaces when the
    // caller names it in accountIds or asks for its scope explicitly (MEM-DATA).
    const scope = filter.accountScope ?? "household";
    if (scope !== "all") {
      const inScope = db
        .select({ id: accounts.id, scope: accounts.scope })
        .from(accounts)
        .all()
        .filter((row) => row.scope === scope)
        .map((row) => row.id);
      if (inScope.length === 0) {
        return [];
      }
      conditions.push(inArray(transactions.accountId, inScope));
    }
  }
  if (filter.merchantIds?.length) {
    conditions.push(inArray(transactions.merchantId, filter.merchantIds));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  let rows = db.select().from(transactions).where(where).all();

  if (filter.tagIds?.length) {
    const tagged = new Set(
      db
        .select()
        .from(transactionTags)
        .where(inArray(transactionTags.tagId, filter.tagIds))
        .all()
        .map((row) => row.transactionId),
    );
    rows = rows.filter((row) => tagged.has(row.id));
  }

  if (filter.personIds?.length) {
    const cardRows = db.select().from(cards).all();
    const personByCard = new Map(cardRows.map((card) => [card.id, card.cardholderPersonId]));
    const accountOwners = new Map(
      db
        .select({ id: accounts.id, ownerPersonId: accounts.ownerPersonId })
        .from(accounts)
        .all()
        .map((account) => [account.id, account.ownerPersonId]),
    );
    rows = rows.filter((row) => {
      const cardPerson = row.cardId ? (personByCard.get(row.cardId) ?? null) : null;
      const personId = cardPerson ?? accountOwners.get(row.accountId) ?? null;
      return personId !== null && filter.personIds!.includes(personId);
    });
  }

  if (filter.salaryScope) {
    const sources = loadSalarySources(db, filter.personIds);
    rows = rows.filter((row) => {
      if (row.kind !== "income") return false;
      const matched = matchSalarySourceId(row, sources);
      return filter.salaryScope === "other" ? matched === null : matched === filter.salaryScope;
    });
  }

  if (filter.dateFrom || filter.dateTo) {
    rows = rows.filter((row) => transactionMatchesDateFilter(row, filter, salarySettings));
  }

  return rows;
}
