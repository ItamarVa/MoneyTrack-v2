import { z } from "zod";

// ── Primitives ──────────────────────────────────────────────────────────────

export const UuidSchema = z.string().uuid();
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const MonthPeriodSchema = z.string().regex(/^\d{4}-\d{2}$/);
export type MonthPeriod = z.infer<typeof MonthPeriodSchema>;
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const CurrencyCodeSchema = z.string().length(3);
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

// ── Enums ───────────────────────────────────────────────────────────────────

export const ScrapeRunStatusSchema = z.enum([
  "running",
  "success",
  "failed",
  "cancelled",
]);
export type ScrapeRunStatus = z.infer<typeof ScrapeRunStatusSchema>;

export const AccountKindSchema = z.enum([
  "bank",
  "credit_card",
  "loan",
  "savings",
  "investment",
  "cash",
]);
export type AccountKind = z.infer<typeof AccountKindSchema>;

/** A `business` account is never part of a household total; it is only visible on its own page. */
export const AccountScopeSchema = z.enum(["household", "business"]);
export type AccountScope = z.infer<typeof AccountScopeSchema>;

export const ManualInstitutionCodeSchema = z.enum(["bit", "paybox", "cash"]);
export type ManualInstitutionCode = z.infer<typeof ManualInstitutionCodeSchema>;

export const MANUAL_PROVIDER_CODE = "manual";

export const TransactionStatusSchema = z.enum(["pending", "posted"]);
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

export const TransactionDirectionSchema = z.enum(["debit", "credit"]);
export type TransactionDirection = z.infer<typeof TransactionDirectionSchema>;

export const TransactionKindSchema = z.enum([
  "expense",
  "income",
  "transfer",
  "card_settlement",
  "refund",
  "loan_payment",
]);
export type TransactionKind = z.infer<typeof TransactionKindSchema>;

export const TransactionLinkTypeSchema = z.enum([
  "internal_transfer",
  "card_settlement",
  "refund_of",
  "duplicate_of",
]);
export type TransactionLinkType = z.infer<typeof TransactionLinkTypeSchema>;

export const LinkSourceSchema = z.enum(["auto", "manual"]);
export type LinkSource = z.infer<typeof LinkSourceSchema>;

export const CategorizationSourceSchema = z.enum([
  "manual",
  "rule",
  "learned",
  "provider",
  "default",
]);
export type CategorizationSource = z.infer<typeof CategorizationSourceSchema>;

export const LoanKindSchema = z.enum([
  "personal",
  "mortgage",
  "car",
  "other",
]);
export type LoanKind = z.infer<typeof LoanKindSchema>;

export const RateTypeSchema = z.enum([
  "fixed",
  "prime_linked",
  "cpi_linked_fixed",
  "cpi_linked_variable",
]);
export type RateType = z.infer<typeof RateTypeSchema>;

export const AmortizationMethodSchema = z.enum([
  "shpitzer",
  "equal_principal",
  "balloon",
  "grace",
]);
export type AmortizationMethod = z.infer<typeof AmortizationMethodSchema>;

export const CpiConventionSchema = z.enum(["known", "for_month"]);
export type CpiConvention = z.infer<typeof CpiConventionSchema>;

export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "otp_required",
  "done",
  "failed",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobKindSchema = z.enum([
  "scrape",
  "reference_refresh",
  "rollup_recompute",
  "categorize_bulk",
]);
export type JobKind = z.infer<typeof JobKindSchema>;

export const DateBasisSchema = z.enum(["transaction", "charge"]);
export type DateBasis = z.infer<typeof DateBasisSchema>;

export const RecurringStatusSchema = z.enum([
  "active",
  "paused",
  "ended",
  "unknown",
]);
export type RecurringStatus = z.infer<typeof RecurringStatusSchema>;

export const AlertTypeSchema = z.enum([
  "anomaly",
  "duplicate",
  "price_increase",
  "budget_variance",
  "unmatched_settlement",
]);
export type AlertType = z.infer<typeof AlertTypeSchema>;

export const AlertSeveritySchema = z.enum(["info", "warning", "critical"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

// ── Raw landing (append-only) ───────────────────────────────────────────────

export const ScrapeRunSchema = z.object({
  id: UuidSchema,
  connectionId: UuidSchema,
  providerCode: z.string().min(1),
  startedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema.nullable(),
  status: ScrapeRunStatusSchema,
  errorClass: z.string().nullable(),
  errorMessageRedacted: z.string().nullable(),
  libraryVersion: z.string(),
});
export type ScrapeRun = z.infer<typeof ScrapeRunSchema>;

export const RawTransactionSchema = z.object({
  id: UuidSchema,
  runId: UuidSchema,
  providerAccountNumber: z.string(),
  payloadJson: z.record(z.unknown()),
  payloadSha256: Sha256Schema,
  ingestedAt: IsoDateTimeSchema,
});
export type RawTransaction = z.infer<typeof RawTransactionSchema>;

export const RawAccountSchema = z.object({
  id: UuidSchema,
  runId: UuidSchema,
  providerAccountNumber: z.string(),
  balance: z.number().nullable(),
  balanceDate: IsoDateSchema.nullable(),
  cardFrame: z.string().nullable(),
  cardType: z.string().nullable(),
  currency: CurrencyCodeSchema,
  savingsAccount: z.boolean().default(false),
  ingestedAt: IsoDateTimeSchema,
});
export type RawAccount = z.infer<typeof RawAccountSchema>;

// ── Identity and people ─────────────────────────────────────────────────────

export const PersonSchema = z.object({
  id: UuidSchema,
  displayName: z.string().min(1),
  isChild: z.boolean().default(false),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Person = z.infer<typeof PersonSchema>;

export const SALARY_REPORTING_SETTING_KEYS = {
  enabled: "salary_reporting_enabled",
  startDay: "salary_reporting_start_day",
  endDay: "salary_reporting_end_day",
} as const;

export const SalaryReportingSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  startDay: z.number().int().min(1).max(31).default(25),
  endDay: z.number().int().min(1).max(31).default(5),
});
export type SalaryReportingSettings = z.infer<typeof SalaryReportingSettingsSchema>;

export const AppSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  updatedAt: IsoDateTimeSchema,
});
export type AppSetting = z.infer<typeof AppSettingSchema>;

export const SalarySourceSchema = z.object({
  id: UuidSchema,
  displayName: z.string().min(1),
  personId: UuidSchema.nullable(),
  merchantId: UuidSchema.nullable(),
  accountId: UuidSchema.nullable(),
  matchPattern: z.string().nullable(),
  sortOrder: z.number().int().default(0),
  enabled: z.boolean().default(true),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type SalarySource = z.infer<typeof SalarySourceSchema>;

export const UserSchema = z.object({
  id: UuidSchema,
  personId: UuidSchema,
  username: z.string().min(3),
  passwordHash: z.string(),
  mustChangePassword: z.boolean().default(false),
  totpSecretEncrypted: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type User = z.infer<typeof UserSchema>;

export const SessionSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  tokenHash: z.string(),
  createdAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
});
export type Session = z.infer<typeof SessionSchema>;

export const LoginAttemptSchema = z.object({
  id: UuidSchema,
  username: z.string(),
  success: z.boolean(),
  ipAddress: z.string().nullable(),
  attemptedAt: IsoDateTimeSchema,
});
export type LoginAttempt = z.infer<typeof LoginAttemptSchema>;

export const AuditLogEntrySchema = z.object({
  id: UuidSchema,
  userId: UuidSchema.nullable(),
  action: z.string(),
  resourceType: z.string().nullable(),
  resourceId: UuidSchema.nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: IsoDateTimeSchema,
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

// ── Accounts, cards, connections ──────────────────────────────────────────────

export const ConnectionSchema = z.object({
  id: UuidSchema,
  providerCode: z.string().min(1),
  credentialRef: z.string().min(1),
  enabled: z.boolean().default(true),
  scheduleCron: z.string().nullable(),
  lastRunId: UuidSchema.nullable(),
  puppeteerProfileDir: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Connection = z.infer<typeof ConnectionSchema>;

export const AccountSchema = z.object({
  id: UuidSchema,
  kind: AccountKindSchema,
  connectionId: UuidSchema.nullable(),
  institutionCode: z.string(),
  displayName: z.string().min(1),
  numberLast4: z.string().length(4).nullable(),
  currency: CurrencyCodeSchema.default("ILS"),
  ownerPersonId: UuidSchema.nullable(),
  note: z.string().nullable(),
  scope: AccountScopeSchema.default("household"),
  balanceIls: z.number().nullable(),
  balanceDate: IsoDateSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Account = z.infer<typeof AccountSchema>;

export const CardSchema = z.object({
  id: UuidSchema,
  settlementAccountId: UuidSchema,
  last4: z.string().length(4),
  cardholderPersonId: UuidSchema,
  brand: z.string().nullable(),
  displayName: z.string().min(1),
  note: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Card = z.infer<typeof CardSchema>;

// ── Transactions ──────────────────────────────────────────────────────────────

export const PurchaseSchema = z.object({
  id: UuidSchema,
  originalTotalAmount: z.number(),
  purchaseDate: IsoDateSchema,
  installmentTotal: z.number().int().positive(),
  cardId: UuidSchema,
  merchantId: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Purchase = z.infer<typeof PurchaseSchema>;

export const TransactionSchema = z.object({
  id: UuidSchema,
  firstSeenRawId: UuidSchema.nullable(),
  accountId: UuidSchema,
  cardId: UuidSchema.nullable(),
  identityHash: Sha256Schema,
  transactionDate: IsoDateSchema,
  chargeDate: IsoDateSchema,
  status: TransactionStatusSchema,
  direction: TransactionDirectionSchema,
  amountIls: z.number(),
  originalAmount: z.number(),
  originalCurrency: CurrencyCodeSchema,
  fxRate: z.number().nullable(),
  fxFeeIls: z.number().nullable(),
  descriptionRaw: z.string(),
  descriptionNormalized: z.string(),
  merchantId: UuidSchema.nullable(),
  kind: TransactionKindSchema,
  purchaseId: UuidSchema.nullable(),
  installmentIndex: z.number().int().nullable(),
  installmentTotal: z.number().int().nullable(),
  excludedFromTotals: z.boolean().default(false),
  exclusionReason: z.string().nullable(),
  reportingPeriod: MonthPeriodSchema.nullable(),
  reportingPeriodLocked: z.boolean().default(false),
  userNote: z.string().nullable(),
  categoryId: UuidSchema.nullable(),
  classificationSource: CategorizationSourceSchema.nullable(),
  providerCategory: z.string().nullable(),
  tagIds: z.array(UuidSchema).default([]),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const TransactionRevisionSchema = z.object({
  id: UuidSchema,
  transactionId: UuidSchema,
  runId: UuidSchema.nullable(),
  fieldName: z.string(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  revisedAt: IsoDateTimeSchema,
});
export type TransactionRevision = z.infer<typeof TransactionRevisionSchema>;

export const TransactionLinkSchema = z.object({
  id: UuidSchema,
  fromId: UuidSchema,
  toId: UuidSchema,
  linkType: TransactionLinkTypeSchema,
  confidence: z.number().min(0).max(1),
  source: LinkSourceSchema,
  confirmedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type TransactionLink = z.infer<typeof TransactionLinkSchema>;

// ── Categorization ────────────────────────────────────────────────────────────

export const MerchantSchema = z.object({
  id: UuidSchema,
  canonicalName: z.string().min(1),
  createdAt: IsoDateTimeSchema,
});
export type Merchant = z.infer<typeof MerchantSchema>;

export const MerchantAliasSchema = z.object({
  id: UuidSchema,
  merchantId: UuidSchema,
  rawDescriptor: z.string(),
  normalizationVersion: z.number().int(),
  createdAt: IsoDateTimeSchema,
});
export type MerchantAlias = z.infer<typeof MerchantAliasSchema>;

export const CategorySchema = z.object({
  id: UuidSchema,
  parentId: UuidSchema.nullable(),
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  note: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Category = z.infer<typeof CategorySchema>;

export const TagSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1),
  color: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Tag = z.infer<typeof TagSchema>;

export const TransactionTagSchema = z.object({
  transactionId: UuidSchema,
  tagId: UuidSchema,
});
export type TransactionTag = z.infer<typeof TransactionTagSchema>;

export const TransactionSplitSchema = z.object({
  id: UuidSchema,
  transactionId: UuidSchema,
  categoryId: UuidSchema,
  amount: z.number(),
  note: z.string().nullable(),
});
export type TransactionSplit = z.infer<typeof TransactionSplitSchema>;

export const CategorizationRuleSchema = z.object({
  id: UuidSchema,
  pattern: z.string().min(1),
  categoryId: UuidSchema,
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
  createdAt: IsoDateTimeSchema,
});
export type CategorizationRule = z.infer<typeof CategorizationRuleSchema>;

export const MerchantCategoryLearnedSchema = z.object({
  merchantId: UuidSchema,
  categoryId: UuidSchema,
  observationCount: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  lastSeen: IsoDateTimeSchema,
});
export type MerchantCategoryLearned = z.infer<typeof MerchantCategoryLearnedSchema>;

export const CategorizationDecisionSchema = z.object({
  id: UuidSchema,
  transactionId: UuidSchema,
  decidedBy: CategorizationSourceSchema,
  ruleId: UuidSchema.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  previousCategoryId: UuidSchema.nullable(),
  categoryId: UuidSchema.nullable(),
  decidedAt: IsoDateTimeSchema,
});
export type CategorizationDecision = z.infer<typeof CategorizationDecisionSchema>;

export const ProviderCategoryMapSchema = z.object({
  providerCategory: z.string().min(1),
  categoryId: UuidSchema.nullable(),
  updatedAt: IsoDateTimeSchema,
});
export type ProviderCategoryMap = z.infer<typeof ProviderCategoryMapSchema>;

// ── Loans and mortgages ─────────────────────────────────────────────────────

export const LoanSchema = z.object({
  id: UuidSchema,
  accountId: UuidSchema,
  kind: LoanKindSchema,
  lender: z.string(),
  originationDate: IsoDateSchema,
  originalPrincipal: z.number().positive(),
  note: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Loan = z.infer<typeof LoanSchema>;

export const LoanTrackSchema = z.object({
  id: UuidSchema,
  loanId: UuidSchema,
  rateType: RateTypeSchema,
  margin: z.number().nullable(),
  fixedRate: z.number().nullable(),
  termMonths: z.number().int().positive(),
  principal: z.number().positive(),
  amortizationMethod: AmortizationMethodSchema,
  cpiBaseIndexValue: z.number().nullable(),
  cpiConvention: CpiConventionSchema.nullable(),
  rateResetMonths: z.number().int().nullable(),
  createdAt: IsoDateTimeSchema,
});
export type LoanTrack = z.infer<typeof LoanTrackSchema>;

export const LoanScheduleRowSchema = z.object({
  id: UuidSchema,
  trackId: UuidSchema,
  periodIndex: z.number().int().nonnegative(),
  dueDate: IsoDateSchema,
  principalPart: z.number(),
  interestPart: z.number(),
  cpiAdjustment: z.number(),
  remainingPrincipal: z.number(),
  computedAt: IsoDateTimeSchema,
  assumptionSetId: UuidSchema,
});
export type LoanScheduleRow = z.infer<typeof LoanScheduleRowSchema>;

export const EarlyRepaymentScenarioSchema = z.object({
  id: UuidSchema,
  loanId: UuidSchema,
  name: z.string(),
  extraPayment: z.number(),
  assumptionSetId: UuidSchema,
  savedAt: IsoDateTimeSchema,
});
export type EarlyRepaymentScenario = z.infer<typeof EarlyRepaymentScenarioSchema>;

// ── Investments and net worth ─────────────────────────────────────────────────

export const InstrumentSchema = z.object({
  id: UuidSchema,
  symbol: z.string(),
  name: z.string(),
  instrumentType: z.enum(["stock", "etf", "bond", "fund", "other"]),
  currency: CurrencyCodeSchema,
  createdAt: IsoDateTimeSchema,
});
export type Instrument = z.infer<typeof InstrumentSchema>;

export const HoldingSchema = z.object({
  id: UuidSchema,
  accountId: UuidSchema,
  instrumentId: UuidSchema,
  quantity: z.number(),
  costBasisIls: z.number().nullable(),
  asOf: IsoDateSchema,
});
export type Holding = z.infer<typeof HoldingSchema>;

export const PriceObservationSchema = z.object({
  id: UuidSchema,
  instrumentId: UuidSchema,
  asOf: IsoDateSchema,
  price: z.number().positive(),
  currency: CurrencyCodeSchema,
  source: z.string(),
  fetchedAt: IsoDateTimeSchema,
});
export type PriceObservation = z.infer<typeof PriceObservationSchema>;

export const ContributionSchema = z.object({
  id: UuidSchema,
  accountId: UuidSchema,
  amount: z.number(),
  contributedAt: IsoDateSchema,
  note: z.string().nullable(),
});
export type Contribution = z.infer<typeof ContributionSchema>;

export const NetWorthSnapshotSchema = z.object({
  id: UuidSchema,
  asOf: IsoDateSchema,
  totalAssetsIls: z.number(),
  totalLiabilitiesIls: z.number(),
  netWorthIls: z.number(),
  computedAt: IsoDateTimeSchema,
});
export type NetWorthSnapshot = z.infer<typeof NetWorthSnapshotSchema>;

// ── Reference data, budgets, alerts, ops ────────────────────────────────────

export const ReferenceSeriesSchema = z.object({
  id: UuidSchema,
  seriesCode: z.string(),
  displayName: z.string(),
  unit: z.string(),
  createdAt: IsoDateTimeSchema,
});
export type ReferenceSeries = z.infer<typeof ReferenceSeriesSchema>;

export const ReferenceObservationSchema = z.object({
  id: UuidSchema,
  seriesId: UuidSchema,
  asOf: IsoDateSchema,
  value: z.number(),
  sourceUrl: z.string().url(),
  fetchedAt: IsoDateTimeSchema,
  rawResponseSha256: Sha256Schema,
});
export type ReferenceObservation = z.infer<typeof ReferenceObservationSchema>;

export const BudgetSchema = z.object({
  id: UuidSchema,
  categoryId: UuidSchema,
  period: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.number().positive(),
  createdAt: IsoDateTimeSchema,
});
export type Budget = z.infer<typeof BudgetSchema>;

export const RecurringInstrumentSchema = z.object({
  id: UuidSchema,
  merchantId: UuidSchema.nullable(),
  accountId: UuidSchema,
  cadence: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  expectedAmount: z.number(),
  lastSeen: IsoDateSchema.nullable(),
  status: RecurringStatusSchema,
  priceHistory: z.array(z.object({ date: IsoDateSchema, amount: z.number() })),
  createdAt: IsoDateTimeSchema,
});
export type RecurringInstrument = z.infer<typeof RecurringInstrumentSchema>;

export const AlertSchema = z.object({
  id: UuidSchema,
  type: AlertTypeSchema,
  severity: AlertSeveritySchema,
  title: z.string(),
  message: z.string(),
  transactionId: UuidSchema.nullable(),
  status: z.enum(["open", "acknowledged", "dismissed"]),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Alert = z.infer<typeof AlertSchema>;

export const JobSchema = z.object({
  id: UuidSchema,
  kind: JobKindSchema,
  payloadJson: z.record(z.unknown()),
  status: JobStatusSchema,
  otpPrompt: z.string().nullable(),
  otpResponse: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  errorClass: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Job = z.infer<typeof JobSchema>;

export const RollupMonthlySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  dateBasis: DateBasisSchema,
  categoryId: UuidSchema.nullable(),
  cardId: UuidSchema.nullable(),
  personId: UuidSchema.nullable(),
  totalAmountIls: z.number(),
  transactionCount: z.number().int().nonnegative(),
  computedAt: IsoDateTimeSchema,
});
export type RollupMonthly = z.infer<typeof RollupMonthlySchema>;

export const EgressLogEntrySchema = z.object({
  id: UuidSchema,
  host: z.string(),
  path: z.string(),
  purpose: z.string(),
  status: z.number().int(),
  bytes: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  at: IsoDateTimeSchema,
});
export type EgressLogEntry = z.infer<typeof EgressLogEntrySchema>;

// ── Analysis filter state (URL-serializable) ──────────────────────────────────

export const AnalysisFilterSchema = z.object({
  dateFrom: IsoDateSchema.optional(),
  dateTo: IsoDateSchema.optional(),
  dateBasis: DateBasisSchema.default("transaction"),
  categoryIds: z.array(UuidSchema).optional(),
  tagIds: z.array(UuidSchema).optional(),
  personIds: z.array(UuidSchema).optional(),
  cardIds: z.array(UuidSchema).optional(),
  accountIds: z.array(UuidSchema).optional(),
  // Absent means household-only. Ignored when accountIds names accounts explicitly,
  // so a business account can still be drilled into from its own page.
  accountScope: z.union([AccountScopeSchema, z.literal("all")]).optional(),
  merchantIds: z.array(UuidSchema).optional(),
  amountMin: z.number().optional(),
  amountMax: z.number().optional(),
  freeText: z.string().optional(),
  recurringOnly: z.boolean().optional(),
  fixedOnly: z.boolean().optional(),
  // Income-only scope: a salary source id, or "other" for income no source matched.
  salaryScope: z.union([UuidSchema, z.literal("other")]).optional(),
});
export type AnalysisFilter = z.infer<typeof AnalysisFilterSchema>;

export const BreakdownDimensionSchema = z.enum([
  "category",
  "subcategory",
  "person",
  "card",
  "account",
  "merchant",
  "tag",
  "month",
  "salary",
]);
export type BreakdownDimension = z.infer<typeof BreakdownDimensionSchema>;

export const DrillDownPredicateSchema = z.object({
  filter: AnalysisFilterSchema,
  sourceView: z.string(),
  sourceSegment: z.record(z.unknown()).optional(),
});
export type DrillDownPredicate = z.infer<typeof DrillDownPredicateSchema>;

// ── Category detail insights (kind-tagged; labels built client-side) ─────────

export const CategoryInsightSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("missing_recurring"),
    merchantName: z.string(),
    expectedCount: z.number().int().nonnegative(),
    actualCount: z.number().int().nonnegative(),
    monthsObserved: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("merchant_disappeared"),
    merchantName: z.string(),
    monthsObserved: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("merchant_spike"),
    merchantName: z.string(),
    amountIls: z.number(),
    medianIls: z.number(),
    pctChange: z.number(),
  }),
  z.object({
    kind: z.literal("merchant_drop"),
    merchantName: z.string(),
    amountIls: z.number(),
    medianIls: z.number(),
    pctChange: z.number(),
  }),
  z.object({
    kind: z.literal("new_merchant"),
    merchantName: z.string(),
    amountIls: z.number(),
  }),
  z.object({
    kind: z.literal("category_vs_average"),
    averageIls: z.number(),
    amountIls: z.number(),
    pctChange: z.number(),
  }),
  z.object({
    kind: z.literal("dominant_transaction"),
    merchantName: z.string(),
    amountIls: z.number(),
    sharePct: z.number(),
  }),
]);
export type CategoryInsight = z.infer<typeof CategoryInsightSchema>;
