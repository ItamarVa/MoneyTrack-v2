import type {
  Account,
  AccountCreateRequest,
  AccountListResponse,
  AccountUpdateRequest,
  Alert,
  AnalysisFilter,
  AnalysisSummaryResponse,
  BreakdownDimension,
  BreakdownRequest,
  BreakdownResponse,
  BudgetCreateRequest,
  BudgetWithVariance,
  Card,
  CardCreateRequest,
  CardUpdateRequest,
  CashflowForecastResponse,
  CategorizationRule,
  Category,
  CategoryCreateRequest,
  CategoryUpdateRequest,
  CategoryBreakdownResponse,
  CategoryDetailResponse,
  ClassifyReapplyResponse,
  ClassifyUncategorizedResponse,
  ClassificationDetailResponse,
  Connection,
  ConnectionListResponse,
  DashboardHomeResponse,
  Job,
  NetWorthSnapshot,
  Person,
  PersonCreateRequest,
  SalaryReportingSettings,
  SalaryReportingSettingsPatchRequest,
  SalaryReportingSettingsResponse,
  SalarySource,
  SalarySourceCreateRequest,
  SalarySourceUpdateRequest,
  PersonUpdateRequest,
  ProviderCategoryMapEntry,
  ProviderCategoryMapListResponse,
  ProviderCategoryMapUpdateResponse,
  ProviderCatalogEntry,
  ProviderListResponse,
  UncategorizedMerchant,
  RuleCreateRequest,
  RuleUpdateRequest,
  SessionResponse,
  SyncJobListResponse,
  Tag,
  Transaction,
  TransactionCreateRequest,
  TransactionListResponse,
  TransactionUpdateRequest,
  TrendResponse,
  EarlyRepaymentScenarioResponse,
  HouseholdUsersListResponse,
  LoanCreateRequest,
  LoanDetailResponse,
  LoanListResponse,
  LoanScheduleResponse,
  LoanTrackCreateRequest,
} from "@moneytrack/contracts";
import { filterToSearchParams } from "@/lib/analysis-filter";
import { apiUrl } from "@/lib/base-path";

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data;
}

function mutatingHeaders(): HeadersInit {
  return { "content-type": "application/json" };
}

export async function fetchAccounts(): Promise<Account[]> {
  const data = await parseJson<AccountListResponse>(
    await fetch(apiUrl("/api/accounts"), { cache: "no-store" }),
  );
  return data.accounts;
}

export async function createAccount(body: AccountCreateRequest): Promise<Account> {
  const data = await parseJson<{ account: Account }>(
    await fetch(apiUrl("/api/accounts"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify({
        ...body,
        currency: body.currency ?? "ILS",
      }),
    }),
  );
  return data.account;
}

export async function updateAccount(id: string, body: AccountUpdateRequest): Promise<Account> {
  const data = await parseJson<{ account: Account }>(
    await fetch(apiUrl(`/api/accounts/${id}`), {
      method: "PATCH",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
  return data.account;
}

export async function fetchBreakdown(
  filter: AnalysisFilter,
  dimension: BreakdownDimension = "category",
  flow: "expense" | "income" = "expense",
): Promise<BreakdownResponse> {
  const body: BreakdownRequest = { ...filter, dimension, flow };
  return parseJson<BreakdownResponse>(
    await fetch(apiUrl("/api/analysis/breakdown"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function fetchCategoryBreakdown(
  filter: AnalysisFilter,
): Promise<CategoryBreakdownResponse> {
  return parseJson<CategoryBreakdownResponse>(
    await fetch(apiUrl("/api/analysis/categories"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(filter),
    }),
  );
}

export async function fetchCategoryDetail(
  categoryId: string,
  period: string,
): Promise<CategoryDetailResponse> {
  const params = new URLSearchParams({ period });
  return parseJson<CategoryDetailResponse>(
    await fetch(apiUrl(`/api/analysis/categories/${categoryId}?${params.toString()}`), {
      cache: "no-store",
    }),
  );
}

export async function fetchAnalysisSummary(
  filter: AnalysisFilter,
): Promise<AnalysisSummaryResponse> {
  return parseJson<AnalysisSummaryResponse>(
    await fetch(apiUrl("/api/analysis/summary"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(filter),
    }),
  );
}

export async function fetchCategoryTrend(filter: AnalysisFilter): Promise<TrendResponse> {
  return parseJson<TrendResponse>(
    await fetch(apiUrl("/api/analysis/trend"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(filter),
    }),
  );
}

export async function fetchTags(): Promise<Tag[]> {
  const data = await parseJson<{ tags: Tag[] }>(
    await fetch(apiUrl("/api/tags"), { cache: "no-store" }),
  );
  return data.tags;
}

export async function fetchPeople(): Promise<Person[]> {
  const data = await parseJson<{ people: Person[] }>(
    await fetch(apiUrl("/api/people"), { cache: "no-store" }),
  );
  return data.people;
}

export async function fetchHouseholdUsers(): Promise<HouseholdUsersListResponse> {
  return parseJson<HouseholdUsersListResponse>(
    await fetch(apiUrl("/api/users"), { cache: "no-store" }),
  );
}

export async function resetHouseholdUserCredentials(
  userId: string,
  reason?: string,
): Promise<void> {
  await parseJson<{ ok: true }>(
    await fetch(apiUrl(`/api/users/${userId}/reset`), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(reason ? { reason } : {}),
    }),
  );
}

export async function createPerson(body: PersonCreateRequest): Promise<Person> {
  return parseJson<Person>(
    await fetch(apiUrl("/api/people"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function updatePerson(id: string, body: PersonUpdateRequest): Promise<Person> {
  return parseJson<Person>(
    await fetch(apiUrl(`/api/people/${id}`), {
      method: "PATCH",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function deletePerson(id: string): Promise<void> {
  await parseJson<{ ok: true }>(
    await fetch(apiUrl(`/api/people/${id}`), {
      method: "DELETE",
      headers: mutatingHeaders(),
    }),
  );
}

export async function fetchSalarySources(): Promise<SalarySource[]> {
  const data = await parseJson<{ salarySources: SalarySource[] }>(
    await fetch(apiUrl("/api/salary-sources"), { cache: "no-store" }),
  );
  return data.salarySources;
}

export async function createSalarySource(body: SalarySourceCreateRequest): Promise<SalarySource> {
  return parseJson<SalarySource>(
    await fetch(apiUrl("/api/salary-sources"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function updateSalarySource(
  id: string,
  body: SalarySourceUpdateRequest,
): Promise<SalarySource> {
  return parseJson<SalarySource>(
    await fetch(apiUrl(`/api/salary-sources/${id}`), {
      method: "PATCH",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteSalarySource(id: string): Promise<void> {
  await parseJson<{ ok: true }>(
    await fetch(apiUrl(`/api/salary-sources/${id}`), {
      method: "DELETE",
      headers: mutatingHeaders(),
    }),
  );
}

export async function fetchCards(): Promise<Card[]> {
  const data = await parseJson<{ cards: Card[] }>(
    await fetch(apiUrl("/api/cards"), { cache: "no-store" }),
  );
  return data.cards;
}

export async function createCard(body: CardCreateRequest): Promise<Card> {
  return parseJson<Card>(
    await fetch(apiUrl("/api/cards"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function updateCard(id: string, body: CardUpdateRequest): Promise<Card> {
  return parseJson<Card>(
    await fetch(apiUrl(`/api/cards/${id}`), {
      method: "PATCH",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteCard(id: string): Promise<void> {
  await parseJson<{ ok: true }>(
    await fetch(apiUrl(`/api/cards/${id}`), {
      method: "DELETE",
      headers: mutatingHeaders(),
    }),
  );
}

export async function fetchRules(): Promise<CategorizationRule[]> {
  const data = await parseJson<{ rules: CategorizationRule[] }>(
    await fetch(apiUrl("/api/rules"), { cache: "no-store" }),
  );
  return data.rules;
}

export async function createRule(body: RuleCreateRequest): Promise<CategorizationRule> {
  return parseJson<CategorizationRule>(
    await fetch(apiUrl("/api/rules"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function updateRule(id: string, body: RuleUpdateRequest): Promise<CategorizationRule> {
  return parseJson<CategorizationRule>(
    await fetch(apiUrl(`/api/rules/${id}`), {
      method: "PATCH",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteRule(id: string): Promise<void> {
  await parseJson<{ ok: true }>(
    await fetch(apiUrl(`/api/rules/${id}`), {
      method: "DELETE",
      headers: mutatingHeaders(),
    }),
  );
}

export async function createCategory(body: CategoryCreateRequest): Promise<Category> {
  return parseJson<Category>(
    await fetch(apiUrl("/api/categories"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function updateCategory(id: string, body: CategoryUpdateRequest): Promise<Category> {
  return parseJson<Category>(
    await fetch(apiUrl(`/api/categories/${id}`), {
      method: "PATCH",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteCategory(id: string, reassignTo: string): Promise<void> {
  await parseJson<{ ok: true }>(
    await fetch(apiUrl(`/api/categories/${id}`), {
      method: "DELETE",
      headers: mutatingHeaders(),
      body: JSON.stringify({ reassignTo }),
    }),
  );
}

export async function deleteConnection(id: string): Promise<void> {
  await parseJson<{ ok: true }>(
    await fetch(apiUrl(`/api/connections/${id}`), {
      method: "DELETE",
      headers: mutatingHeaders(),
    }),
  );
}

export async function fetchSession(): Promise<SessionResponse> {
  return parseJson<SessionResponse>(
    await fetch(apiUrl("/api/auth/session"), { cache: "no-store" }),
  );
}

export async function logout(): Promise<void> {
  await parseJson<{ ok: true }>(
    await fetch(apiUrl("/api/auth/logout"), {
      method: "POST",
      headers: mutatingHeaders(),
    }),
  );
}

export type MerchantOption = { id: string; name: string };

export type FetchMerchantsOptions = {
  q?: string;
  incomeOnly?: boolean;
  limit?: number;
  includeId?: string;
};

export async function fetchMerchants(options?: FetchMerchantsOptions): Promise<MerchantOption[]> {
  const params = new URLSearchParams();
  if (options?.q?.trim()) params.set("q", options.q.trim());
  if (options?.incomeOnly) params.set("incomeOnly", "1");
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.includeId) params.set("includeId", options.includeId);
  const query = params.toString();
  const data = await parseJson<{ merchants: MerchantOption[] }>(
    await fetch(apiUrl(query ? `/api/merchants?${query}` : "/api/merchants"), { cache: "no-store" }),
  );
  return data.merchants;
}

export async function fetchEntityName(dimension: BreakdownDimension, id: string): Promise<string> {
  switch (dimension) {
    case "merchant": {
      const merchant = (await fetchMerchants()).find((row) => row.id === id);
      return merchant?.name ?? id;
    }
    case "person": {
      const person = (await fetchPeople()).find((row) => row.id === id);
      return person?.displayName ?? id;
    }
    case "card": {
      const card = (await fetchCards()).find((row) => row.id === id);
      return card?.displayName ?? id;
    }
    case "account": {
      const account = (await fetchAccounts()).find((row) => row.id === id);
      return account?.displayName ?? id;
    }
    case "tag": {
      const tag = (await fetchTags()).find((row) => row.id === id);
      return tag?.name ?? id;
    }
    case "category":
    case "subcategory": {
      const category = (await fetchCategories()).find((row) => row.id === id);
      return category?.name ?? id;
    }
    case "month":
      return id;
    case "salary": {
      const source = (await fetchSalarySources()).find((row) => row.id === id);
      return source?.displayName ?? id;
    }
  }
}

export async function fetchCategories(): Promise<Category[]> {
  const data = await parseJson<{ categories: Category[] }>(
    await fetch(apiUrl("/api/categories"), { cache: "no-store" }),
  );
  return data.categories;
}

/** Returns the updated row so the caller can patch it in place, without a refetch. */
export async function setTransactionCategory(
  transactionId: string,
  categoryId: string,
): Promise<Transaction> {
  const data = await parseJson<{ transaction: Transaction }>(
    await fetch(apiUrl(`/api/transactions/${transactionId}/category`), {
      method: "PATCH",
      headers: mutatingHeaders(),
      body: JSON.stringify({ categoryId }),
    }),
  );
  return data.transaction;
}

export async function fetchClassificationDetail(
  transactionId: string,
): Promise<ClassificationDetailResponse> {
  return parseJson<ClassificationDetailResponse>(
    await fetch(apiUrl(`/api/transactions/${transactionId}/classification`), { cache: "no-store" }),
  );
}

export async function previewRuleMatches(pattern: string): Promise<number> {
  const data = await parseJson<{ matchCount: number }>(
    await fetch(apiUrl("/api/rules/preview"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify({ pattern }),
    }),
  );
  return data.matchCount ?? 0;
}

export async function fetchConnections(): Promise<Connection[]> {
  const data = await parseJson<ConnectionListResponse>(
    await fetch(apiUrl("/api/connections"), { cache: "no-store" }),
  );
  return data.connections;
}

export async function createConnection(providerCode: string): Promise<Connection> {
  return parseJson<Connection>(
    await fetch(apiUrl("/api/connections"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify({ providerCode, enabled: true }),
    }),
  );
}

export async function fetchProviders(): Promise<ProviderCatalogEntry[]> {
  const data = await parseJson<ProviderListResponse>(
    await fetch(apiUrl("/api/providers"), { cache: "no-store" }),
  );
  return data.providers;
}

export async function saveConnectionCredentials(
  connectionId: string,
  fields: Record<string, string>,
): Promise<void> {
  await parseJson<{ ok: true }>(
    await fetch(apiUrl(`/api/connections/${connectionId}/credentials`), {
      method: "PUT",
      headers: mutatingHeaders(),
      body: JSON.stringify({ fields }),
    }),
  );
}

export async function fetchTransactions(
  filter?: Partial<AnalysisFilter>,
  limit = 200,
): Promise<Transaction[]> {
  const params = filter ? filterToSearchParams({ dateBasis: "transaction", ...filter }) : new URLSearchParams();
  params.set("limit", String(limit));
  const data = await parseJson<TransactionListResponse>(
    await fetch(apiUrl(`/api/transactions?${params.toString()}`), { cache: "no-store" }),
  );
  return data.items;
}

export async function createTransaction(
  body: TransactionCreateRequest,
): Promise<Transaction> {
  const data = await parseJson<{ transaction: Transaction }>(
    await fetch(apiUrl("/api/transactions"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
  return data.transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  await parseJson<{ ok: true }>(
    await fetch(apiUrl(`/api/transactions/${id}`), {
      method: "DELETE",
      headers: mutatingHeaders(),
    }),
  );
}

export async function fetchSyncJobs(): Promise<Job[]> {
  const data = await parseJson<SyncJobListResponse>(
    await fetch(apiUrl("/api/sync"), { cache: "no-store" }),
  );
  return data.jobs;
}

export async function startSync(connectionId: string): Promise<Job> {
  const data = await parseJson<{ job: Job }>(
    await fetch(apiUrl("/api/sync"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify({ connectionId }),
    }),
  );
  return data.job;
}

export async function submitSyncOtp(jobId: string, otp: string): Promise<Job> {
  const data = await parseJson<{ job: Job }>(
    await fetch(apiUrl(`/api/sync/${jobId}/otp`), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify({ otp }),
    }),
  );
  return data.job;
}

export async function fetchLoans(): Promise<LoanListResponse["loans"]> {
  const data = await parseJson<LoanListResponse>(
    await fetch(apiUrl("/api/loans"), { cache: "no-store" }),
  );
  return data.loans;
}

export async function fetchLoanDetail(loanId: string): Promise<LoanDetailResponse> {
  return parseJson<LoanDetailResponse>(
    await fetch(apiUrl(`/api/loans/${loanId}`), { cache: "no-store" }),
  );
}

export async function createLoan(body: LoanCreateRequest): Promise<LoanDetailResponse> {
  return parseJson<LoanDetailResponse>(
    await fetch(apiUrl("/api/loans"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function createLoanTrack(
  loanId: string,
  body: LoanTrackCreateRequest,
): Promise<void> {
  await parseJson(
    await fetch(apiUrl(`/api/loans/${loanId}/tracks`), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function fetchLoanSchedule(
  loanId: string,
  trackId: string,
): Promise<LoanScheduleResponse> {
  return parseJson<LoanScheduleResponse>(
    await fetch(apiUrl(`/api/loans/${loanId}/tracks/${trackId}/schedule`), { cache: "no-store" }),
  );
}

export async function saveEarlyRepaymentScenario(
  loanId: string,
  body: { name: string; extraPayment: number },
): Promise<EarlyRepaymentScenarioResponse> {
  return parseJson<EarlyRepaymentScenarioResponse>(
    await fetch(apiUrl(`/api/loans/${loanId}/early-repayment`), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function fetchAlerts(): Promise<Alert[]> {
  const data = await parseJson<{ alerts: Alert[] }>(
    await fetch(apiUrl("/api/alerts"), { cache: "no-store" }),
  );
  return data.alerts;
}

export async function dismissAlert(id: string): Promise<Alert> {
  return parseJson<Alert>(
    await fetch(apiUrl(`/api/alerts/${id}`), {
      method: "PATCH",
      headers: mutatingHeaders(),
      body: JSON.stringify({ status: "dismissed" }),
    }),
  );
}

export async function fetchBudgets(): Promise<BudgetWithVariance[]> {
  const data = await parseJson<{ budgets: BudgetWithVariance[] }>(
    await fetch(apiUrl("/api/budgets"), { cache: "no-store" }),
  );
  return data.budgets;
}

export async function createBudget(body: BudgetCreateRequest): Promise<BudgetWithVariance> {
  return parseJson<BudgetWithVariance>(
    await fetch(apiUrl("/api/budgets"), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function fetchCashflowForecast(days = 90): Promise<CashflowForecastResponse> {
  return parseJson<CashflowForecastResponse>(
    await fetch(apiUrl(`/api/forecast/cashflow?days=${days}`), { cache: "no-store" }),
  );
}

export async function fetchNetWorthSnapshots(): Promise<NetWorthSnapshot[]> {
  const data = await parseJson<{ snapshots: NetWorthSnapshot[] }>(
    await fetch(apiUrl("/api/networth"), { cache: "no-store" }),
  );
  return data.snapshots;
}

export async function fetchDashboardHome(period?: string): Promise<DashboardHomeResponse> {
  const query = period ? `?period=${encodeURIComponent(period)}` : "";
  return parseJson<DashboardHomeResponse>(
    await fetch(apiUrl(`/api/dashboard/home${query}`), { cache: "no-store" }),
  );
}

export async function fetchUncategorizedMerchants(): Promise<UncategorizedMerchant[]> {
  const data = await parseJson<ClassifyUncategorizedResponse>(
    await fetch(apiUrl("/api/classify/uncategorized"), { cache: "no-store" }),
  );
  return data.merchants;
}

export async function fetchProviderCategoryMap(): Promise<ProviderCategoryMapEntry[]> {
  const data = await parseJson<ProviderCategoryMapListResponse>(
    await fetch(apiUrl("/api/classify/provider-map"), { cache: "no-store" }),
  );
  return data.mappings;
}

export async function updateProviderCategoryMap(
  mappings: { providerCategory: string; categoryId: string | null }[],
): Promise<ProviderCategoryMapUpdateResponse> {
  return parseJson<ProviderCategoryMapUpdateResponse>(
    await fetch(apiUrl("/api/classify/provider-map"), {
      method: "PUT",
      headers: mutatingHeaders(),
      body: JSON.stringify({ mappings }),
    }),
  );
}

export async function reclassifyAll(): Promise<ClassifyReapplyResponse> {
  return parseJson<ClassifyReapplyResponse>(
    await fetch(apiUrl("/api/classify/reapply"), {
      method: "POST",
      headers: mutatingHeaders(),
    }),
  );
}

// ── Salary reporting settings ─────────────────────────────────────────────────

export async function fetchSalaryReportingSettings(): Promise<SalaryReportingSettings> {
  const data = await parseJson<SalaryReportingSettingsResponse>(
    await fetch(apiUrl("/api/settings/salary-reporting"), { cache: "no-store" }),
  );
  return data.settings;
}

export async function updateSalaryReportingSettings(
  body: SalaryReportingSettingsPatchRequest,
): Promise<SalaryReportingSettings> {
  const data = await parseJson<SalaryReportingSettingsResponse>(
    await fetch(apiUrl("/api/settings/salary-reporting"), {
      method: "PATCH",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
  return data.settings;
}

export async function reapplySalaryReporting(): Promise<{ updated: number }> {
  return parseJson<{ updated: number }>(
    await fetch(apiUrl("/api/settings/salary-reporting/reapply"), {
      method: "POST",
      headers: mutatingHeaders(),
    }),
  );
}

export type TransactionReportingPatch = TransactionUpdateRequest & {
  reportingPeriod?: string | null;
  reportingPeriodLocked?: boolean;
};

/** PATCH /api/transactions/:id — includes reporting period override fields. */
export async function updateTransaction(
  id: string,
  body: TransactionReportingPatch,
): Promise<Transaction> {
  const data = await parseJson<{ transaction: Transaction }>(
    await fetch(apiUrl(`/api/transactions/${id}`), {
      method: "PATCH",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
  return data.transaction;
}
