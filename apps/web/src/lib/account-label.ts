/**
 * One display label for an account or card: brand name + " ••1234" once.
 * Why: sync names accounts "<providerCode> <last4>" and screens then appended the last four again
 * ("max 1234 ••1234"). A name the user chose is kept as is.
 * Brand names live in locales/he.json (plainUx.brands), not here, per the no-Hebrew-in-source rule.
 * Pure and client-safe. Used by: transaction-source, credit-utils, settings panels, networth.
 */
import he from "@/locales/he.json";

const BRANDS: Record<string, string> = he.plainUx.brands;

/** Brand for a provider code, or undefined when the code is not one we know. */
export function knownBrand(code: string | null | undefined): string | undefined {
  return code ? BRANDS[code] : undefined;
}

type LabelSource = {
  displayName?: string | null;
  institutionCode?: string | null;
  last4?: string | null;
};

export function accountLabel(source: LabelSource): string {
  const code = source.institutionCode?.trim() ?? "";
  const name = source.displayName?.trim() ?? "";
  let last4 = source.last4?.trim() || null;

  // Default sync name: "<code>" or "<code> <4 digits>" in any letter case.
  const defaultName = code ? /^(.+?)(?:\s+(\d{4}))?$/.exec(name) : null;
  const isDefault =
    !name || (defaultName !== null && defaultName[1]!.toLowerCase() === code.toLowerCase());
  if (isDefault && !last4) last4 = defaultName?.[2] ?? null;

  const base = isDefault ? (knownBrand(code) ?? (code || name)) : name;
  return last4 && !base.includes(last4) ? `${base} ••${last4}` : base;
}
