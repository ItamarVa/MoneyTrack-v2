"use client";

/**
 * Salary source CRUD for the dashboard inner income ring.
 */
import type { Account, Person, SalarySource } from "@moneytrack/contracts";
import { Pencil, Trash2, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  createSalarySource,
  deleteSalarySource,
  fetchAccounts,
  fetchMerchants,
  fetchPeople,
  fetchSalaryReportingSettings,
  fetchSalarySources,
  reapplySalaryReporting,
  updateSalaryReportingSettings,
  updateSalarySource,
} from "@/lib/api-client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Icon } from "@/components/ui/icon";
import { LabelledField } from "@/components/ui/labelled-field";
import { MerchantPicker } from "@/components/settings/merchant-picker";
import { useToast } from "@/components/ui/toast";

const inputClass =
  "min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm";

export function SalariesPanel() {
  const { showToast } = useToast();
  const [sources, setSources] = useState<SalarySource[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [merchantNames, setMerchantNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [personId, setPersonId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [matchPattern, setMatchPattern] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SalarySource | null>(null);
  const [reportingEnabled, setReportingEnabled] = useState(true);
  const [reportingStartDay, setReportingStartDay] = useState(25);
  const [reportingEndDay, setReportingEndDay] = useState(5);
  const [reportingSaving, setReportingSaving] = useState(false);
  const [reapplying, setReapplying] = useState(false);

  const load = useCallback(async () => {
    try {
      const [salaryRows, peopleRows, accountRows, reportingSettings] = await Promise.all([
        fetchSalarySources(),
        fetchPeople(),
        fetchAccounts(),
        fetchSalaryReportingSettings(),
      ]);
      setReportingEnabled(reportingSettings.enabled);
      setReportingStartDay(reportingSettings.startDay);
      setReportingEndDay(reportingSettings.endDay);
      setSources(salaryRows);
      setPeople(peopleRows);
      setAccounts(accountRows.filter((account) => account.kind === "bank"));

      const merchantIds = [
        ...new Set(salaryRows.map((source) => source.merchantId).filter(Boolean)),
      ] as string[];
      if (merchantIds.length > 0) {
        const names: Record<string, string> = {};
        await Promise.all(
          merchantIds.map(async (merchantId) => {
            const rows = await fetchMerchants({ includeId: merchantId, incomeOnly: true, limit: 1 });
            const match = rows.find((row) => row.id === merchantId);
            if (match) {
              names[merchantId] = match.name;
            }
          }),
        );
        setMerchantNames(names);
      } else {
        setMerchantNames({});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setDisplayName("");
    setPersonId("");
    setAccountId("");
    setMerchantId("");
    setMatchPattern("");
    setEditingId(null);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) return;
    if (!merchantId && !matchPattern.trim()) {
      showToast("יש לבחור מעסיק או להזין טקסט לזיהוי", "error");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateSalarySource(editingId, {
          displayName: trimmed,
          personId: personId || null,
          accountId: accountId || null,
          merchantId: merchantId || null,
          matchPattern: matchPattern.trim() || null,
        });
        showToast("משכורת עודכנה", "success");
      } else {
        await createSalarySource({
          displayName: trimmed,
          personId: personId || null,
          accountId: accountId || null,
          merchantId: merchantId || null,
          matchPattern: matchPattern.trim() || null,
          sortOrder: sources.length,
          enabled: true,
        });
        showToast("משכורת נוספה", "success");
      }
      resetForm();
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בשמירה", "error");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(source: SalarySource) {
    setEditingId(source.id);
    setDisplayName(source.displayName);
    setPersonId(source.personId ?? "");
    setAccountId(source.accountId ?? "");
    setMerchantId(source.merchantId ?? "");
    setMatchPattern(source.matchPattern ?? "");
  }

  async function handleSaveReportingSettings(): Promise<void> {
    if (reportingStartDay < 1 || reportingStartDay > 31 || reportingEndDay < 1 || reportingEndDay > 31) {
      showToast("יש להזין יום בין 1 ל-31", "error");
      return;
    }
    setReportingSaving(true);
    try {
      const settings = await updateSalaryReportingSettings({
        enabled: reportingEnabled,
        startDay: reportingStartDay,
        endDay: reportingEndDay,
      });
      setReportingEnabled(settings.enabled);
      setReportingStartDay(settings.startDay);
      setReportingEndDay(settings.endDay);
      showToast("הגדרות חודש הצגה נשמרו", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בשמירה", "error");
    } finally {
      setReportingSaving(false);
    }
  }

  async function handleReapplyReporting(): Promise<void> {
    setReapplying(true);
    try {
      const result = await reapplySalaryReporting();
      showToast(`הכלל הוחל מחדש על ${result.updated} משכורות`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בהחלה מחדש", "error");
    } finally {
      setReapplying(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteSalarySource(deleteTarget.id);
      setDeleteTarget(null);
      await load();
      showToast("משכורת נמחקה", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה במחיקה", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-5">
      <h2 className="font-display text-lg text-text-primary">משכורות</h2>
      <p className="mt-1 text-sm text-text-muted">
        הגדרת מקורות הכנסה לטבעת הפנימית בלוח הבקרה
      </p>

      <section className="mt-6 space-y-4 rounded-lg border border-border-subtle bg-surface-elevated/40 p-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">כלל חודש הצגה</h3>
          <p className="mt-1 text-xs text-text-muted">
            משכורות בין יום {reportingStartDay} ליום {reportingEndDay} (חוצה חודשים) מוצגות בחודש
            הבא. מחוץ לחלון — לפי תאריך החיוב.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={reportingEnabled}
            onChange={(event) => setReportingEnabled(event.target.checked)}
            disabled={loading || reportingSaving}
          />
          הפעל כלל חודש הצגה אוטומטי
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <LabelledField id="salary-reporting-start" label="יום התחלה">
            <input
              id="salary-reporting-start"
              type="number"
              min={1}
              max={31}
              className={inputClass}
              value={reportingStartDay}
              onChange={(event) => setReportingStartDay(Number(event.target.value))}
              disabled={loading || reportingSaving || !reportingEnabled}
            />
          </LabelledField>
          <LabelledField id="salary-reporting-end" label="יום סיום">
            <input
              id="salary-reporting-end"
              type="number"
              min={1}
              max={31}
              className={inputClass}
              value={reportingEndDay}
              onChange={(event) => setReportingEndDay(Number(event.target.value))}
              disabled={loading || reportingSaving || !reportingEnabled}
            />
          </LabelledField>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || reportingSaving}
            onClick={() => void handleSaveReportingSettings()}
            className="min-h-10 rounded-lg bg-brand-blue-500 px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {reportingSaving ? "שומר…" : "שמור כלל"}
          </button>
          <button
            type="button"
            disabled={loading || reapplying}
            onClick={() => void handleReapplyReporting()}
            className="min-h-10 rounded-lg border border-border-subtle px-4 text-sm text-text-secondary hover:bg-surface-elevated disabled:opacity-60"
          >
            {reapplying ? "מחיל…" : "החל מחדש על כל המשכורות"}
          </button>
        </div>
      </section>

      {loading ? (
        <p className="mt-4 text-sm text-text-muted">טוען…</p>
      ) : (
        <>
          <form onSubmit={handleCreate} className="mt-4 grid gap-4 lg:grid-cols-2">
            <LabelledField id="salary-name" label="שם המשכורת">
              <input
                id="salary-name"
                className={inputClass}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="למשל משכורת ראשית"
                required
              />
            </LabelledField>
            <LabelledField id="salary-person" label="בן משפחה">
              <select
                id="salary-person"
                className={inputClass}
                value={personId}
                onChange={(event) => setPersonId(event.target.value)}
              >
                <option value="">ללא שיוך</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                  </option>
                ))}
              </select>
            </LabelledField>
            <LabelledField id="salary-account" label="חשבון (אופציונלי)">
              <select
                id="salary-account"
                className={inputClass}
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <option value="">כל החשבונות</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName}
                  </option>
                ))}
              </select>
            </LabelledField>
            <MerchantPicker
              id="salary-merchant"
              label="מעסיק / בית עסק"
              value={merchantId}
              onChange={setMerchantId}
              hint="מוצגים רק מעסיקים שמופיעים בהכנסות בחשבון. אפשר גם לזהות לפי טקסט בתיאור למטה."
            />
            <LabelledField id="salary-pattern" label="טקסט בתיאור (אופציונלי)">
              <input
                id="salary-pattern"
                className={inputClass}
                value={matchPattern}
                onChange={(event) => setMatchPattern(event.target.value)}
                placeholder="למשל משכורת"
              />
            </LabelledField>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={saving}
                className="min-h-11 rounded-lg bg-brand-orange-500 px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                {editingId ? "שמירה" : "הוספה"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="min-h-11 rounded-lg border border-border-subtle px-4 text-sm text-text-secondary"
                >
                  ביטול
                </button>
              ) : null}
            </div>
          </form>

          {sources.length > 0 ? (
            <ul className="mt-6 space-y-2">
              {sources.map((source) => (
                <li
                  key={source.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-text-primary">{source.displayName}</p>
                    <p className="text-xs text-text-muted">
                      {[
                        source.personId
                          ? people.find((person) => person.id === source.personId)?.displayName
                          : null,
                        source.merchantId ? merchantNames[source.merchantId] : null,
                        source.matchPattern,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "ללא כללי זיהוי"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`עריכת ${source.displayName}`}
                      onClick={() => startEdit(source)}
                      className="rounded border border-border-subtle p-2 text-text-secondary hover:border-brand-blue-500/40"
                    >
                      <Icon icon={Pencil} size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`מחיקת ${source.displayName}`}
                      onClick={() => setDeleteTarget(source)}
                      className="rounded border border-border-subtle p-2 text-text-secondary hover:border-brand-orange-500/40"
                    >
                      <Icon icon={Trash2} size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-subtle px-4 py-10 text-center">
              <Icon icon={Wallet} size={28} className="text-text-muted" />
              <p className="text-sm text-text-muted">עדיין לא הוגדרו משכורות</p>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="מחיקת משכורת"
        message={`למחוק "${deleteTarget?.displayName}"?`}
        confirmLabel="מחק"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
