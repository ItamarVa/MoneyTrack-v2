import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

// ── Raw landing ───────────────────────────────────────────────────────────────

export const scrapeRuns = sqliteTable("scrape_runs", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id").notNull(),
  providerCode: text("provider_code").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  status: text("status").notNull(),
  errorClass: text("error_class"),
  errorMessageRedacted: text("error_message_redacted"),
  libraryVersion: text("library_version").notNull(),
});

export const rawTransactions = sqliteTable(
  "raw_transactions",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull().references(() => scrapeRuns.id),
    providerAccountNumber: text("provider_account_number").notNull(),
    payloadJson: text("payload_json").notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    ingestedAt: text("ingested_at").notNull(),
  },
  (t) => [
    uniqueIndex("raw_tx_run_sha").on(t.runId, t.payloadSha256),
    index("raw_tx_run_idx").on(t.runId),
  ],
);

export const rawAccounts = sqliteTable("raw_accounts", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => scrapeRuns.id),
  providerAccountNumber: text("provider_account_number").notNull(),
  balance: real("balance"),
  balanceDate: text("balance_date"),
  cardFrame: text("card_frame"),
  cardType: text("card_type"),
  currency: text("currency").notNull(),
  savingsAccount: integer("savings_account", { mode: "boolean" }).notNull().default(false),
  ingestedAt: text("ingested_at").notNull(),
});

// ── Identity ──────────────────────────────────────────────────────────────────

export const people = sqliteTable("people", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  isChild: integer("is_child", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    personId: text("person_id").notNull().references(() => people.id),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
    totpSecretEncrypted: text("totp_secret_encrypted"),
    haUserId: text("ha_user_id"),
    pinHash: text("pin_hash"),
    pinFailedCount: integer("pin_failed_count").notNull().default(0),
    pinLockedAt: text("pin_locked_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_ha_user_id_unique").on(t.haUserId)],
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const loginAttempts = sqliteTable("login_attempts", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  success: integer("success", { mode: "boolean" }).notNull(),
  ipAddress: text("ip_address"),
  attemptedAt: text("attempted_at").notNull(),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
});

// ── Accounts, cards, connections ─────────────────────────────────────────────

export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  providerCode: text("provider_code").notNull(),
  credentialRef: text("credential_ref").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  scheduleCron: text("schedule_cron"),
  lastRunId: text("last_run_id"),
  puppeteerProfileDir: text("puppeteer_profile_dir"),
  ...timestamps,
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  connectionId: text("connection_id").references(() => connections.id),
  institutionCode: text("institution_code").notNull(),
  displayName: text("display_name").notNull(),
  numberLast4: text("number_last4"),
  currency: text("currency").notNull().default("ILS"),
  ownerPersonId: text("owner_person_id").references(() => people.id),
  note: text("note"),
  // 'business' keeps an account out of every household total; see MEM-DATA.
  scope: text("scope").notNull().default("household"),
  balanceIls: real("balance_ils"),
  balanceDate: text("balance_date"),
  ...timestamps,
});

export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  settlementAccountId: text("settlement_account_id").notNull().references(() => accounts.id),
  last4: text("last4").notNull(),
  cardholderPersonId: text("cardholder_person_id").notNull().references(() => people.id),
  brand: text("brand"),
  displayName: text("display_name").notNull(),
  note: text("note"),
  ...timestamps,
});

// ── Transactions ──────────────────────────────────────────────────────────────

export const purchases = sqliteTable("purchases", {
  id: text("id").primaryKey(),
  originalTotalAmount: real("original_total_amount").notNull(),
  purchaseDate: text("purchase_date").notNull(),
  installmentTotal: integer("installment_total").notNull(),
  cardId: text("card_id").notNull().references(() => cards.id),
  merchantId: text("merchant_id"),
  createdAt: text("created_at").notNull(),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    firstSeenRawId: text("first_seen_raw_id").references(() => rawTransactions.id),
    accountId: text("account_id").notNull().references(() => accounts.id),
    cardId: text("card_id").references(() => cards.id),
    identityHash: text("identity_hash").notNull(),
    transactionDate: text("transaction_date").notNull(),
    chargeDate: text("charge_date").notNull(),
    status: text("status").notNull(),
    direction: text("direction").notNull(),
    amountIls: real("amount_ils").notNull(),
    originalAmount: real("original_amount").notNull(),
    originalCurrency: text("original_currency").notNull(),
    fxRate: real("fx_rate"),
    fxFeeIls: real("fx_fee_ils"),
    descriptionRaw: text("description_raw").notNull(),
    descriptionNormalized: text("description_normalized").notNull(),
    merchantId: text("merchant_id"),
    kind: text("kind").notNull(),
    purchaseId: text("purchase_id").references(() => purchases.id),
    installmentIndex: integer("installment_index"),
    installmentTotal: integer("installment_total"),
    excludedFromTotals: integer("excluded_from_totals", { mode: "boolean" }).notNull().default(false),
    exclusionReason: text("exclusion_reason"),
    /** YYYY-MM display month for income; NULL until computed or overridden. */
    reportingPeriod: text("reporting_period"),
    reportingPeriodLocked: integer("reporting_period_locked", { mode: "boolean" })
      .notNull()
      .default(false),
    userNote: text("user_note"),
    categoryId: text("category_id").references(() => categories.id),
    classificationSource: text("classification_source"),
    providerCategory: text("provider_category"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tx_identity_hash_idx").on(t.identityHash),
    index("tx_account_date_idx").on(t.accountId, t.transactionDate),
    index("tx_charge_date_idx").on(t.chargeDate),
    index("tx_merchant_idx").on(t.merchantId),
  ],
);

export const transactionRevisions = sqliteTable("transaction_revisions", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").notNull().references(() => transactions.id),
  runId: text("run_id").references(() => scrapeRuns.id),
  fieldName: text("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  revisedAt: text("revised_at").notNull(),
});

export const transactionLinks = sqliteTable("transaction_links", {
  id: text("id").primaryKey(),
  fromId: text("from_id").notNull().references(() => transactions.id),
  toId: text("to_id").notNull().references(() => transactions.id),
  linkType: text("link_type").notNull(),
  confidence: real("confidence").notNull(),
  source: text("source").notNull(),
  confirmedAt: text("confirmed_at"),
  createdAt: text("created_at").notNull(),
});

// ── Categorization ────────────────────────────────────────────────────────────

export const merchants = sqliteTable("merchants", {
  id: text("id").primaryKey(),
  canonicalName: text("canonical_name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const merchantAliases = sqliteTable("merchant_aliases", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  rawDescriptor: text("raw_descriptor").notNull(),
  normalizationVersion: integer("normalization_version").notNull(),
  createdAt: text("created_at").notNull(),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  note: text("note"),
  createdAt: text("created_at").notNull(),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color"),
  createdAt: text("created_at").notNull(),
});

export const transactionTags = sqliteTable(
  "transaction_tags",
  {
    transactionId: text("transaction_id").notNull().references(() => transactions.id),
    tagId: text("tag_id").notNull().references(() => tags.id),
  },
  (t) => [uniqueIndex("tx_tag_unique").on(t.transactionId, t.tagId)],
);

export const transactionSplits = sqliteTable("transaction_splits", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").notNull().references(() => transactions.id),
  categoryId: text("category_id").notNull().references(() => categories.id),
  amount: real("amount").notNull(),
  note: text("note"),
});

export const categorizationRules = sqliteTable("categorization_rules", {
  id: text("id").primaryKey(),
  pattern: text("pattern").notNull(),
  categoryId: text("category_id").notNull().references(() => categories.id),
  priority: integer("priority").notNull().default(0),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const merchantCategoryLearned = sqliteTable(
  "merchant_category_learned",
  {
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    categoryId: text("category_id").notNull().references(() => categories.id),
    observationCount: integer("observation_count").notNull(),
    confidence: real("confidence").notNull(),
    lastSeen: text("last_seen").notNull(),
  },
  (t) => [uniqueIndex("mcl_merchant_idx").on(t.merchantId)],
);

export const providerCategoryMap = sqliteTable("provider_category_map", {
  providerCategory: text("provider_category").primaryKey(),
  categoryId: text("category_id").references(() => categories.id),
  updatedAt: text("updated_at").notNull(),
});

/** User-defined salary matchers for the dashboard inner income ring. */
export const salarySources = sqliteTable("salary_sources", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  personId: text("person_id").references(() => people.id),
  merchantId: text("merchant_id").references(() => merchants.id),
  accountId: text("account_id").references(() => accounts.id),
  matchPattern: text("match_pattern"),
  sortOrder: integer("sort_order").notNull().default(0),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const categorizationDecisions = sqliteTable("categorization_decisions", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").notNull().references(() => transactions.id),
  decidedBy: text("decided_by").notNull(),
  ruleId: text("rule_id").references(() => categorizationRules.id),
  confidence: real("confidence"),
  previousCategoryId: text("previous_category_id"),
  categoryId: text("category_id"),
  decidedAt: text("decided_at").notNull(),
});

// ── Loans ─────────────────────────────────────────────────────────────────────

export const loans = sqliteTable("loans", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  kind: text("kind").notNull(),
  lender: text("lender").notNull(),
  originationDate: text("origination_date").notNull(),
  originalPrincipal: real("original_principal").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull(),
});

export const loanTracks = sqliteTable("loan_tracks", {
  id: text("id").primaryKey(),
  loanId: text("loan_id").notNull().references(() => loans.id),
  rateType: text("rate_type").notNull(),
  margin: real("margin"),
  fixedRate: real("fixed_rate"),
  termMonths: integer("term_months").notNull(),
  principal: real("principal").notNull(),
  amortizationMethod: text("amortization_method").notNull(),
  cpiBaseIndexValue: real("cpi_base_index_value"),
  cpiConvention: text("cpi_convention"),
  rateResetMonths: integer("rate_reset_months"),
  createdAt: text("created_at").notNull(),
});

export const loanScheduleRows = sqliteTable("loan_schedule_rows", {
  id: text("id").primaryKey(),
  trackId: text("track_id").notNull().references(() => loanTracks.id),
  periodIndex: integer("period_index").notNull(),
  dueDate: text("due_date").notNull(),
  principalPart: real("principal_part").notNull(),
  interestPart: real("interest_part").notNull(),
  cpiAdjustment: real("cpi_adjustment").notNull(),
  remainingPrincipal: real("remaining_principal").notNull(),
  computedAt: text("computed_at").notNull(),
  assumptionSetId: text("assumption_set_id").notNull(),
});

export const earlyRepaymentScenarios = sqliteTable("early_repayment_scenarios", {
  id: text("id").primaryKey(),
  loanId: text("loan_id").notNull().references(() => loans.id),
  name: text("name").notNull(),
  extraPayment: real("extra_payment").notNull(),
  assumptionSetId: text("assumption_set_id").notNull(),
  savedAt: text("saved_at").notNull(),
});

// ── Investments ───────────────────────────────────────────────────────────────

export const instruments = sqliteTable("instruments", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  instrumentType: text("instrument_type").notNull(),
  currency: text("currency").notNull(),
  createdAt: text("created_at").notNull(),
});

export const holdings = sqliteTable("holdings", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  instrumentId: text("instrument_id").notNull().references(() => instruments.id),
  quantity: real("quantity").notNull(),
  costBasisIls: real("cost_basis_ils"),
  asOf: text("as_of").notNull(),
});

export const priceObservations = sqliteTable("price_observations", {
  id: text("id").primaryKey(),
  instrumentId: text("instrument_id").notNull().references(() => instruments.id),
  asOf: text("as_of").notNull(),
  price: real("price").notNull(),
  currency: text("currency").notNull(),
  source: text("source").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

export const contributions = sqliteTable("contributions", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  amount: real("amount").notNull(),
  contributedAt: text("contributed_at").notNull(),
  note: text("note"),
});

export const netWorthSnapshots = sqliteTable("net_worth_snapshots", {
  id: text("id").primaryKey(),
  asOf: text("as_of").notNull(),
  totalAssetsIls: real("total_assets_ils").notNull(),
  totalLiabilitiesIls: real("total_liabilities_ils").notNull(),
  netWorthIls: real("net_worth_ils").notNull(),
  computedAt: text("computed_at").notNull(),
});

// ── Reference, budgets, alerts, ops ───────────────────────────────────────────

/** Key-value store for app-wide settings (salary reporting window, etc.). */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const referenceSeries = sqliteTable("reference_series", {
  id: text("id").primaryKey(),
  seriesCode: text("series_code").notNull().unique(),
  displayName: text("display_name").notNull(),
  unit: text("unit").notNull(),
  createdAt: text("created_at").notNull(),
});

export const referenceObservations = sqliteTable("reference_observations", {
  id: text("id").primaryKey(),
  seriesId: text("series_id").notNull().references(() => referenceSeries.id),
  asOf: text("as_of").notNull(),
  value: real("value").notNull(),
  sourceUrl: text("source_url").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  rawResponseSha256: text("raw_response_sha256").notNull(),
});

export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  categoryId: text("category_id").notNull().references(() => categories.id),
  period: text("period").notNull(),
  amount: real("amount").notNull(),
  createdAt: text("created_at").notNull(),
});

export const recurringInstruments = sqliteTable("recurring_instruments", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").references(() => merchants.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  cadence: text("cadence").notNull(),
  expectedAmount: real("expected_amount").notNull(),
  lastSeen: text("last_seen"),
  status: text("status").notNull(),
  priceHistory: text("price_history").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});

export const alerts = sqliteTable("alerts", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  transactionId: text("transaction_id").references(() => transactions.id),
  status: text("status").notNull(),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status").notNull(),
  otpPrompt: text("otp_prompt"),
  otpResponse: text("otp_response"),
  attempts: integer("attempts").notNull().default(0),
  errorClass: text("error_class"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const rollupMonthly = sqliteTable(
  "rollup_monthly",
  {
    period: text("period").notNull(),
    dateBasis: text("date_basis").notNull(),
    categoryId: text("category_id"),
    cardId: text("card_id"),
    personId: text("person_id"),
    totalAmountIls: real("total_amount_ils").notNull(),
    transactionCount: integer("transaction_count").notNull(),
    computedAt: text("computed_at").notNull(),
  },
  (t) => [
    uniqueIndex("rollup_unique").on(
      t.period,
      t.dateBasis,
      t.categoryId,
      t.cardId,
      t.personId,
    ),
  ],
);

export const egressLog = sqliteTable("egress_log", {
  id: text("id").primaryKey(),
  host: text("host").notNull(),
  path: text("path").notNull(),
  purpose: text("purpose").notNull(),
  status: integer("status").notNull(),
  bytes: integer("bytes").notNull(),
  durationMs: integer("duration_ms").notNull(),
  at: text("at").notNull(),
});

// ponytail: split-sum trigger deferred to Phase 3 migration
