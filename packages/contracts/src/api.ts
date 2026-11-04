import { z } from "zod";
import {
  AccountSchema,
  AlertSchema,
  AnalysisFilterSchema,
  BreakdownDimensionSchema,
  BudgetSchema,
  CardSchema,
  CategoryInsightSchema,
  CategorySchema,
  CategorizationDecisionSchema,
  CategorizationRuleSchema,
  CategorizationSourceSchema,
  ConnectionSchema,
  CpiConventionSchema,
  DrillDownPredicateSchema,
  EarlyRepaymentScenarioSchema,
  IsoDateSchema,
  JobSchema,
  LoanKindSchema,
  LoanSchema,
  LoanScheduleRowSchema,
  LoanTrackSchema,
  NetWorthSnapshotSchema,
  PersonSchema,
  SalaryReportingSettingsSchema,
  SalarySourceSchema,
  RateTypeSchema,
  AmortizationMethodSchema,
  SessionSchema,
  TagSchema,
  TransactionKindSchema,
  TransactionSchema,
  UserSchema,
  TransactionLinkTypeSchema,
  LinkSourceSchema,
} from "./schema.js";
import { ProviderCatalogEntrySchema } from "./providers.js";

// ── Shared API primitives ───────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  });

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Single source of truth for the password rule, shared by the API and the UI. */
export const MIN_PASSWORD_LENGTH = 8;

export const LoginRequestSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(MIN_PASSWORD_LENGTH),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  user: UserSchema.pick({ id: true, username: true, personId: true, mustChangePassword: true }),
  session: SessionSchema.pick({ id: true, expiresAt: true }),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const SessionResponseSchema = z.object({
  authenticated: z.boolean(),
  user: UserSchema.pick({ id: true, username: true, personId: true, mustChangePassword: true }).nullable(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

// ── Transactions ──────────────────────────────────────────────────────────────

export const TransactionListQuerySchema = PaginationQuerySchema.merge(
  AnalysisFilterSchema.partial(),
).extend({
  sortBy: z.enum(["date", "amount", "description", "category", "kind"]).default("date"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  kinds: z.array(TransactionKindSchema).optional(),
});
export type TransactionListQuery = z.infer<typeof TransactionListQuerySchema>;

export const TransactionListResponseSchema = PaginatedResponseSchema(TransactionSchema);
export type TransactionListResponse = z.infer<typeof TransactionListResponseSchema>;

export const TransactionDetailResponseSchema = z.object({
  transaction: TransactionSchema,
  categoryId: z.string().uuid().nullable(),
  tags: z.array(z.string().uuid()),
  drillDown: DrillDownPredicateSchema.optional(),
});
export type TransactionDetailResponse = z.infer<typeof TransactionDetailResponseSchema>;

export const TransactionCreateRequestSchema = z.object({
  accountId: z.string().uuid(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  chargeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.number().positive(),
  direction: z.enum(["debit", "credit"]),
  description: z.string().min(1).max(500),
  kind: z
    .enum(["expense", "income", "transfer", "card_settlement", "refund", "loan_payment"])
    .optional(),
  userNote: z.string().max(2000).nullable().optional(),
});
export type TransactionCreateRequest = z.infer<typeof TransactionCreateRequestSchema>;

export const TransactionCreateResponseSchema = z.object({
  transaction: TransactionSchema,
});
export type TransactionCreateResponse = z.infer<typeof TransactionCreateResponseSchema>;

export const TransactionUpdateRequestSchema = z.object({
  userNote: z.string().nullable().optional(),
  excludedFromTotals: z.boolean().optional(),
  exclusionReason: z.string().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});
export type TransactionUpdateRequest = z.infer<typeof TransactionUpdateRequestSchema>;

export const TransactionLinkRequestSchema = z.object({
  toId: z.string().uuid(),
  linkType: TransactionLinkTypeSchema,
});
export type TransactionLinkRequest = z.infer<typeof TransactionLinkRequestSchema>;

export const TransactionLinkResponseSchema = z.object({
  linkId: z.string().uuid(),
  fromId: z.string().uuid(),
  toId: z.string().uuid(),
  linkType: TransactionLinkTypeSchema,
  source: LinkSourceSchema,
});
export type TransactionLinkResponse = z.infer<typeof TransactionLinkResponseSchema>;

// ── Accounts ──────────────────────────────────────────────────────────────────

export const AccountListResponseSchema = z.object({
  accounts: z.array(AccountSchema),
});
export type AccountListResponse = z.infer<typeof AccountListResponseSchema>;

export const AccountDetailResponseSchema = z.object({
  account: AccountSchema,
  cards: z.array(CardSchema),
});
export type AccountDetailResponse = z.infer<typeof AccountDetailResponseSchema>;

export const AccountCreateRequestSchema = z.object({
  kind: AccountSchema.shape.kind,
  institutionCode: z.string(),
  displayName: z.string().min(1),
  numberLast4: z.string().length(4).nullable().optional(),
  currency: z.string().length(3).default("ILS"),
  ownerPersonId: z.string().uuid().nullable().optional(),
  note: z.string().nullable().optional(),
});
export type AccountCreateRequest = z.infer<typeof AccountCreateRequestSchema>;

export const AccountUpdateRequestSchema = z.object({
  displayName: z.string().min(1).optional(),
  numberLast4: z.string().length(4).nullable().optional(),
  ownerPersonId: z.string().uuid().nullable().optional(),
  note: z.string().nullable().optional(),
  scope: AccountSchema.shape.scope.optional(),
});
export type AccountUpdateRequest = z.infer<typeof AccountUpdateRequestSchema>;

// ── Connections ───────────────────────────────────────────────────────────────

export const ConnectionListResponseSchema = z.object({
  connections: z.array(ConnectionSchema),
});
export type ConnectionListResponse = z.infer<typeof ConnectionListResponseSchema>;

export const ConnectionCreateRequestSchema = z.object({
  providerCode: z.string().min(1),
  enabled: z.boolean().default(true),
  scheduleCron: z.string().nullable().optional(),
});
export type ConnectionCreateRequest = z.infer<typeof ConnectionCreateRequestSchema>;

export const ConnectionUpdateRequestSchema = z.object({
  enabled: z.boolean().optional(),
  scheduleCron: z.string().nullable().optional(),
});
export type ConnectionUpdateRequest = z.infer<typeof ConnectionUpdateRequestSchema>;

export const ProviderListResponseSchema = z.object({
  providers: z.array(ProviderCatalogEntrySchema),
});
export type ProviderListResponse = z.infer<typeof ProviderListResponseSchema>;

/**
 * Login secrets for one connection. Values never touch SQLite — the route hands
 * them straight to the OS credential vault, so they must not appear in any
 * response schema.
 */
export const ConnectionCredentialsRequestSchema = z.object({
  fields: z.record(z.string().min(1).max(256)),
});
export type ConnectionCredentialsRequest = z.infer<typeof ConnectionCredentialsRequestSchema>;

export const ConnectionDeleteResponseSchema = z.object({
  ok: z.literal(true),
});
export type ConnectionDeleteResponse = z.infer<typeof ConnectionDeleteResponseSchema>;

// ── Cards ─────────────────────────────────────────────────────────────────────

export const CardListResponseSchema = z.object({
  cards: z.array(CardSchema),
});
export type CardListResponse = z.infer<typeof CardListResponseSchema>;

export const CardCreateRequestSchema = z.object({
  settlementAccountId: z.string().uuid(),
  last4: z.string().length(4),
  cardholderPersonId: z.string().uuid(),
  brand: z.string().nullable().optional(),
  displayName: z.string().min(1),
  note: z.string().nullable().optional(),
});
export type CardCreateRequest = z.infer<typeof CardCreateRequestSchema>;

export const CardUpdateRequestSchema = z.object({
  last4: z.string().length(4).optional(),
  cardholderPersonId: z.string().uuid().optional(),
  brand: z.string().nullable().optional(),
  displayName: z.string().min(1).optional(),
  note: z.string().nullable().optional(),
});
export type CardUpdateRequest = z.infer<typeof CardUpdateRequestSchema>;

// ── Sync jobs ─────────────────────────────────────────────────────────────────

export const SyncJobCreateRequestSchema = z.object({
  connectionId: z.string().uuid(),
});
export type SyncJobCreateRequest = z.infer<typeof SyncJobCreateRequestSchema>;

export const SyncJobResponseSchema = z.object({
  job: JobSchema,
});
export type SyncJobResponse = z.infer<typeof SyncJobResponseSchema>;

export const SyncJobOtpRequestSchema = z.object({
  otp: z.string().min(1),
});
export type SyncJobOtpRequest = z.infer<typeof SyncJobOtpRequestSchema>;

export const SyncJobListResponseSchema = z.object({
  jobs: z.array(JobSchema),
});
export type SyncJobListResponse = z.infer<typeof SyncJobListResponseSchema>;

// ── Categories ────────────────────────────────────────────────────────────────

export const CategoryListResponseSchema = z.object({
  categories: z.array(CategorySchema),
});
export type CategoryListResponse = z.infer<typeof CategoryListResponseSchema>;

export const CategoryCreateRequestSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  note: z.string().nullable().optional(),
});
export type CategoryCreateRequest = z.infer<typeof CategoryCreateRequestSchema>;

export const CategoryUpdateRequestSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  note: z.string().nullable().optional(),
});
export type CategoryUpdateRequest = z.infer<typeof CategoryUpdateRequestSchema>;

export const RuleListResponseSchema = z.object({
  rules: z.array(CategorizationRuleSchema),
});
export type RuleListResponse = z.infer<typeof RuleListResponseSchema>;

export const RuleCreateRequestSchema = z.object({
  pattern: z.string().min(1),
  categoryId: z.string().uuid(),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
});
export type RuleCreateRequest = z.infer<typeof RuleCreateRequestSchema>;

export const RuleUpdateRequestSchema = z.object({
  pattern: z.string().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
});
export type RuleUpdateRequest = z.infer<typeof RuleUpdateRequestSchema>;

export const TagListResponseSchema = z.object({
  tags: z.array(TagSchema),
});
export type TagListResponse = z.infer<typeof TagListResponseSchema>;

export const TagCreateRequestSchema = z.object({
  name: z.string().min(1),
  color: z.string().nullable().optional(),
});
export type TagCreateRequest = z.infer<typeof TagCreateRequestSchema>;

export const TagUpdateRequestSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().nullable().optional(),
});
export type TagUpdateRequest = z.infer<typeof TagUpdateRequestSchema>;

export const TransactionCategoryPatchRequestSchema = z.object({
  categoryId: z.string().uuid(),
});
export type TransactionCategoryPatchRequest = z.infer<
  typeof TransactionCategoryPatchRequestSchema
>;

export const TransactionSplitRequestSchema = z.object({
  splits: z.array(
    z.object({
      categoryId: z.string().uuid(),
      amount: z.number(),
      note: z.string().nullable().optional(),
    }),
  ).min(1),
});
export type TransactionSplitRequest = z.infer<typeof TransactionSplitRequestSchema>;

export const ClassificationChainStepSchema = z.object({
  stage: z.string(),
  matched: z.boolean(),
  categoryId: z.string().uuid().nullable(),
  ruleId: z.string().uuid().nullable(),
  providerCategory: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  detail: z.string(),
});

export const ClassificationDetailResponseSchema = z.object({
  transactionId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  classificationSource: CategorizationSourceSchema.nullable(),
  merchantId: z.string().uuid().nullable(),
  normalizedDescription: z.string(),
  chain: z.array(ClassificationChainStepSchema),
  decisions: z.array(CategorizationDecisionSchema),
});
export type ClassificationDetailResponse = z.infer<typeof ClassificationDetailResponseSchema>;

export const ReclassifyRequestSchema = z.object({
  filter: AnalysisFilterSchema,
  categoryId: z.string().uuid(),
  respectManual: z.boolean().default(true),
});
export type ReclassifyRequest = z.infer<typeof ReclassifyRequestSchema>;

export const ReclassifyResponseSchema = z.object({
  updated: z.number().int().nonnegative(),
  skippedManual: z.number().int().nonnegative(),
});
export type ReclassifyResponse = z.infer<typeof ReclassifyResponseSchema>;

// ── Classify (MAX provider mapping + uncategorized merchants) ─────────────────

export const UncategorizedMerchantSchema = z.object({
  merchantId: z.string().uuid(),
  merchantName: z.string(),
  transactionCount: z.number().int().nonnegative(),
  totalAmountIls: z.number(),
  providerCategories: z.array(z.string()),
});
export type UncategorizedMerchant = z.infer<typeof UncategorizedMerchantSchema>;

export const ClassifyUncategorizedResponseSchema = z.object({
  merchants: z.array(UncategorizedMerchantSchema),
});
export type ClassifyUncategorizedResponse = z.infer<typeof ClassifyUncategorizedResponseSchema>;

export const ProviderCategoryMapEntrySchema = z.object({
  providerCategory: z.string().min(1),
  categoryId: z.string().uuid().nullable(),
  transactionCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime({ offset: true }),
});
export type ProviderCategoryMapEntry = z.infer<typeof ProviderCategoryMapEntrySchema>;

export const ProviderCategoryMapListResponseSchema = z.object({
  mappings: z.array(ProviderCategoryMapEntrySchema),
});
export type ProviderCategoryMapListResponse = z.infer<typeof ProviderCategoryMapListResponseSchema>;

export const ProviderCategoryMapUpdateRequestSchema = z.object({
  mappings: z.array(
    z.object({
      providerCategory: z.string().min(1),
      categoryId: z.string().uuid().nullable(),
    }),
  ),
});
export type ProviderCategoryMapUpdateRequest = z.infer<typeof ProviderCategoryMapUpdateRequestSchema>;

export const ProviderCategoryMapUpdateResponseSchema = z.object({
  job: JobSchema,
});
export type ProviderCategoryMapUpdateResponse = z.infer<typeof ProviderCategoryMapUpdateResponseSchema>;

export const ClassifyReapplyResponseSchema = z.object({
  job: JobSchema,
});
export type ClassifyReapplyResponse = z.infer<typeof ClassifyReapplyResponseSchema>;

// ── Loans ─────────────────────────────────────────────────────────────────────

export const LoanListResponseSchema = z.object({
  loans: z.array(
    LoanSchema.extend({
      tracks: z.array(LoanTrackSchema),
      remainingPrincipal: z.number(),
    }),
  ),
});
export type LoanListResponse = z.infer<typeof LoanListResponseSchema>;

export const LoanDetailResponseSchema = z.object({
  loan: LoanSchema,
  account: AccountSchema,
  tracks: z.array(LoanTrackSchema),
  remainingPrincipal: z.number(),
});
export type LoanDetailResponse = z.infer<typeof LoanDetailResponseSchema>;

export const LoanCreateRequestSchema = z.object({
  displayName: z.string().min(1),
  lender: z.string().min(1),
  kind: LoanKindSchema,
  originationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  originalPrincipal: z.number().positive(),
  ownerPersonId: z.string().uuid().nullable().optional(),
});
export type LoanCreateRequest = z.infer<typeof LoanCreateRequestSchema>;

export const LoanUpdateRequestSchema = z.object({
  lender: z.string().min(1).optional(),
  kind: LoanKindSchema.optional(),
  originationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  originalPrincipal: z.number().positive().optional(),
  note: z.string().nullable().optional(),
});
export type LoanUpdateRequest = z.infer<typeof LoanUpdateRequestSchema>;

export const LoanTrackCreateRequestSchema = z
  .object({
    rateType: RateTypeSchema,
    margin: z.number().nullable().optional(),
    fixedRate: z.number().nullable().optional(),
    termMonths: z.number().int().positive(),
    principal: z.number().positive(),
    amortizationMethod: AmortizationMethodSchema,
    cpiBaseIndexValue: z.number().nullable().optional(),
    cpiConvention: CpiConventionSchema,
    rateResetMonths: z.number().int().positive().nullable().optional(),
  })
  .superRefine((body, ctx) => {
    const cpiLinked = body.rateType.startsWith("cpi_linked");
    if (cpiLinked && body.cpiBaseIndexValue == null) {
      ctx.addIssue({
        code: "custom",
        message: "cpi_base_index_value required for CPI-linked tracks",
        path: ["cpiBaseIndexValue"],
      });
    }
    if (
      (body.rateType === "prime_linked" || body.rateType === "cpi_linked_variable") &&
      body.margin == null
    ) {
      ctx.addIssue({
        code: "custom",
        message: "margin required for prime-linked tracks",
        path: ["margin"],
      });
    }
    if (
      (body.rateType === "fixed" || body.rateType === "cpi_linked_fixed") &&
      body.fixedRate == null
    ) {
      ctx.addIssue({
        code: "custom",
        message: "fixed_rate required for fixed tracks",
        path: ["fixedRate"],
      });
    }
  });
export type LoanTrackCreateRequest = z.infer<typeof LoanTrackCreateRequestSchema>;

export const LoanTrackResponseSchema = z.object({
  track: LoanTrackSchema,
});
export type LoanTrackResponse = z.infer<typeof LoanTrackResponseSchema>;

export const LoanScheduleResponseSchema = z.object({
  trackId: z.string().uuid(),
  assumptionSetId: z.string(),
  rows: z.array(
    LoanScheduleRowSchema.omit({ id: true, trackId: true, computedAt: true, assumptionSetId: true }).extend({
      totalPayment: z.number(),
    }),
  ),
  totalInterest: z.number(),
  totalPrincipal: z.number(),
});
export type LoanScheduleResponse = z.infer<typeof LoanScheduleResponseSchema>;

export const EarlyRepaymentScenarioCreateRequestSchema = z.object({
  name: z.string().min(1),
  extraPayment: z.number().positive(),
});
export type EarlyRepaymentScenarioCreateRequest = z.infer<
  typeof EarlyRepaymentScenarioCreateRequestSchema
>;

export const EarlyRepaymentScenarioResponseSchema = z.object({
  scenario: EarlyRepaymentScenarioSchema,
  interestSaved: z.number(),
  monthsSaved: z.number(),
  tracks: z.array(
    z.object({
      trackId: z.string().uuid(),
      baselineInterest: z.number(),
      scenarioInterest: z.number(),
      interestSaved: z.number(),
      monthsSaved: z.number(),
    }),
  ),
});
export type EarlyRepaymentScenarioResponse = z.infer<
  typeof EarlyRepaymentScenarioResponseSchema
>;

// ── Analysis ──────────────────────────────────────────────────────────────────

export const AnalysisSummaryRequestSchema = AnalysisFilterSchema;
export type AnalysisSummaryRequest = z.infer<typeof AnalysisSummaryRequestSchema>;

export const AnalysisSummaryResponseSchema = z.object({
  filter: AnalysisFilterSchema,
  totalExpensesIls: z.number(),
  totalIncomeIls: z.number(),
  netCashFlowIls: z.number(),
  transactionCount: z.number().int().nonnegative(),
  drillDown: DrillDownPredicateSchema,
});
export type AnalysisSummaryResponse = z.infer<typeof AnalysisSummaryResponseSchema>;

export const CategoryBreakdownItemSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string(),
  amountIls: z.number(),
  transactionCount: z.number().int().nonnegative(),
  drillDown: DrillDownPredicateSchema,
});
export type CategoryBreakdownItem = z.infer<typeof CategoryBreakdownItemSchema>;

export const CategoryBreakdownResponseSchema = z.object({
  filter: AnalysisFilterSchema,
  items: z.array(CategoryBreakdownItemSchema),
});
export type CategoryBreakdownResponse = z.infer<typeof CategoryBreakdownResponseSchema>;

export const BreakdownRequestSchema = AnalysisFilterSchema.extend({
  dimension: BreakdownDimensionSchema.default("category"),
  flow: z.enum(["expense", "income"]).default("expense"),
});
export type BreakdownRequest = z.infer<typeof BreakdownRequestSchema>;

export const BreakdownResponseSchema = CategoryBreakdownResponseSchema;
export type BreakdownResponse = z.infer<typeof BreakdownResponseSchema>;

export const MonthlySeriesPointSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  expensesIls: z.number(),
  incomeIls: z.number(),
  netIls: z.number(),
});
export type MonthlySeriesPoint = z.infer<typeof MonthlySeriesPointSchema>;

export const TrendSegmentSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string(),
  amountIls: z.number(),
  drillDown: DrillDownPredicateSchema,
});
export type TrendSegment = z.infer<typeof TrendSegmentSchema>;

export const TrendPointSchema = z.object({
  period: z.string(),
  segments: z.array(TrendSegmentSchema),
  drillDown: DrillDownPredicateSchema,
});
export type TrendPoint = z.infer<typeof TrendPointSchema>;

export const TrendResponseSchema = z.object({
  filter: AnalysisFilterSchema,
  points: z.array(TrendPointSchema),
});
export type TrendResponse = z.infer<typeof TrendResponseSchema>;

export const MerchantListResponseSchema = z.object({
  merchants: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
    }),
  ),
});
export type MerchantListResponse = z.infer<typeof MerchantListResponseSchema>;

export const MerchantListQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  incomeOnly: z.enum(["1", "0"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  includeId: z.string().uuid().optional(),
});
export type MerchantListQuery = z.infer<typeof MerchantListQuerySchema>;

export const CategoryDetailQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
});
export type CategoryDetailQuery = z.infer<typeof CategoryDetailQuerySchema>;

export const CategoryDetailResponseSchema = z.object({
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  totalIls: z.number(),
  transactionCount: z.number().int().nonnegative(),
  previousTotalIls: z.number(),
  pctChange: z.number(),
  insights: z.array(CategoryInsightSchema),
});
export type CategoryDetailResponse = z.infer<typeof CategoryDetailResponseSchema>;

// ── People ────────────────────────────────────────────────────────────────────

export const PeopleListResponseSchema = z.object({
  people: z.array(PersonSchema),
});
export type PeopleListResponse = z.infer<typeof PeopleListResponseSchema>;

export const PersonCreateRequestSchema = z.object({
  displayName: z.string().min(1),
  isChild: z.boolean().default(false),
});
export type PersonCreateRequest = z.infer<typeof PersonCreateRequestSchema>;

export const PersonUpdateRequestSchema = z.object({
  displayName: z.string().min(1).optional(),
  isChild: z.boolean().optional(),
});
export type PersonUpdateRequest = z.infer<typeof PersonUpdateRequestSchema>;

// ── Salary reporting settings ─────────────────────────────────────────────────

export const SalaryReportingSettingsResponseSchema = z.object({
  settings: SalaryReportingSettingsSchema,
});
export type SalaryReportingSettingsResponse = z.infer<
  typeof SalaryReportingSettingsResponseSchema
>;

export const SalaryReportingSettingsPatchRequestSchema = z.object({
  enabled: z.boolean().optional(),
  startDay: z.number().int().min(1).max(31).optional(),
  endDay: z.number().int().min(1).max(31).optional(),
});
export type SalaryReportingSettingsPatchRequest = z.infer<
  typeof SalaryReportingSettingsPatchRequestSchema
>;

export const SalaryReportingReapplyResponseSchema = z.object({
  updated: z.number().int().nonnegative(),
});
export type SalaryReportingReapplyResponse = z.infer<
  typeof SalaryReportingReapplyResponseSchema
>;

// ── Salary sources ────────────────────────────────────────────────────────────

export const SalarySourceListResponseSchema = z.object({
  salarySources: z.array(SalarySourceSchema),
});
export type SalarySourceListResponse = z.infer<typeof SalarySourceListResponseSchema>;

const salaryMatchRefinement = (value: {
  merchantId?: string | null;
  matchPattern?: string | null;
}) => Boolean(value.merchantId) || Boolean(value.matchPattern?.trim());

export const SalarySourceCreateRequestSchema = z
  .object({
    displayName: z.string().min(1),
    personId: z.string().uuid().nullable().optional(),
    merchantId: z.string().uuid().nullable().optional(),
    accountId: z.string().uuid().nullable().optional(),
    matchPattern: z.string().nullable().optional(),
    sortOrder: z.number().int().default(0),
    enabled: z.boolean().default(true),
  })
  .refine(salaryMatchRefinement, {
    message: "At least one of merchantId or matchPattern is required",
  });
export type SalarySourceCreateRequest = z.infer<typeof SalarySourceCreateRequestSchema>;

export const SalarySourceUpdateRequestSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    personId: z.string().uuid().nullable().optional(),
    merchantId: z.string().uuid().nullable().optional(),
    accountId: z.string().uuid().nullable().optional(),
    matchPattern: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (value) => {
      if (value.merchantId === undefined && value.matchPattern === undefined) {
        return true;
      }
      return salaryMatchRefinement({
        merchantId: value.merchantId ?? null,
        matchPattern: value.matchPattern ?? null,
      });
    },
    { message: "At least one of merchantId or matchPattern is required" },
  );
export type SalarySourceUpdateRequest = z.infer<typeof SalarySourceUpdateRequestSchema>;

// ── Alerts ────────────────────────────────────────────────────────────────────

export const AlertListResponseSchema = z.object({
  alerts: z.array(AlertSchema),
});
export type AlertListResponse = z.infer<typeof AlertListResponseSchema>;

export const AlertPatchRequestSchema = z.object({
  status: z.enum(["acknowledged", "dismissed"]),
});
export type AlertPatchRequest = z.infer<typeof AlertPatchRequestSchema>;

export const BudgetWithVarianceSchema = BudgetSchema.extend({
  categoryName: z.string(),
  actualIls: z.number(),
  varianceIls: z.number(),
  variancePct: z.number(),
});
export type BudgetWithVariance = z.infer<typeof BudgetWithVarianceSchema>;

export const BudgetListResponseSchema = z.object({
  budgets: z.array(BudgetWithVarianceSchema),
});
export type BudgetListResponse = z.infer<typeof BudgetListResponseSchema>;

export const BudgetCreateRequestSchema = z.object({
  categoryId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.number().positive(),
});
export type BudgetCreateRequest = z.infer<typeof BudgetCreateRequestSchema>;

export const BudgetPatchRequestSchema = z.object({
  amount: z.number().positive().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});
export type BudgetPatchRequest = z.infer<typeof BudgetPatchRequestSchema>;

export const CashflowForecastPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountIls: z.number(),
  source: z.enum(["recurring", "loan"]),
  label: z.string(),
});
export type CashflowForecastPoint = z.infer<typeof CashflowForecastPointSchema>;

export const CashflowForecastResponseSchema = z.object({
  horizonDays: z.number().int().positive(),
  totalOutflowIls: z.number(),
  points: z.array(CashflowForecastPointSchema),
});
export type CashflowForecastResponse = z.infer<typeof CashflowForecastResponseSchema>;

export const NetWorthListResponseSchema = z.object({
  snapshots: z.array(NetWorthSnapshotSchema),
});
export type NetWorthListResponse = z.infer<typeof NetWorthListResponseSchema>;

export const DashboardPeriodComparisonSchema = z.object({
  totalExpensesIls: z.number(),
  totalIncomeIls: z.number(),
  netCashFlowIls: z.number(),
  netWorthIls: z.number().nullable(),
  expensesChangePct: z.number().nullable(),
  incomeChangePct: z.number().nullable(),
  netChangePct: z.number().nullable(),
  netWorthChangePct: z.number().nullable(),
});
export type DashboardPeriodComparison = z.infer<typeof DashboardPeriodComparisonSchema>;

export const DashboardRecentTransactionSchema = z.object({
  id: z.string().uuid(),
  transactionDate: IsoDateSchema,
  descriptionNormalized: z.string(),
  amountIls: z.number(),
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
});
export type DashboardRecentTransaction = z.infer<typeof DashboardRecentTransactionSchema>;

export const DashboardBudgetSummarySchema = z.object({
  id: z.string().uuid(),
  categoryName: z.string(),
  amount: z.number(),
  actualIls: z.number(),
  variancePct: z.number(),
});
export type DashboardBudgetSummary = z.infer<typeof DashboardBudgetSummarySchema>;

export const DashboardHomeResponseSchema = z.object({
  openAlerts: z.number().int().nonnegative(),
  netWorthIls: z.number().nullable(),
  totalExpensesIls: z.number(),
  totalIncomeIls: z.number(),
  netCashFlowIls: z.number(),
  savingsRate: z.number().nullable(),
  periodLabel: z.string(),
  previousPeriod: DashboardPeriodComparisonSchema,
  monthlySeries: z.array(MonthlySeriesPointSchema),
  recentTransactions: z.array(DashboardRecentTransactionSchema),
  topBudgets: z.array(DashboardBudgetSummarySchema),
});
export type DashboardHomeResponse = z.infer<typeof DashboardHomeResponseSchema>;

// ── Home Assistant add-on (identity, PIN, custody) ───────────────────────────

export const HaLockPhaseSchema = z.enum([
  "no_access",
  "vault_locked",
  "enrollment_required",
  "pin_required",
  "unlocked",
]);
export type HaLockPhase = z.infer<typeof HaLockPhaseSchema>;

export const HaStatusResponseSchema = z.object({
  mode: z.literal("ha-addon"),
  phase: HaLockPhaseSchema,
  haUserId: z.string().nullable(),
  haUsername: z.string().nullable(),
  userId: z.string().uuid().nullable(),
  pinLocked: z.boolean(),
  pinFailedCount: z.number().int().nonnegative(),
  idleRelockMinutes: z.number().int().positive(),
  recoveryKeyAcknowledged: z.boolean(),
  importAvailable: z.boolean(),
});
export type HaStatusResponse = z.infer<typeof HaStatusResponseSchema>;

/**
 * ADR-008 master passphrase rule (owner, 2026-09-28), shared by the HA API and
 * the enrollment checklist. Only ASCII letters have case, so Hebrew letters count
 * as neither lower nor upper; any non-letter, non-digit (space included) is
 * special. No trim: the passphrase is used exactly as typed. The server
 * (checkHaPassphrase) is authoritative and adds the common-password denylist.
 */
export const HA_PASSPHRASE_MIN_LENGTH = 8;
/** Bounds the Argon2id input, not a strength rule. */
export const HA_PASSPHRASE_MAX_LENGTH = 256;

export const HA_PASSPHRASE_REQUIREMENTS = ["length", "lower", "upper", "digit", "special"] as const;
export type HaPassphraseRequirement = (typeof HA_PASSPHRASE_REQUIREMENTS)[number];

const HA_PASSPHRASE_TESTS: Record<HaPassphraseRequirement, (passphrase: string) => boolean> = {
  length: (passphrase) => passphrase.length >= HA_PASSPHRASE_MIN_LENGTH,
  lower: (passphrase) => /[a-z]/.test(passphrase),
  upper: (passphrase) => /[A-Z]/.test(passphrase),
  digit: (passphrase) => /\p{Nd}/u.test(passphrase),
  special: (passphrase) => /[^\p{L}\p{Nd}]/u.test(passphrase),
};

/** Requirements the passphrase still misses, in checklist order; empty when it passes. */
export function missingHaPassphraseRequirements(passphrase: string): HaPassphraseRequirement[] {
  return HA_PASSPHRASE_REQUIREMENTS.filter((requirement) => !HA_PASSPHRASE_TESTS[requirement](passphrase));
}

export const HaEnrollRequestSchema = z.object({
  // Only the cap here: checkHaPassphrase returns a specific code for every other rule.
  passphrase: z.string().max(HA_PASSPHRASE_MAX_LENGTH),
  pin: z.string().regex(/^\d{6}$/),
  recoveryKeyAcknowledged: z.boolean(),
});
export type HaEnrollRequest = z.infer<typeof HaEnrollRequestSchema>;

export const HaEnrollResponseSchema = z.object({
  ok: z.literal(true),
  recoveryKey: z.string().min(16),
  userId: z.string().uuid(),
});
export type HaEnrollResponse = z.infer<typeof HaEnrollResponseSchema>;

export const HaUnlockRequestSchema = z.object({
  passphrase: z.string().min(MIN_PASSWORD_LENGTH),
});
export type HaUnlockRequest = z.infer<typeof HaUnlockRequestSchema>;

export const HaUnlockResponseSchema = z.object({
  ok: z.literal(true),
});
export type HaUnlockResponse = z.infer<typeof HaUnlockResponseSchema>;

export const HaPinVerifyRequestSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
});
export type HaPinVerifyRequest = z.infer<typeof HaPinVerifyRequestSchema>;

export const HaPinVerifyResponseSchema = z.object({
  ok: z.literal(true),
  sessionExpiresAt: z.string().datetime({ offset: true }),
});
export type HaPinVerifyResponse = z.infer<typeof HaPinVerifyResponseSchema>;

export const HaPinUpdateRequestSchema = z.object({
  passphrase: z.string().min(MIN_PASSWORD_LENGTH),
  newPin: z.string().regex(/^\d{6}$/),
});
export type HaPinUpdateRequest = z.infer<typeof HaPinUpdateRequestSchema>;

export const HaRecoveryUnlockRequestSchema = z.object({
  recoveryKey: z.string().min(16),
  newPassphrase: z.string().max(HA_PASSPHRASE_MAX_LENGTH),
  newPin: z.string().regex(/^\d{6}$/),
});
export type HaRecoveryUnlockRequest = z.infer<typeof HaRecoveryUnlockRequestSchema>;

export const HaRecoveryUnlockResponseSchema = z.object({
  ok: z.literal(true),
});
export type HaRecoveryUnlockResponse = z.infer<typeof HaRecoveryUnlockResponseSchema>;

export const HouseholdUserSummarySchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  haUserId: z.string().nullable(),
  enrolled: z.boolean(),
  pinLocked: z.boolean(),
});
export type HouseholdUserSummary = z.infer<typeof HouseholdUserSummarySchema>;

export const HouseholdUsersListResponseSchema = z.object({
  users: z.array(HouseholdUserSummarySchema),
  currentUserId: z.string().uuid(),
});
export type HouseholdUsersListResponse = z.infer<typeof HouseholdUsersListResponseSchema>;

export const UserCredentialResetRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type UserCredentialResetRequest = z.infer<typeof UserCredentialResetRequestSchema>;

export const UserCredentialResetResponseSchema = z.object({
  ok: z.literal(true),
});
export type UserCredentialResetResponse = z.infer<typeof UserCredentialResetResponseSchema>;

export const DataImportRequestSchema = z.object({
  exportPassphrase: z.string().min(1),
});
export type DataImportRequest = z.infer<typeof DataImportRequestSchema>;

export const DataImportResponseSchema = z.object({
  ok: z.literal(true),
  importedAt: z.string().datetime({ offset: true }),
});
export type DataImportResponse = z.infer<typeof DataImportResponseSchema>;

export const SystemCheckItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["pass", "warn", "fail", "skipped"]),
  detail: z.string().optional(),
});
export type SystemCheckItem = z.infer<typeof SystemCheckItemSchema>;

export const SystemCheckResponseSchema = z.object({
  ranAt: z.string().datetime({ offset: true }),
  items: z.array(SystemCheckItemSchema),
});
export type SystemCheckResponse = z.infer<typeof SystemCheckResponseSchema>;

// ── Route registry (internal REST contract) ───────────────────────────────────

export const API_ROUTES = {
  auth: {
    login: { method: "POST" as const, path: "/api/auth/login", body: LoginRequestSchema, response: LoginResponseSchema },
    logout: { method: "POST" as const, path: "/api/auth/logout", response: z.object({ ok: z.literal(true) }) },
    session: { method: "GET" as const, path: "/api/auth/session", response: SessionResponseSchema },
    changePassword: { method: "POST" as const, path: "/api/auth/password", body: ChangePasswordRequestSchema, response: z.object({ ok: z.literal(true) }) },
  },
  transactions: {
    list: { method: "GET" as const, path: "/api/transactions", query: TransactionListQuerySchema, response: TransactionListResponseSchema },
    create: { method: "POST" as const, path: "/api/transactions", body: TransactionCreateRequestSchema, response: TransactionCreateResponseSchema },
    detail: { method: "GET" as const, path: "/api/transactions/:id", response: TransactionDetailResponseSchema },
    update: { method: "PATCH" as const, path: "/api/transactions/:id", body: TransactionUpdateRequestSchema, response: TransactionDetailResponseSchema },
    link: { method: "POST" as const, path: "/api/transactions/:id/link", body: TransactionLinkRequestSchema, response: TransactionLinkResponseSchema },
    delete: { method: "DELETE" as const, path: "/api/transactions/:id", response: z.object({ ok: z.literal(true) }) },
    setCategory: {
      method: "PATCH" as const,
      path: "/api/transactions/:id/category",
      body: TransactionCategoryPatchRequestSchema,
      response: TransactionDetailResponseSchema,
    },
    split: {
      method: "POST" as const,
      path: "/api/transactions/:id/split",
      body: TransactionSplitRequestSchema,
      response: TransactionDetailResponseSchema,
    },
    classification: {
      method: "GET" as const,
      path: "/api/transactions/:id/classification",
      response: ClassificationDetailResponseSchema,
    },
    reclassify: {
      method: "POST" as const,
      path: "/api/transactions/reclassify",
      body: ReclassifyRequestSchema,
      response: ReclassifyResponseSchema,
    },
  },
  accounts: {
    list: { method: "GET" as const, path: "/api/accounts", response: AccountListResponseSchema },
    detail: { method: "GET" as const, path: "/api/accounts/:id", response: AccountDetailResponseSchema },
    create: { method: "POST" as const, path: "/api/accounts", body: AccountCreateRequestSchema, response: AccountDetailResponseSchema },
    update: { method: "PATCH" as const, path: "/api/accounts/:id", body: AccountUpdateRequestSchema, response: AccountDetailResponseSchema },
  },
  connections: {
    list: { method: "GET" as const, path: "/api/connections", response: ConnectionListResponseSchema },
    create: { method: "POST" as const, path: "/api/connections", body: ConnectionCreateRequestSchema, response: ConnectionSchema },
    update: { method: "PATCH" as const, path: "/api/connections/:id", body: ConnectionUpdateRequestSchema, response: ConnectionSchema },
    delete: { method: "DELETE" as const, path: "/api/connections/:id", response: ConnectionDeleteResponseSchema },
    credentials: { method: "PUT" as const, path: "/api/connections/:id/credentials", body: ConnectionCredentialsRequestSchema, response: z.object({ ok: z.literal(true) }) },
  },
  cards: {
    list: { method: "GET" as const, path: "/api/cards", response: CardListResponseSchema },
    create: { method: "POST" as const, path: "/api/cards", body: CardCreateRequestSchema, response: CardSchema },
    update: { method: "PATCH" as const, path: "/api/cards/:id", body: CardUpdateRequestSchema, response: CardSchema },
    delete: { method: "DELETE" as const, path: "/api/cards/:id", response: z.object({ ok: z.literal(true) }) },
  },
  providers: {
    list: { method: "GET" as const, path: "/api/providers", response: ProviderListResponseSchema },
  },
  sync: {
    create: { method: "POST" as const, path: "/api/sync", body: SyncJobCreateRequestSchema, response: SyncJobResponseSchema },
    list: { method: "GET" as const, path: "/api/sync", response: SyncJobListResponseSchema },
    otp: { method: "POST" as const, path: "/api/sync/:id/otp", body: SyncJobOtpRequestSchema, response: SyncJobResponseSchema },
  },
  categories: {
    list: { method: "GET" as const, path: "/api/categories", response: CategoryListResponseSchema },
    create: { method: "POST" as const, path: "/api/categories", body: CategoryCreateRequestSchema, response: CategorySchema },
    update: { method: "PATCH" as const, path: "/api/categories/:id", body: CategoryUpdateRequestSchema, response: CategorySchema },
    delete: { method: "DELETE" as const, path: "/api/categories/:id", response: z.object({ ok: z.literal(true) }) },
  },
  rules: {
    list: { method: "GET" as const, path: "/api/rules", response: RuleListResponseSchema },
    create: { method: "POST" as const, path: "/api/rules", body: RuleCreateRequestSchema, response: CategorizationRuleSchema },
    update: { method: "PATCH" as const, path: "/api/rules/:id", body: RuleUpdateRequestSchema, response: CategorizationRuleSchema },
    delete: { method: "DELETE" as const, path: "/api/rules/:id", response: z.object({ ok: z.literal(true) }) },
  },
  tags: {
    list: { method: "GET" as const, path: "/api/tags", response: TagListResponseSchema },
    create: { method: "POST" as const, path: "/api/tags", body: TagCreateRequestSchema, response: TagSchema },
    update: { method: "PATCH" as const, path: "/api/tags/:id", body: TagUpdateRequestSchema, response: TagSchema },
    delete: { method: "DELETE" as const, path: "/api/tags/:id", response: z.object({ ok: z.literal(true) }) },
  },
  classify: {
    uncategorized: {
      method: "GET" as const,
      path: "/api/classify/uncategorized",
      response: ClassifyUncategorizedResponseSchema,
    },
    providerMap: {
      list: {
        method: "GET" as const,
        path: "/api/classify/provider-map",
        response: ProviderCategoryMapListResponseSchema,
      },
      update: {
        method: "PUT" as const,
        path: "/api/classify/provider-map",
        body: ProviderCategoryMapUpdateRequestSchema,
        response: ProviderCategoryMapUpdateResponseSchema,
      },
    },
    reapply: {
      method: "POST" as const,
      path: "/api/classify/reapply",
      response: ClassifyReapplyResponseSchema,
    },
  },
  analysis: {
    summary: { method: "POST" as const, path: "/api/analysis/summary", body: AnalysisSummaryRequestSchema, response: AnalysisSummaryResponseSchema },
    categories: { method: "POST" as const, path: "/api/analysis/categories", body: AnalysisFilterSchema, response: CategoryBreakdownResponseSchema },
    categoryDetail: {
      method: "GET" as const,
      path: "/api/analysis/categories/:categoryId",
      query: CategoryDetailQuerySchema,
      response: CategoryDetailResponseSchema,
    },
    breakdown: { method: "POST" as const, path: "/api/analysis/breakdown", body: BreakdownRequestSchema, response: BreakdownResponseSchema },
    trend: { method: "POST" as const, path: "/api/analysis/trend", body: AnalysisFilterSchema, response: TrendResponseSchema },
    export: { method: "GET" as const, path: "/api/analysis/export", query: AnalysisFilterSchema, response: z.string() },
  },
  merchants: {
    list: { method: "GET" as const, path: "/api/merchants", response: MerchantListResponseSchema },
  },
  people: {
    list: { method: "GET" as const, path: "/api/people", response: PeopleListResponseSchema },
    create: { method: "POST" as const, path: "/api/people", body: PersonCreateRequestSchema, response: PersonSchema },
    update: { method: "PATCH" as const, path: "/api/people/:id", body: PersonUpdateRequestSchema, response: PersonSchema },
    delete: { method: "DELETE" as const, path: "/api/people/:id", response: z.object({ ok: z.literal(true) }) },
  },
  settings: {
    salaryReporting: {
      get: {
        method: "GET" as const,
        path: "/api/settings/salary-reporting",
        response: SalaryReportingSettingsResponseSchema,
      },
      patch: {
        method: "PATCH" as const,
        path: "/api/settings/salary-reporting",
        body: SalaryReportingSettingsPatchRequestSchema,
        response: SalaryReportingSettingsResponseSchema,
      },
      reapply: {
        method: "POST" as const,
        path: "/api/settings/salary-reporting/reapply",
        response: SalaryReportingReapplyResponseSchema,
      },
    },
  },
  salarySources: {
    list: {
      method: "GET" as const,
      path: "/api/salary-sources",
      response: SalarySourceListResponseSchema,
    },
    create: {
      method: "POST" as const,
      path: "/api/salary-sources",
      body: SalarySourceCreateRequestSchema,
      response: SalarySourceSchema,
    },
    update: {
      method: "PATCH" as const,
      path: "/api/salary-sources/:id",
      body: SalarySourceUpdateRequestSchema,
      response: SalarySourceSchema,
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/salary-sources/:id",
      response: z.object({ ok: z.literal(true) }),
    },
  },
  alerts: {
    list: { method: "GET" as const, path: "/api/alerts", response: AlertListResponseSchema },
    patch: {
      method: "PATCH" as const,
      path: "/api/alerts/:id",
      body: AlertPatchRequestSchema,
      response: AlertSchema,
    },
  },
  budgets: {
    list: { method: "GET" as const, path: "/api/budgets", response: BudgetListResponseSchema },
    create: {
      method: "POST" as const,
      path: "/api/budgets",
      body: BudgetCreateRequestSchema,
      response: BudgetWithVarianceSchema,
    },
    patch: {
      method: "PATCH" as const,
      path: "/api/budgets/:id",
      body: BudgetPatchRequestSchema,
      response: BudgetWithVarianceSchema,
    },
  },
  forecast: {
    cashflow: {
      method: "GET" as const,
      path: "/api/forecast/cashflow",
      response: CashflowForecastResponseSchema,
    },
  },
  networth: {
    list: { method: "GET" as const, path: "/api/networth", response: NetWorthListResponseSchema },
  },
  dashboard: {
    home: { method: "GET" as const, path: "/api/dashboard/home", response: DashboardHomeResponseSchema },
  },
  loans: {
    list: { method: "GET" as const, path: "/api/loans", response: LoanListResponseSchema },
    create: {
      method: "POST" as const,
      path: "/api/loans",
      body: LoanCreateRequestSchema,
      response: LoanDetailResponseSchema,
    },
    detail: {
      method: "GET" as const,
      path: "/api/loans/:id",
      response: LoanDetailResponseSchema,
    },
    update: {
      method: "PATCH" as const,
      path: "/api/loans/:id",
      body: LoanUpdateRequestSchema,
      response: LoanDetailResponseSchema,
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/loans/:id",
      response: z.object({ ok: z.literal(true) }),
    },
    addTrack: {
      method: "POST" as const,
      path: "/api/loans/:id/tracks",
      body: LoanTrackCreateRequestSchema,
      response: LoanTrackResponseSchema,
    },
    schedule: {
      method: "GET" as const,
      path: "/api/loans/:id/tracks/:trackId/schedule",
      response: LoanScheduleResponseSchema,
    },
    earlyRepayment: {
      method: "POST" as const,
      path: "/api/loans/:id/early-repayment",
      body: EarlyRepaymentScenarioCreateRequestSchema,
      response: EarlyRepaymentScenarioResponseSchema,
    },
  },
  ha: {
    status: {
      method: "GET" as const,
      path: "/api/ha/status",
      response: HaStatusResponseSchema,
    },
    enroll: {
      method: "POST" as const,
      path: "/api/ha/enroll",
      body: HaEnrollRequestSchema,
      response: HaEnrollResponseSchema,
    },
    unlock: {
      method: "POST" as const,
      path: "/api/ha/unlock",
      body: HaUnlockRequestSchema,
      response: HaUnlockResponseSchema,
    },
    pin: {
      verify: {
        method: "POST" as const,
        path: "/api/ha/pin",
        body: HaPinVerifyRequestSchema,
        response: HaPinVerifyResponseSchema,
      },
      update: {
        method: "PATCH" as const,
        path: "/api/ha/pin",
        body: HaPinUpdateRequestSchema,
        response: z.object({ ok: z.literal(true) }),
      },
    },
    recovery: {
      method: "POST" as const,
      path: "/api/ha/recovery",
      body: HaRecoveryUnlockRequestSchema,
      response: HaRecoveryUnlockResponseSchema,
    },
  },
  users: {
    list: {
      method: "GET" as const,
      path: "/api/users",
      response: HouseholdUsersListResponseSchema,
    },
    reset: {
      method: "POST" as const,
      path: "/api/users/:id/reset",
      body: UserCredentialResetRequestSchema,
      response: UserCredentialResetResponseSchema,
    },
  },
  import: {
    run: {
      method: "POST" as const,
      path: "/api/import",
      body: DataImportRequestSchema,
      response: DataImportResponseSchema,
    },
  },
  systemCheck: {
    run: {
      method: "GET" as const,
      path: "/api/system-check",
      response: SystemCheckResponseSchema,
    },
  },
} as const;
