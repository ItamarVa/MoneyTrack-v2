import {
  CompanyTypes,
  createScraper,
  type ScraperCredentials,
  type ScraperOptions,
  type ScraperScrapingResult,
} from "israeli-bank-scrapers";
import { mapScraperTransaction } from "./map-transaction.js";
import { redactLogMessage } from "./redact.js";
import type {
  ConnectionRef,
  ProviderAdapter,
  ProviderCredentials,
  ScrapeOptions,
  ScrapeResult,
  ScraperAccountSnapshot,
} from "./types.js";

export const OFFICIAL_SCRAPER_VERSION = "6.9.0";

const PROVIDER_TO_COMPANY: Record<string, CompanyTypes> = {
  hapoalim: CompanyTypes.hapoalim,
  beinleumi: CompanyTypes.beinleumi,
  union: CompanyTypes.union,
  amex: CompanyTypes.amex,
  isracard: CompanyTypes.isracard,
  visacal: CompanyTypes.visaCal,
  visaCal: CompanyTypes.visaCal,
  max: CompanyTypes.max,
  otsarHahayal: CompanyTypes.otsarHahayal,
  discount: CompanyTypes.discount,
  mercantile: CompanyTypes.mercantile,
  mizrahi: CompanyTypes.mizrahi,
  leumi: CompanyTypes.leumi,
  massad: CompanyTypes.massad,
  yahav: CompanyTypes.yahav,
  behatsdaa: CompanyTypes.behatsdaa,
  beyahadBishvilha: CompanyTypes.beyahadBishvilha,
  oneZero: CompanyTypes.oneZero,
  onezero: CompanyTypes.oneZero,
  pagi: CompanyTypes.pagi,
};

function redactErrorMessage(
  message: string | undefined,
  credentials: ProviderCredentials,
): string {
  if (!message) {
    return "Scrape failed";
  }
  return redactLogMessage(message, Object.values(credentials));
}

function resolveCompanyId(providerCode: string): CompanyTypes | null {
  return PROVIDER_TO_COMPANY[providerCode] ?? null;
}

type ScraperAccount = NonNullable<ScraperScrapingResult["accounts"]>[number];

function mapAccount(account: ScraperAccount): ScraperAccountSnapshot {
  return {
    providerAccountNumber: account.accountNumber,
    balance: account.balance ?? null,
    balanceDate: account.balanceDate ? String(account.balanceDate).slice(0, 10) : null,
    cardFrame: account.cardFrame != null ? String(account.cardFrame) : null,
    cardType: account.cardType ?? null,
    currency: account.currency ?? "ILS",
    savingsAccount: Boolean(account.savingsAccount),
    transactions: account.txns.map((txn) =>
      mapScraperTransaction(account.accountNumber, txn),
    ),
  };
}

export class OfficialScraperAdapter implements ProviderAdapter {
  readonly companyId: string;
  readonly supportsOtp: boolean;

  constructor(providerCode: string) {
    const company = resolveCompanyId(providerCode);
    if (!company) {
      throw new Error(`Unsupported provider for official scraper: ${providerCode}`);
    }
    this.companyId = company;
    this.supportsOtp = company === CompanyTypes.oneZero;
  }

  async scrape(
    _connection: ConnectionRef,
    credentials: ProviderCredentials,
    options: ScrapeOptions,
  ): Promise<ScrapeResult> {
    const scraperOptions: ScraperOptions = {
      companyId: this.companyId as CompanyTypes,
      startDate: options.startDate,
      combineInstallments: false,
      showBrowser: options.showBrowser ?? false,
      verbose: false,
      storeFailureScreenShotPath: undefined,
      outputData: { enableTransactionsFilterByDate: false },
    };

    const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
    if (chromiumPath) {
      scraperOptions.executablePath = chromiumPath;
    }

    const args: string[] = ["--disk-cache-size=33554432"];
    if (options.puppeteerUserDataDir) {
      args.push(`--user-data-dir=${options.puppeteerUserDataDir}`);
    }
    if (process.env.MONEYTRACK_MODE === "ha-addon") {
      // The add-on agent runs as root in a container: Chromium refuses to start
      // there with its own sandbox, and Docker's default /dev/shm (64 MB) crashes
      // renderers. The container plus its AppArmor profile are the isolation boundary.
      args.push("--no-sandbox", "--disable-dev-shm-usage");
    }
    if (args.length > 0) {
      scraperOptions.args = args;
    }

    let scrapeCredentials = credentials as ScraperCredentials;
    if (this.supportsOtp && options.onOtpRequired) {
      scrapeCredentials = {
        ...credentials,
        otpCodeRetriever: () => options.onOtpRequired!("Enter the verification code from your bank"),
      } as ScraperCredentials;
    }

    const scraper = createScraper(scraperOptions);
    const result = await scraper.scrape(scrapeCredentials);

    if (!result.success) {
      return {
        ok: false,
        errorClass: result.errorType ?? "GENERIC",
        errorMessageRedacted: redactErrorMessage(result.errorMessage, credentials),
        libraryVersion: OFFICIAL_SCRAPER_VERSION,
      };
    }

    const accounts = (result.accounts ?? []).map(mapAccount);

    return {
      ok: true,
      accounts,
      libraryVersion: OFFICIAL_SCRAPER_VERSION,
    };
  }
}

export function isOfficialProvider(providerCode: string): boolean {
  return resolveCompanyId(providerCode) !== null;
}
