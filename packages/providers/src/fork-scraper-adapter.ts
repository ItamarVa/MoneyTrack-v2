import type {
  ConnectionRef,
  ProviderAdapter,
  ProviderCredentials,
  ScrapeOptions,
  ScrapeResult,
} from "./types.js";

/** Stub for a future @sergienko4/israeli-bank-scrapers swap-in. */
export class ForkScraperAdapter implements ProviderAdapter {
  readonly companyId: string;
  readonly supportsOtp = false;

  constructor(providerCode: string) {
    this.companyId = providerCode;
  }

  async scrape(
    _connection: ConnectionRef,
    _credentials: ProviderCredentials,
    _options: ScrapeOptions,
  ): Promise<ScrapeResult> {
    return {
      ok: false,
      errorClass: "NOT_IMPLEMENTED",
      errorMessageRedacted: "Fork scraper adapter is not wired yet",
      libraryVersion: "fork-stub",
    };
  }
}
