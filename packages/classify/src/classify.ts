import { randomUUID } from "node:crypto";
import type { CategorizationSource, AnalysisFilter } from "@moneytrack/contracts";
import { DEFAULT_DATE_BASIS } from "@moneytrack/contracts";
import {
  accounts,
  and,
  asc,
  categories,
  categorizationDecisions,
  categorizationRules,
  desc,
  eq,
  gte,
  like,
  lte,
  merchantCategoryLearned,
  or,
  providerCategoryMap,
  sql,
  transactionSplits,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { normalizeMerchant } from "./normalize.js";
import {
  LEARNED_CONFIDENCE_FLOOR,
  LEARNED_MIN_OBSERVATIONS,
  UNCATEGORIZED_CATEGORY_ID,
} from "./constants.js";
import { ensureUncategorizedCategory, resolveMerchant } from "./merchant.js";
import { resolveKindCategoryId } from "./system-categories.js";

export type ClassifyOutcome = {
  categoryId: string;
  decidedBy: CategorizationSource;
  ruleId: string | null;
  confidence: number | null;
  merchantId: string;
  normalized: string;
  skippedManual?: boolean;
};

export type ClassificationChainStep = {
  stage: string;
  matched: boolean;
  categoryId: string | null;
  ruleId: string | null;
  providerCategory: string | null;
  confidence: number | null;
  detail: string;
};

export type ClassificationDetail = {
  transactionId: string;
  categoryId: string | null;
  classificationSource: CategorizationSource | null;
  merchantId: string | null;
  normalizedDescription: string;
  chain: ClassificationChainStep[];
  decisions: Array<{
    id: string;
    decidedBy: CategorizationSource;
    categoryId: string | null;
    ruleId: string | null;
    confidence: number | null;
    previousCategoryId: string | null;
    decidedAt: string;
  }>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function hasManualDecision(db: MoneyTrackDb, transactionId: string): boolean {
  const decisions = db
    .select()
    .from(categorizationDecisions)
    .where(eq(categorizationDecisions.transactionId, transactionId))
    .all();

  return decisions.some((row) => row.decidedBy === "manual");
}

function latestDecision(db: MoneyTrackDb, transactionId: string) {
  return db
    .select()
    .from(categorizationDecisions)
    .where(eq(categorizationDecisions.transactionId, transactionId))
    .orderBy(desc(categorizationDecisions.decidedAt))
    .all()
    .at(0);
}

// 2 consistent manual edits reach 0.67, just above LEARNED_CONFIDENCE_FLOOR; the
// old n/5 needed 4 edits. Gating recomputes from the count, so rows stored with the
// old confidence need no data fix.
function learnedConfidence(observationCount: number): number {
  return Math.min(1, observationCount / 3);
}

export type EnabledRule = typeof categorizationRules.$inferSelect;

/** Enabled rules, most specific first: priority, then longer pattern, then newest. */
export function loadEnabledRules(db: MoneyTrackDb): EnabledRule[] {
  return db
    .select()
    .from(categorizationRules)
    .where(eq(categorizationRules.enabled, true))
    .orderBy(
      desc(categorizationRules.priority),
      desc(sql`length(trim(${categorizationRules.pattern}))`),
      desc(categorizationRules.createdAt),
      asc(categorizationRules.id),
    )
    .all();
}

function matchRule(
  rules: EnabledRule[],
  normalized: string,
): { categoryId: string; ruleId: string } | null {
  for (const rule of rules) {
    const pattern = rule.pattern.trim().toLowerCase();
    if (!pattern) continue;
    if (normalized.includes(pattern)) {
      return { categoryId: rule.categoryId, ruleId: rule.id };
    }
  }
  return null;
}

function matchLearned(
  db: MoneyTrackDb,
  merchantId: string,
): { categoryId: string; confidence: number } | null {
  const row = db
    .select()
    .from(merchantCategoryLearned)
    .where(eq(merchantCategoryLearned.merchantId, merchantId))
    .get();

  if (!row) return null;
  if (row.observationCount < LEARNED_MIN_OBSERVATIONS) return null;
  const confidence = learnedConfidence(row.observationCount);
  if (confidence < LEARNED_CONFIDENCE_FLOOR) return null;
  return { categoryId: row.categoryId, confidence };
}

/** System category implied by the row's kind; null when none applies or its row is missing. */
function matchKind(
  db: MoneyTrackDb,
  row: typeof transactions.$inferSelect,
): { categoryId: string } | null {
  const account = db
    .select({ kind: accounts.kind })
    .from(accounts)
    .where(eq(accounts.id, row.accountId))
    .get();
  const categoryId = resolveKindCategoryId({
    accountKind: account?.kind ?? "",
    kind: row.kind,
    exclusionReason: row.exclusionReason,
    descriptionRaw: row.descriptionRaw,
    descriptionNormalized: row.descriptionNormalized,
  });
  if (!categoryId) return null;
  const exists = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .get();
  return exists ? { categoryId } : null;
}

function matchProvider(
  db: MoneyTrackDb,
  providerCategory: string | null | undefined,
): { categoryId: string } | null {
  if (!providerCategory) return null;

  const row = db
    .select()
    .from(providerCategoryMap)
    .where(eq(providerCategoryMap.providerCategory, providerCategory))
    .get();

  if (!row || row.categoryId === null) return null;
  return { categoryId: row.categoryId };
}

export function recordDecision(
  db: MoneyTrackDb,
  transactionId: string,
  outcome: ClassifyOutcome,
  previousCategoryId: string | null,
  now = nowIso(),
): string {
  const decisionId = randomUUID();
  db.insert(categorizationDecisions)
    .values({
      id: decisionId,
      transactionId,
      decidedBy: outcome.decidedBy,
      ruleId: outcome.ruleId,
      confidence: outcome.confidence,
      previousCategoryId,
      categoryId: outcome.categoryId,
      decidedAt: now,
    })
    .run();

  db.update(transactions)
    .set({
      categoryId: outcome.categoryId,
      classificationSource: outcome.decidedBy,
      merchantId: outcome.merchantId,
      descriptionNormalized: outcome.normalized,
      updatedAt: now,
    })
    .where(eq(transactions.id, transactionId))
    .run();

  return decisionId;
}

export function classifyTransaction(
  db: MoneyTrackDb,
  transactionId: string,
  options?: { respectManual?: boolean; rules?: EnabledRule[] },
): ClassifyOutcome | null {
  const respectManual = options?.respectManual ?? true;
  const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
  if (!row) return null;

  if (respectManual && hasManualDecision(db, transactionId)) {
    return {
      categoryId: row.categoryId ?? UNCATEGORIZED_CATEGORY_ID,
      decidedBy: "manual",
      ruleId: null,
      confidence: null,
      merchantId: row.merchantId ?? "",
      normalized: row.descriptionNormalized,
      skippedManual: true,
    };
  }

  const now = nowIso();
  ensureUncategorizedCategory(db, now);
  const { merchantId, normalized } = resolveMerchant(db, row.descriptionRaw, now);

  const previousCategoryId = row.categoryId ?? latestDecision(db, transactionId)?.categoryId ?? null;

  const manualStep: ClassificationChainStep = {
    stage: "manual",
    matched: false,
    categoryId: null,
    ruleId: null,
    providerCategory: null,
    confidence: null,
    detail: "",
  };

  const ruleMatch = matchRule(options?.rules ?? loadEnabledRules(db), normalized);
  const ruleStep: ClassificationChainStep = {
    stage: "rule",
    matched: ruleMatch !== null,
    categoryId: ruleMatch?.categoryId ?? null,
    ruleId: ruleMatch?.ruleId ?? null,
    providerCategory: null,
    confidence: ruleMatch ? 1 : null,
    detail: "",
  };

  const learnedMatch = matchLearned(db, merchantId);
  const learnedStep: ClassificationChainStep = {
    stage: "learned",
    matched: learnedMatch !== null,
    categoryId: learnedMatch?.categoryId ?? null,
    ruleId: null,
    providerCategory: null,
    confidence: learnedMatch?.confidence ?? null,
    detail: "",
  };

  const kindMatch = matchKind(db, row);
  const kindStep: ClassificationChainStep = {
    stage: "kind",
    matched: kindMatch !== null,
    categoryId: kindMatch?.categoryId ?? null,
    ruleId: null,
    providerCategory: null,
    confidence: kindMatch ? 1 : null,
    detail: row.kind,
  };

  const providerMatch = matchProvider(db, row.providerCategory);
  const providerStep: ClassificationChainStep = {
    stage: "provider",
    matched: providerMatch !== null,
    categoryId: providerMatch?.categoryId ?? null,
    ruleId: null,
    providerCategory: row.providerCategory ?? null,
    confidence: providerMatch ? 1 : null,
    detail: "",
  };

  let outcome: ClassifyOutcome;
  if (ruleMatch) {
    outcome = {
      categoryId: ruleMatch.categoryId,
      decidedBy: "rule",
      ruleId: ruleMatch.ruleId,
      confidence: 1,
      merchantId,
      normalized,
    };
  } else if (learnedMatch) {
    outcome = {
      categoryId: learnedMatch.categoryId,
      decidedBy: "learned",
      ruleId: null,
      confidence: learnedMatch.confidence,
      merchantId,
      normalized,
    };
  } else if (kindMatch) {
    outcome = {
      categoryId: kindMatch.categoryId,
      decidedBy: "kind",
      ruleId: null,
      confidence: 1,
      merchantId,
      normalized,
    };
  } else if (providerMatch) {
    outcome = {
      categoryId: providerMatch.categoryId,
      decidedBy: "provider",
      ruleId: null,
      confidence: 1,
      merchantId,
      normalized,
    };
  } else {
    outcome = {
      categoryId: UNCATEGORIZED_CATEGORY_ID,
      decidedBy: "default",
      ruleId: null,
      confidence: null,
      merchantId,
      normalized,
    };
  }

  if (
    previousCategoryId === outcome.categoryId &&
    row.merchantId === merchantId &&
    row.classificationSource === outcome.decidedBy
  ) {
    db.update(transactions)
      .set({
        merchantId,
        descriptionNormalized: normalized,
        updatedAt: now,
      })
      .where(eq(transactions.id, transactionId))
      .run();
    return outcome;
  }

  recordDecision(db, transactionId, outcome, previousCategoryId, now);
  void manualStep;
  void ruleStep;
  void learnedStep;
  void kindStep;
  void providerStep;
  return outcome;
}

export function manualClassify(
  db: MoneyTrackDb,
  transactionId: string,
  categoryId: string,
): ClassifyOutcome | null {
  const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
  if (!row) return null;

  const now = nowIso();
  ensureUncategorizedCategory(db, now);
  const { merchantId, normalized } = resolveMerchant(db, row.descriptionRaw, now);
  const previousCategoryId = row.categoryId ?? latestDecision(db, transactionId)?.categoryId ?? null;

  const outcome: ClassifyOutcome = {
    categoryId,
    decidedBy: "manual",
    ruleId: null,
    confidence: 1,
    merchantId,
    normalized,
  };

  // Re-picking the category a hand-classified row already has is not a new observation.
  const repeatPick = previousCategoryId === categoryId && hasManualDecision(db, transactionId);
  recordDecision(db, transactionId, outcome, previousCategoryId, now);
  if (!repeatPick) {
    learnFromManual(db, merchantId, categoryId, now);
  }
  return outcome;
}

/**
 * Hands a hand-classified row back to the pipeline: drops its manual decisions (they are what
 * locks the row), takes back the one learned-map observation the latest pick added, then
 * re-classifies. Without the undo, a merchant learned from this very pick would re-assign it.
 */
export function clearManualDecision(
  db: MoneyTrackDb,
  transactionId: string,
): ClassifyOutcome | null {
  const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
  if (!row) return null;

  const manualDecisions = db
    .select()
    .from(categorizationDecisions)
    .where(
      and(
        eq(categorizationDecisions.transactionId, transactionId),
        eq(categorizationDecisions.decidedBy, "manual"),
      ),
    )
    .orderBy(desc(categorizationDecisions.decidedAt))
    .all();

  if (manualDecisions.length > 0) {
    const pickedCategoryId = manualDecisions[0]!.categoryId;
    db.delete(categorizationDecisions)
      .where(
        and(
          eq(categorizationDecisions.transactionId, transactionId),
          eq(categorizationDecisions.decidedBy, "manual"),
        ),
      )
      .run();

    const learned = row.merchantId
      ? db
          .select()
          .from(merchantCategoryLearned)
          .where(eq(merchantCategoryLearned.merchantId, row.merchantId))
          .get()
      : undefined;
    if (learned && learned.categoryId === pickedCategoryId) {
      if (learned.observationCount <= 1) {
        db.delete(merchantCategoryLearned)
          .where(eq(merchantCategoryLearned.merchantId, learned.merchantId))
          .run();
      } else {
        const observationCount = learned.observationCount - 1;
        db.update(merchantCategoryLearned)
          .set({ observationCount, confidence: learnedConfidence(observationCount) })
          .where(eq(merchantCategoryLearned.merchantId, learned.merchantId))
          .run();
      }
    }
  }

  return classifyTransaction(db, transactionId);
}

export function learnFromManual(
  db: MoneyTrackDb,
  merchantId: string,
  categoryId: string,
  now = nowIso(),
): void {
  const existing = db
    .select()
    .from(merchantCategoryLearned)
    .where(eq(merchantCategoryLearned.merchantId, merchantId))
    .get();

  if (existing && existing.categoryId === categoryId) {
    const observationCount = existing.observationCount + 1;
    db.update(merchantCategoryLearned)
      .set({
        observationCount,
        confidence: learnedConfidence(observationCount),
        lastSeen: now,
      })
      .where(eq(merchantCategoryLearned.merchantId, merchantId))
      .run();
    return;
  }

  // A manual pick of a different category restarts the streak at 1.
  if (existing) {
    db.update(merchantCategoryLearned)
      .set({
        categoryId,
        observationCount: 1,
        confidence: learnedConfidence(1),
        lastSeen: now,
      })
      .where(eq(merchantCategoryLearned.merchantId, merchantId))
      .run();
    return;
  }

  db.insert(merchantCategoryLearned)
    .values({
      merchantId,
      categoryId,
      observationCount: 1,
      confidence: learnedConfidence(1),
      lastSeen: now,
    })
    .run();
}

function buildFilterConditions(filter: AnalysisFilter) {
  const dateColumn =
    (filter.dateBasis ?? DEFAULT_DATE_BASIS) === "charge" ? transactions.chargeDate : transactions.transactionDate;
  const conditions: Parameters<typeof and>[0][] = [];

  if (filter.dateFrom) conditions.push(gte(dateColumn, filter.dateFrom));
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
    for (const categoryId of filter.categoryIds) {
      conditions.push(eq(transactions.categoryId, categoryId));
    }
  }
  return conditions;
}

export function bulkReclassify(
  db: MoneyTrackDb,
  filter: AnalysisFilter,
  categoryId: string,
  options?: { respectManual?: boolean },
): { updated: number; skippedManual: number } {
  const respectManual = options?.respectManual ?? true;
  ensureUncategorizedCategory(db);
  const conditions = buildFilterConditions(filter);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = db.select().from(transactions).where(where).all();

  let updated = 0;
  let skippedManual = 0;

  for (const row of rows) {
    if (respectManual && hasManualDecision(db, row.id)) {
      skippedManual += 1;
      continue;
    }

    const now = nowIso();
    const { merchantId, normalized } = resolveMerchant(db, row.descriptionRaw, now);
    const previousCategoryId = row.categoryId ?? latestDecision(db, row.id)?.categoryId ?? null;
    const outcome: ClassifyOutcome = {
      categoryId,
      decidedBy: "manual",
      ruleId: null,
      confidence: 1,
      merchantId,
      normalized,
    };
    recordDecision(db, row.id, outcome, previousCategoryId, now);
    updated += 1;
  }

  return { updated, skippedManual };
}

export function getClassificationDetail(
  db: MoneyTrackDb,
  transactionId: string,
): ClassificationDetail | null {
  const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
  if (!row) return null;

  const normalized = row.descriptionNormalized || normalizeMerchant(row.descriptionRaw);
  const decisions = db
    .select()
    .from(categorizationDecisions)
    .where(eq(categorizationDecisions.transactionId, transactionId))
    .orderBy(desc(categorizationDecisions.decidedAt))
    .all();

  const chain: ClassificationChainStep[] = [];
  const sacredManual = decisions.some((d) => d.decidedBy === "manual");

  chain.push({
    stage: "normalize",
    matched: true,
    categoryId: null,
    ruleId: null,
    providerCategory: null,
    confidence: null,
    detail: normalized,
  });

  chain.push({
    stage: "manual",
    matched: sacredManual,
    categoryId: sacredManual
      ? decisions.find((d) => d.decidedBy === "manual")?.categoryId ?? null
      : null,
    ruleId: null,
    providerCategory: null,
    confidence: sacredManual ? 1 : null,
    detail: "",
  });

  const ruleMatch = matchRule(loadEnabledRules(db), normalized);
  chain.push({
    stage: "rule",
    matched: ruleMatch !== null,
    categoryId: ruleMatch?.categoryId ?? null,
    ruleId: ruleMatch?.ruleId ?? null,
    providerCategory: null,
    confidence: ruleMatch ? 1 : null,
    detail: "",
  });

  const merchantId = row.merchantId;
  const learnedMatch = merchantId ? matchLearned(db, merchantId) : null;
  chain.push({
    stage: "learned",
    matched: learnedMatch !== null,
    categoryId: learnedMatch?.categoryId ?? null,
    ruleId: null,
    providerCategory: null,
    confidence: learnedMatch?.confidence ?? null,
    detail: "",
  });

  const kindMatch = matchKind(db, row);
  chain.push({
    stage: "kind",
    matched: kindMatch !== null,
    categoryId: kindMatch?.categoryId ?? null,
    ruleId: null,
    providerCategory: null,
    confidence: kindMatch ? 1 : null,
    detail: row.kind,
  });

  const providerMatch = matchProvider(db, row.providerCategory);
  chain.push({
    stage: "provider",
    matched: providerMatch !== null,
    categoryId: providerMatch?.categoryId ?? null,
    ruleId: null,
    providerCategory: row.providerCategory ?? null,
    confidence: providerMatch ? 1 : null,
    detail: "",
  });

  chain.push({
    stage: "default",
    matched: row.categoryId === UNCATEGORIZED_CATEGORY_ID || row.categoryId === null,
    categoryId: row.categoryId ?? UNCATEGORIZED_CATEGORY_ID,
    ruleId: null,
    providerCategory: null,
    confidence: null,
    detail: "",
  });

  return {
    transactionId,
    categoryId: row.categoryId,
    classificationSource: row.classificationSource as CategorizationSource | null,
    merchantId: row.merchantId,
    normalizedDescription: normalized,
    chain,
    decisions: decisions.map((d) => ({
      id: d.id,
      decidedBy: d.decidedBy as CategorizationSource,
      categoryId: d.categoryId,
      ruleId: d.ruleId,
      confidence: d.confidence,
      previousCategoryId: d.previousCategoryId,
      decidedAt: d.decidedAt,
    })),
  };
}

export function splitTransaction(
  db: MoneyTrackDb,
  transactionId: string,
  splits: Array<{ categoryId: string; amount: number; note?: string | null }>,
): boolean {
  const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
  if (!row) return false;

  const total = splits.reduce((sum, split) => sum + split.amount, 0);
  if (Math.abs(total - Math.abs(row.amountIls)) > 0.01) {
    return false;
  }

  const now = nowIso();
  db.delete(transactionSplits).where(eq(transactionSplits.transactionId, transactionId)).run();

  for (const split of splits) {
    db.insert(transactionSplits)
      .values({
        id: randomUUID(),
        transactionId,
        categoryId: split.categoryId,
        amount: split.amount,
        note: split.note ?? null,
      })
      .run();
  }

  const onlySplit = splits[0];
  if (splits.length === 1 && onlySplit) {
    manualClassify(db, transactionId, onlySplit.categoryId);
  }

  db.update(transactions).set({ updatedAt: now }).where(eq(transactions.id, transactionId)).run();
  return true;
}
