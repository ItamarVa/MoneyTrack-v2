"use client";

/**
 * Recent security audit activity from audit_log.
 * Expects GET /api/audit-log returning { entries: AuditLogEntry[] }.
 */
import type { AuditLogEntry } from "@moneytrack/contracts";
import { useEffect, useState } from "react";
import { formatIsoDateTime } from "@/lib/dates";
import { apiUrl } from "@/lib/base-path";

const actionLabels: Record<string, string> = {
  login_success: "התחברות מוצלחת",
  login_failed: "ניסיון התחברות כושל",
  login_lockout: "נעילת חשבון",
  logout: "התנתקות",
  password_changed: "שינוי סיסמה",
  password_change_failed: "שינוי סיסמה נכשל",
  connection_create: "חיבור חדש",
  connection_update: "עדכון חיבור",
  connection_delete: "מחיקת חיבור",
  connection_credentials_set: "עדכון פרטי התחברות",
  account_create: "חשבון חדש",
  account_update: "עדכון חשבון",
  loan_create: "הלוואה חדשה",
  loan_update: "עדכון הלוואה",
  loan_delete: "מחיקת הלוואה",
  loan_track_create: "מסלול הלוואה חדש",
  early_repayment_scenario: "תרחיש פירעון מוקדם",
  card_create: "כרטיס חדש",
  card_update: "עדכון כרטיס",
  card_delete: "מחיקת כרטיס",
  person_create: "בן משפחה חדש",
  person_update: "עדכון בן משפחה",
  person_delete: "מחיקת בן משפחה",
  category_create: "קטגוריה חדשה",
  category_update: "עדכון קטגוריה",
  category_delete: "מחיקת קטגוריה",
  rule_create: "כלל חדש",
  rule_update: "עדכון כלל",
  rule_delete: "מחיקת כלל",
  rules_reclassify: "סיווג מחדש לפי כללים",
  transaction_create_manual: "עסקה ידנית חדשה",
  transaction_update: "עדכון עסקה",
  transaction_delete_manual: "מחיקת עסקה ידנית",
  transaction_split: "פיצול עסקה",
  transaction_link_manual: "קישור עסקות",
  categorization_override: "שינוי קטגוריה",
  categorize_bulk: "סיווג מרוכז",
  ha_user_reset: "איפוס גישת משתמש HA",
  ha_clear_lockouts: "ניקוי נעילות (תצורת add-on)",
  ha_pin_failed: "ניסיון PIN כושל",
  tag_create: "תגית חדשה",
  tag_update: "עדכון תגית",
  tag_delete: "מחיקת תגית",
};

async function fetchAuditLog(): Promise<AuditLogEntry[]> {
  const response = await fetch(apiUrl("/api/audit-log"), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(response.status === 404 ? "שירות יומן פעילות לא זמין" : "שגיאה בטעינת יומן");
  }
  const data = (await response.json()) as { entries: AuditLogEntry[] };
  return data.entries ?? [];
}

export function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setEntries(await fetchAuditLog());
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-5">
      <h2 className="font-display text-lg text-text-primary">פעילות אחרונה</h2>
      <p className="mt-1 text-sm text-text-muted">
        התחברויות, שינויי סיסמה, חיבורים ופעולות רגישות אחרות
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-text-muted">טוען יומן…</p>
      ) : error ? (
        <p className="mt-4 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3 text-sm text-text-muted">
          {error}
        </p>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">אין רשומות ביומן.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border-subtle">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
              <span className="font-medium text-text-primary">
                {actionLabels[entry.action] ?? entry.action}
              </span>
              <time className="text-text-muted">{formatIsoDateTime(entry.createdAt)}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
