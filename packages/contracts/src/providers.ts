/**
 * Provider catalog — which institutions can be scraped and which login fields
 * each one needs. Mirrors `SCRAPERS` in `israeli-bank-scrapers/lib/definitions`;
 * it lives here (not in `packages/providers`) so the web app can render a login
 * form without pulling puppeteer into the Next.js bundle.
 * `packages/providers/src/providers.test.ts` fails if the two ever drift apart.
 * Fields the user cannot type (oneZero's otpCodeRetriever / otpLongTermToken)
 * are deliberately omitted — the OTP flow supplies them at scrape time.
 */
import { z } from "zod";

export const ProviderLoginFieldSchema = z.enum([
  "userCode",
  "username",
  "password",
  "id",
  "num",
  "card6Digits",
  "nationalID",
  "email",
  "phoneNumber",
]);
export type ProviderLoginField = z.infer<typeof ProviderLoginFieldSchema>;

export const ProviderCatalogEntrySchema = z.object({
  code: z.string().min(1),
  kind: z.enum(["bank", "card"]),
  loginFields: z.array(ProviderLoginFieldSchema).min(1),
});
export type ProviderCatalogEntry = z.infer<typeof ProviderCatalogEntrySchema>;

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  { code: "hapoalim", kind: "bank", loginFields: ["userCode", "password"] },
  { code: "leumi", kind: "bank", loginFields: ["username", "password"] },
  { code: "mizrahi", kind: "bank", loginFields: ["username", "password"] },
  { code: "discount", kind: "bank", loginFields: ["id", "password", "num"] },
  { code: "mercantile", kind: "bank", loginFields: ["id", "password", "num"] },
  { code: "otsarHahayal", kind: "bank", loginFields: ["username", "password"] },
  { code: "beinleumi", kind: "bank", loginFields: ["username", "password"] },
  { code: "massad", kind: "bank", loginFields: ["username", "password"] },
  { code: "yahav", kind: "bank", loginFields: ["username", "nationalID", "password"] },
  { code: "pagi", kind: "bank", loginFields: ["username", "password"] },
  { code: "union", kind: "bank", loginFields: ["username", "password"] },
  { code: "oneZero", kind: "bank", loginFields: ["email", "password", "phoneNumber"] },
  { code: "isracard", kind: "card", loginFields: ["id", "card6Digits", "password"] },
  { code: "amex", kind: "card", loginFields: ["id", "card6Digits", "password"] },
  { code: "max", kind: "card", loginFields: ["username", "password"] },
  { code: "visaCal", kind: "card", loginFields: ["username", "password"] },
  { code: "behatsdaa", kind: "card", loginFields: ["id", "password"] },
  { code: "beyahadBishvilha", kind: "card", loginFields: ["id", "password"] },
];

export function findProvider(code: string): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find((entry) => entry.code === code);
}
