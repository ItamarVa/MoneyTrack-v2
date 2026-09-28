/**
 * Hebrew display names for scraper providers and their login fields.
 * Keyed by the canonical codes in `PROVIDER_CATALOG`; the lowercase aliases at
 * the bottom exist only for connection rows created before the picker landed.
 * Field hints matter: several banks label the same box differently than the
 * scraper's internal field name, so users cannot guess what to type.
 */
import type { ProviderLoginField } from "@moneytrack/contracts";

export const providerLabels: Record<string, string> = {
  hapoalim: "בנק הפועלים",
  leumi: "בנק לאומי",
  mizrahi: "בנק מזרחי טפחות",
  discount: "בנק דיסקונט",
  mercantile: "בנק מרכנתיל",
  otsarHahayal: "בנק אוצר החייל",
  beinleumi: "הבנק הבינלאומי",
  massad: "בנק מסד",
  yahav: "בנק יהב",
  pagi: 'בנק פאג"י',
  union: "בנק אגוד",
  oneZero: "One Zero",
  isracard: "ישראכרט",
  amex: "אמריקן אקספרס",
  max: "max",
  visaCal: "כאל",
  behatsdaa: "בהצדעה",
  beyahadBishvilha: "ביחד בשבילך",
  onezero: "One Zero",
  visacal: "כאל",
};

type FieldCopy = { label: string; hint?: string; numeric?: boolean };

export const loginFieldCopy: Record<ProviderLoginField, FieldCopy> = {
  userCode: { label: "קוד משתמש" },
  username: { label: "שם משתמש" },
  password: { label: "סיסמה" },
  id: { label: "מספר תעודת זהות", numeric: true },
  num: { label: "מספר מזהה", hint: "השדה השלישי במסך ההתחברות של הבנק", numeric: true },
  card6Digits: { label: "6 הספרות האחרונות של הכרטיס", numeric: true },
  nationalID: { label: "מספר תעודת זהות", numeric: true },
  email: { label: "כתובת אימייל" },
  phoneNumber: { label: "מספר טלפון", hint: "לקבלת קוד אימות", numeric: true },
};

export function providerLabel(code: string): string {
  return providerLabels[code] ?? code;
}
