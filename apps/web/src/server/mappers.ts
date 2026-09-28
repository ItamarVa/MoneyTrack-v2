import type {
  Account,
  Card,
  Connection,
  Person,
  EarlyRepaymentScenario,
  Job,
  Loan,
  LoanScheduleRow,
  LoanTrack,
  Transaction,
} from "@moneytrack/contracts";
import type {
  accounts,
  cards,
  connections,
  people,
  earlyRepaymentScenarios,
  jobs,
  loanScheduleRows,
  loanTracks,
  loans,
  transactions,
} from "@moneytrack/db";

type DbAccount = typeof accounts.$inferSelect;
type DbCard = typeof cards.$inferSelect;
type DbPerson = typeof people.$inferSelect;
type DbConnection = typeof connections.$inferSelect;
type DbJob = typeof jobs.$inferSelect;
type DbTransaction = typeof transactions.$inferSelect;
type DbLoan = typeof loans.$inferSelect;
type DbLoanTrack = typeof loanTracks.$inferSelect;
type DbLoanScheduleRow = typeof loanScheduleRows.$inferSelect;
type DbEarlyRepaymentScenario = typeof earlyRepaymentScenarios.$inferSelect;

export function mapPerson(row: DbPerson): Person {
  return {
    id: row.id,
    displayName: row.displayName,
    isChild: row.isChild,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapAccount(row: DbAccount): Account {
  return {
    id: row.id,
    kind: row.kind as Account["kind"],
    connectionId: row.connectionId,
    institutionCode: row.institutionCode,
    displayName: row.displayName,
    numberLast4: row.numberLast4,
    currency: row.currency,
    ownerPersonId: row.ownerPersonId,
    note: row.note,
    scope: row.scope as Account["scope"],
    balanceIls: row.balanceIls,
    balanceDate: row.balanceDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapCard(row: DbCard): Card {
  return {
    id: row.id,
    settlementAccountId: row.settlementAccountId,
    last4: row.last4,
    cardholderPersonId: row.cardholderPersonId,
    brand: row.brand,
    displayName: row.displayName,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapConnection(row: DbConnection): Connection {
  return {
    id: row.id,
    providerCode: row.providerCode,
    credentialRef: row.credentialRef,
    enabled: row.enabled,
    scheduleCron: row.scheduleCron,
    lastRunId: row.lastRunId,
    puppeteerProfileDir: row.puppeteerProfileDir,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapTransaction(row: DbTransaction, tagIds: string[] = []): Transaction {
  return {
    id: row.id,
    firstSeenRawId: row.firstSeenRawId,
    accountId: row.accountId,
    cardId: row.cardId,
    identityHash: row.identityHash,
    transactionDate: row.transactionDate,
    chargeDate: row.chargeDate,
    status: row.status as Transaction["status"],
    direction: row.direction as Transaction["direction"],
    amountIls: row.amountIls,
    originalAmount: row.originalAmount,
    originalCurrency: row.originalCurrency,
    fxRate: row.fxRate,
    fxFeeIls: row.fxFeeIls,
    descriptionRaw: row.descriptionRaw,
    descriptionNormalized: row.descriptionNormalized,
    merchantId: row.merchantId,
    kind: row.kind as Transaction["kind"],
    purchaseId: row.purchaseId,
    installmentIndex: row.installmentIndex,
    installmentTotal: row.installmentTotal,
    excludedFromTotals: row.excludedFromTotals,
    exclusionReason: row.exclusionReason,
    userNote: row.userNote,
    categoryId: row.categoryId,
    providerCategory: row.providerCategory ?? null,
    classificationSource: row.classificationSource as Transaction["classificationSource"],
    reportingPeriod: row.reportingPeriod ?? null,
    reportingPeriodLocked: row.reportingPeriodLocked,
    tagIds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapJob(row: DbJob): Job {
  return {
    id: row.id,
    kind: row.kind as Job["kind"],
    payloadJson: JSON.parse(row.payloadJson) as Record<string, unknown>,
    status: row.status as Job["status"],
    otpPrompt: row.otpPrompt,
    // The submitted code is never echoed back to any caller.
    otpResponse: null,
    attempts: row.attempts,
    errorClass: row.errorClass,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapLoan(row: DbLoan): Loan {
  return {
    id: row.id,
    accountId: row.accountId,
    kind: row.kind as Loan["kind"],
    lender: row.lender,
    originationDate: row.originationDate,
    originalPrincipal: row.originalPrincipal,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export function mapLoanTrack(row: DbLoanTrack): LoanTrack {
  return {
    id: row.id,
    loanId: row.loanId,
    rateType: row.rateType as LoanTrack["rateType"],
    margin: row.margin,
    fixedRate: row.fixedRate,
    termMonths: row.termMonths,
    principal: row.principal,
    amortizationMethod: row.amortizationMethod as LoanTrack["amortizationMethod"],
    cpiBaseIndexValue: row.cpiBaseIndexValue,
    cpiConvention: row.cpiConvention as LoanTrack["cpiConvention"],
    rateResetMonths: row.rateResetMonths,
    createdAt: row.createdAt,
  };
}

export function mapLoanScheduleRow(row: DbLoanScheduleRow): LoanScheduleRow {
  return {
    id: row.id,
    trackId: row.trackId,
    periodIndex: row.periodIndex,
    dueDate: row.dueDate,
    principalPart: row.principalPart,
    interestPart: row.interestPart,
    cpiAdjustment: row.cpiAdjustment,
    remainingPrincipal: row.remainingPrincipal,
    computedAt: row.computedAt,
    assumptionSetId: row.assumptionSetId,
  };
}

export function mapEarlyRepaymentScenario(row: DbEarlyRepaymentScenario): EarlyRepaymentScenario {
  return {
    id: row.id,
    loanId: row.loanId,
    name: row.name,
    extraPayment: row.extraPayment,
    assumptionSetId: row.assumptionSetId,
    savedAt: row.savedAt,
  };
}
