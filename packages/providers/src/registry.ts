import { ForkScraperAdapter } from "./fork-scraper-adapter.js";
import { OfficialScraperAdapter, isOfficialProvider } from "./official-scraper-adapter.js";
import type { ProviderAdapter } from "./types.js";

export type ProviderBackend = "official" | "fork";

export function getProviderAdapter(
  providerCode: string,
  backend: ProviderBackend = "official",
): ProviderAdapter {
  if (backend === "fork") {
    return new ForkScraperAdapter(providerCode);
  }
  if (!isOfficialProvider(providerCode)) {
    throw new Error(`No official scraper for provider: ${providerCode}`);
  }
  return new OfficialScraperAdapter(providerCode);
}
