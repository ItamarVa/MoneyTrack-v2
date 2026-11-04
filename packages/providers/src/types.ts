import type { TransactionKind } from "@moneytrack/contracts";

/** Normalized transaction derived from a scraper row (not the verbatim payload). */
export type RawTransactionPayload = {
  providerAccountNumber: string;
  /** Secondary discriminator only — never used as primary identity key. */
  scraperIdentifier: string | number | null;
  transactionDate: string;
  chargeDate: string;
  status: "pending" | "posted";
  direction: "debit" | "credit";
  originalAmount: number;
  originalCurrency: string;
  amountIls: number;
  descriptionRaw: string;
  installmentIndex: number | null;
  installmentTotal: number | null;
  kind: TransactionKind;
  /** MAX provider category label when present on the scraper row. */
  providerCategory?: string;
  /** Verbatim scraper Transaction object for raw_transactions.payload_json. */
  payload: Record<string, unknown>;
};

export type ScraperAccountSnapshot = {
  providerAccountNumber: string;
  balance: number | null;
  balanceDate: string | null;
  cardFrame: string | null;
  cardType: string | null;
  currency: string;
  savingsAccount: boolean;
  transactions: RawTransactionPayload[];
};

export type ScrapeSuccess = {
  ok: true;
  accounts: ScraperAccountSnapshot[];
  libraryVersion: string;
};

export type ScrapeFailure = {
  ok: false;
  errorClass: string;
  errorMessageRedacted: string;
  libraryVersion: string;
};

export type ScrapeResult = ScrapeSuccess | ScrapeFailure;

export type ConnectionRef = {
  id: string;
  providerCode: string;
  puppeteerProfileDir: string | null;
};

export type ScrapeOptions = {
  startDate: Date;
  combineInstallments: false;
  puppeteerUserDataDir?: string;
  showBrowser?: boolean;
  onOtpRequired?: (prompt: string) => Promise<string>;
};

export type ProviderCredentials = Record<string, string>;

export type ProviderAdapter = {
  readonly companyId: string;
  readonly supportsOtp: boolean;
  scrape(
    connection: ConnectionRef,
    credentials: ProviderCredentials,
    options: ScrapeOptions,
  ): Promise<ScrapeResult>;
};
