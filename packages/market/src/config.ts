/** Prime = BOI policy rate + spread (plan §1.5). */
export const PRIME_SPREAD = 1.5;

export const BOI_INTEREST_URL = "https://www.boi.org.il/PublicApi/GetInterest";
export const BOI_FX_URL = "https://www.boi.org.il/PublicApi/GetExchangeRates";
export const CBS_CPI_URL =
  "https://api.cbs.gov.il/index/data/price?id=120010&coef=true";

export const GEMEL_FUND_RESOURCE_ID = "a30dcbea-a1d2-482c-ae29-8f781f5025fb";
export const PENSIA_FUND_RESOURCE_ID = "6d47d6b5-cb08-488b-b333-f1e717b1e1bd";

export const FX_SERIES_CODES: Record<string, string> = {
  USD: "fx_usd_ils",
  EUR: "fx_eur_ils",
  GBP: "fx_gbp_ils",
  CHF: "fx_chf_ils",
  JPY: "fx_jpy_ils",
};
