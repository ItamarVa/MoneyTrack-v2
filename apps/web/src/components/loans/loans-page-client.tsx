"use client";

/**
 * Loans and mortgages: tracks, full schedule, principal/interest chart, scenarios, delete.
 */
import type {
  EarlyRepaymentScenarioResponse,
  LoanDetailResponse,
  LoanListResponse,
  LoanScheduleResponse,
  LoanTrack,
} from "@moneytrack/contracts";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LabelledField } from "@/components/ui/labelled-field";
import { useToast } from "@/components/ui/toast";
import {
  createLoan,
  createLoanTrack,
  fetchLoanDetail,
  fetchLoans,
  fetchLoanSchedule,
  saveEarlyRepaymentScenario,
} from "@/lib/api-client";
import { formatIls } from "@/lib/currency";
import { formatShortDate } from "@/lib/dates";
import { LoanScheduleChart } from "./loan-schedule-chart";
import { deleteLoan } from "./loans-api";

const SCENARIOS_KEY = "moneytrack-loan-scenarios";

const loanKindLabels: Record<string, string> = {
  personal: "אישי",
  mortgage: "משכנתא",
  car: "רכב",
  other: "אחר",
};

const rateTypeLabels: Record<string, string> = {
  fixed: "קבוע",
  prime_linked: "פריים",
  cpi_linked_fixed: "צמוד מדד קבוע",
  cpi_linked_variable: "צמוד מדד משתנה",
};

const amortLabels: Record<string, string> = {
  shpitzer: "שפיצר",
  equal_principal: "קרן שווה",
  balloon: "בוליט",
  grace: "גרייס",
};

const cpiLabels: Record<string, string> = {
  known: "מדד ידוע",
  for_month: "מדד בגין",
};

type SavedScenario = EarlyRepaymentScenarioResponse & { loanId: string };

function loadScenarios(loanId: string): SavedScenario[] {
  try {
    const raw = sessionStorage.getItem(`${SCENARIOS_KEY}-${loanId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedScenario[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveScenarios(loanId: string, rows: SavedScenario[]): void {
  sessionStorage.setItem(`${SCENARIOS_KEY}-${loanId}`, JSON.stringify(rows));
}

export function LoansPageClient() {
  const { showToast } = useToast();
  const [loans, setLoans] = useState<LoanListResponse["loans"]>([]);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LoanDetailResponse | null>(null);
  const [schedule, setSchedule] = useState<LoanScheduleResponse | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showTrackForm, setShowTrackForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  /** Below lg: show loan list until user picks a row (list-then-detail). */
  const [mobileListMode, setMobileListMode] = useState(true);

  const [loanForm, setLoanForm] = useState({
    displayName: "",
    lender: "",
    kind: "mortgage",
    originationDate: "",
    originalPrincipal: "",
  });

  const [trackForm, setTrackForm] = useState({
    rateType: "fixed",
    margin: "",
    fixedRate: "",
    termMonths: "360",
    principal: "",
    amortizationMethod: "shpitzer",
    cpiBaseIndexValue: "",
    cpiConvention: "known",
    rateResetMonths: "",
  });

  const [scenarioForm, setScenarioForm] = useState({ name: "", extraPayment: "" });

  const reloadLoans = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchLoans();
      setLoans(data);
      if (!selectedLoanId && data.length > 0) {
        setSelectedLoanId(data[0]!.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינה");
    }
  }, [selectedLoanId]);

  const reloadDetail = useCallback(async (loanId: string) => {
    try {
      const loanDetail = await fetchLoanDetail(loanId);
      setDetail(loanDetail);
      setScenarios(loadScenarios(loanId));
      const firstTrack = loanDetail.tracks[0];
      if (firstTrack) {
        setSelectedTrackId(firstTrack.id);
        const sched = await fetchLoanSchedule(loanId, firstTrack.id);
        setSchedule(sched);
      } else {
        setSelectedTrackId(null);
        setSchedule(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת הלוואה");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await reloadLoans();
      setLoading(false);
    })();
  }, [reloadLoans]);

  useEffect(() => {
    if (!selectedLoanId) {
      setDetail(null);
      setSchedule(null);
      setScenarios([]);
      return;
    }
    void reloadDetail(selectedLoanId);
  }, [selectedLoanId, reloadDetail]);

  async function handleSelectTrack(trackId: string) {
    if (!selectedLoanId) return;
    setSelectedTrackId(trackId);
    try {
      const sched = await fetchLoanSchedule(selectedLoanId, trackId);
      setSchedule(sched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת לוח סילוקין");
    }
  }

  async function handleCreateLoan() {
    if (!loanForm.displayName || !loanForm.lender || !loanForm.originationDate || !loanForm.originalPrincipal) {
      setError("נא למלא את כל השדות");
      return;
    }
    try {
      const created = await createLoan({
        displayName: loanForm.displayName,
        lender: loanForm.lender,
        kind: loanForm.kind as "mortgage",
        originationDate: loanForm.originationDate,
        originalPrincipal: Number(loanForm.originalPrincipal),
      });
      setShowLoanForm(false);
      setLoanForm({
        displayName: "",
        lender: "",
        kind: "mortgage",
        originationDate: "",
        originalPrincipal: "",
      });
      setSelectedLoanId(created.loan.id);
      await reloadLoans();
      setDetail(created);
      showToast("הלוואה נוספה", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה ביצירת הלוואה");
    }
  }

  async function handleCreateTrack() {
    if (!selectedLoanId || !trackForm.termMonths || !trackForm.principal) {
      setError("נא למלא שדות חובה במסלול");
      return;
    }
    try {
      await createLoanTrack(selectedLoanId, {
        rateType: trackForm.rateType as LoanTrack["rateType"],
        margin: trackForm.margin ? Number(trackForm.margin) : null,
        fixedRate: trackForm.fixedRate ? Number(trackForm.fixedRate) : null,
        termMonths: Number(trackForm.termMonths),
        principal: Number(trackForm.principal),
        amortizationMethod: trackForm.amortizationMethod as LoanTrack["amortizationMethod"],
        cpiBaseIndexValue: trackForm.cpiBaseIndexValue ? Number(trackForm.cpiBaseIndexValue) : null,
        cpiConvention: trackForm.cpiConvention as "known",
        rateResetMonths: trackForm.rateResetMonths ? Number(trackForm.rateResetMonths) : null,
      });
      setShowTrackForm(false);
      await reloadDetail(selectedLoanId);
      await reloadLoans();
      showToast("מסלול נוסף", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה ביצירת מסלול");
    }
  }

  async function handleScenario() {
    if (!selectedLoanId || !scenarioForm.name || !scenarioForm.extraPayment) {
      setError("נא למלא שם וסכום לתרחיש");
      return;
    }
    try {
      const result = await saveEarlyRepaymentScenario(selectedLoanId, {
        name: scenarioForm.name,
        extraPayment: Number(scenarioForm.extraPayment),
      });
      const saved: SavedScenario = { ...result, loanId: selectedLoanId };
      const next = [saved, ...scenarios];
      setScenarios(next);
      saveScenarios(selectedLoanId, next);
      setScenarioForm({ name: "", extraPayment: "" });
      showToast("תרחיש נשמר", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בחישוב תרחיש");
    }
  }

  async function handleDeleteLoan() {
    if (!deleteTarget) return;
    try {
      await deleteLoan(deleteTarget);
      setDeleteTarget(null);
      if (selectedLoanId === deleteTarget) {
        setSelectedLoanId(null);
        setDetail(null);
        setSchedule(null);
      }
      await reloadLoans();
      showToast("הלוואה נמחקה", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "שגיאה במחיקה", "error");
    }
  }

  const selectedLoan = useMemo(
    () => loans.find((loan) => loan.id === selectedLoanId) ?? null,
    [loans, selectedLoanId],
  );

  if (loading) {
    return <p className="text-text-muted">טוען הלוואות…</p>;
  }

  function selectLoan(loanId: string) {
    setSelectedLoanId(loanId);
    setMobileListMode(false);
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden sm:space-y-6" dir="rtl">
      {error ? (
        <div className="rounded-lg border border-brand-orange-500/40 bg-brand-orange-500/10 px-4 py-3 text-sm text-brand-orange-500">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ms-3 underline"
          >
            סגירה
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">הלוואות ומשכנתאות</h1>
          <p className="text-sm text-text-muted">מסלולים, לוח סילוקין ותרחישי פירעון מוקדם</p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-brand-orange-500 px-4 py-2 text-sm font-medium text-white"
          onClick={() => setShowLoanForm((v) => !v)}
        >
          הלוואה חדשה
        </button>
      </div>

      {showLoanForm ? (
        <section className="rounded-xl border border-border-subtle bg-surface-card p-4 shadow-soft">
          <h2 className="mb-3 text-sm font-semibold">הוספת הלוואה</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabelledField id="loan-display-name" label="שם תצוגה">
              <input
                id="loan-display-name"
                className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                value={loanForm.displayName}
                onChange={(e) => setLoanForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </LabelledField>
            <LabelledField id="loan-lender" label="מלווה">
              <input
                id="loan-lender"
                className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                value={loanForm.lender}
                onChange={(e) => setLoanForm((f) => ({ ...f, lender: e.target.value }))}
              />
            </LabelledField>
            <LabelledField id="loan-kind" label="סוג">
              <select
                id="loan-kind"
                className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                value={loanForm.kind}
                onChange={(e) => setLoanForm((f) => ({ ...f, kind: e.target.value }))}
              >
                {Object.entries(loanKindLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </LabelledField>
            <LabelledField id="loan-origination-date" label="תאריך מתן">
              <input
                id="loan-origination-date"
                type="date"
                className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                value={loanForm.originationDate}
                onChange={(e) => setLoanForm((f) => ({ ...f, originationDate: e.target.value }))}
              />
            </LabelledField>
            <LabelledField id="loan-principal" label="סכום מקורי (₪)">
              <input
                id="loan-principal"
                type="number"
                min="1"
                className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                value={loanForm.originalPrincipal}
                onChange={(e) => setLoanForm((f) => ({ ...f, originalPrincipal: e.target.value }))}
              />
            </LabelledField>
          </div>
          <button
            type="button"
            className="mt-3 rounded-lg bg-brand-blue-500 px-4 py-2 text-sm text-white"
            onClick={() => void handleCreateLoan()}
          >
            שמירה
          </button>
        </section>
      ) : null}

      {loans.length === 0 ? (
        <EmptyState title="אין הלוואות" description="הוסף הלוואה או משכנתא כדי להתחיל" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
          <aside
            className={[
              "rounded-xl border border-border-subtle bg-surface-card p-3 shadow-soft",
              !mobileListMode ? "max-lg:hidden" : "",
            ].join(" ")}
          >
            <p className="mb-2 text-xs font-semibold text-text-muted">הלוואות</p>
            <ul className="space-y-1">
              {loans.map((loan) => (
                <li key={loan.id}>
                  <button
                    type="button"
                    className={[
                      "min-h-11 w-full rounded-lg px-3 py-2 text-start text-sm",
                      loan.id === selectedLoanId
                        ? "bg-brand-orange-500 text-white"
                        : "hover:bg-surface-elevated",
                    ].join(" ")}
                    onClick={() => selectLoan(loan.id)}
                  >
                    <span className="font-medium">{loan.lender}</span>
                    <span className="block text-xs opacity-80">
                      {loanKindLabels[loan.kind]} · {formatIls(loan.remainingPrincipal)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {detail && selectedLoan ? (
            <div
              className={[
                "min-w-0 space-y-4",
                mobileListMode ? "max-lg:hidden" : "",
              ].join(" ")}
            >
              <button
                type="button"
                className="flex min-h-11 items-center gap-2 text-sm font-medium text-brand-blue-500 lg:hidden"
                onClick={() => setMobileListMode(true)}
              >
                ← חזרה לרשימת הלוואות
              </button>
              <section className="rounded-xl border border-border-subtle bg-surface-card p-4 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{detail.account.displayName}</h2>
                    <p className="text-sm text-text-muted">
                      {detail.loan.lender} · {loanKindLabels[detail.loan.kind]} · מתאריך{" "}
                      {formatShortDate(detail.loan.originationDate)}
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="text-end">
                      <p className="text-xs text-text-muted">יתרה לסילוק</p>
                      <p className="text-xl font-semibold">
                        <bdi dir="ltr">{formatIls(detail.remainingPrincipal)}</bdi>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(selectedLoanId)}
                      className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-border-subtle text-brand-orange-500 hover:bg-surface-elevated"
                      aria-label="מחיקת הלוואה"
                    >
                      <Trash2 className="size-5" aria-hidden />
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-3 rounded-lg border border-border-subtle px-3 py-2 text-sm"
                  onClick={() => setShowTrackForm((v) => !v)}
                >
                  הוסף מסלול
                </button>
              </section>

              {showTrackForm ? (
                <section className="rounded-xl border border-border-subtle bg-surface-card p-4 shadow-soft">
                  <h3 className="mb-3 text-sm font-semibold">מסלול חדש</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <LabelledField id="track-rate-type" label="סוג ריבית">
                      <select
                        id="track-rate-type"
                        className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                        value={trackForm.rateType}
                        onChange={(e) => setTrackForm((f) => ({ ...f, rateType: e.target.value }))}
                      >
                        {Object.entries(rateTypeLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </LabelledField>
                    <LabelledField id="track-amort" label="שיטת סילוק">
                      <select
                        id="track-amort"
                        className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                        value={trackForm.amortizationMethod}
                        onChange={(e) => setTrackForm((f) => ({ ...f, amortizationMethod: e.target.value }))}
                      >
                        {Object.entries(amortLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </LabelledField>
                    <LabelledField id="track-cpi" label="מדד">
                      <select
                        id="track-cpi"
                        className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                        value={trackForm.cpiConvention}
                        onChange={(e) => setTrackForm((f) => ({ ...f, cpiConvention: e.target.value }))}
                      >
                        {Object.entries(cpiLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </LabelledField>
                    <LabelledField id="track-fixed-rate" label="ריבית קבועה (%)">
                      <input
                        id="track-fixed-rate"
                        type="number"
                        step="0.01"
                        className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                        value={trackForm.fixedRate}
                        onChange={(e) => setTrackForm((f) => ({ ...f, fixedRate: e.target.value }))}
                      />
                    </LabelledField>
                    <LabelledField id="track-margin" label="מרווח פריים (%)">
                      <input
                        id="track-margin"
                        type="number"
                        step="0.01"
                        className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                        value={trackForm.margin}
                        onChange={(e) => setTrackForm((f) => ({ ...f, margin: e.target.value }))}
                      />
                    </LabelledField>
                    <LabelledField id="track-term" label="תקופה (חודשים)">
                      <input
                        id="track-term"
                        type="number"
                        className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                        value={trackForm.termMonths}
                        onChange={(e) => setTrackForm((f) => ({ ...f, termMonths: e.target.value }))}
                      />
                    </LabelledField>
                    <LabelledField id="track-principal" label="קרן מסלול (₪)">
                      <input
                        id="track-principal"
                        type="number"
                        className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                        value={trackForm.principal}
                        onChange={(e) => setTrackForm((f) => ({ ...f, principal: e.target.value }))}
                      />
                    </LabelledField>
                    <LabelledField id="track-cpi-base" label="מדד בסיס">
                      <input
                        id="track-cpi-base"
                        type="number"
                        step="0.01"
                        className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                        value={trackForm.cpiBaseIndexValue}
                        onChange={(e) => setTrackForm((f) => ({ ...f, cpiBaseIndexValue: e.target.value }))}
                      />
                    </LabelledField>
                    <LabelledField id="track-reset" label="איפוס ריבית (חודשים)">
                      <input
                        id="track-reset"
                        type="number"
                        className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                        value={trackForm.rateResetMonths}
                        onChange={(e) => setTrackForm((f) => ({ ...f, rateResetMonths: e.target.value }))}
                      />
                    </LabelledField>
                  </div>
                  <button
                    type="button"
                    className="mt-3 rounded-lg bg-brand-blue-500 px-4 py-2 text-sm text-white"
                    onClick={() => void handleCreateTrack()}
                  >
                    שמירת מסלול
                  </button>
                </section>
              ) : null}

              {detail.tracks.length > 0 ? (
                <section className="rounded-xl border border-border-subtle bg-surface-card p-4 shadow-soft">
                  <h3 className="mb-3 text-sm font-semibold">מסלולים</h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.tracks.map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        className={[
                          "rounded-lg px-3 py-2 text-sm",
                          track.id === selectedTrackId
                            ? "bg-brand-navy-700 text-white"
                            : "border border-border-subtle",
                        ].join(" ")}
                        onClick={() => void handleSelectTrack(track.id)}
                      >
                        {rateTypeLabels[track.rateType]} · {formatIls(track.principal)}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {schedule ? (
                <>
                  <LoanScheduleChart schedule={schedule} />
                  <section className="rounded-xl border border-border-subtle bg-surface-card p-4 shadow-soft">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">לוח סילוקין מלא</h3>
                      <p className="text-xs text-text-muted">
                        ריבית מצטברת <bdi dir="ltr">{formatIls(schedule.totalInterest)}</bdi>
                      </p>
                    </div>
                    <div className="max-h-96 overflow-x-auto overflow-y-auto">
                      <table className="min-w-full text-sm">
                        <thead className="sticky top-0 bg-surface-card">
                          <tr className="border-b border-border-subtle text-text-muted">
                            <th className="px-2 py-2 text-start">#</th>
                            <th className="px-2 py-2 text-start">תאריך</th>
                            <th className="px-2 py-2 text-start">קרן</th>
                            <th className="px-2 py-2 text-start">ריבית</th>
                            <th className="px-2 py-2 text-start">מדד</th>
                            <th className="px-2 py-2 text-start">תשלום</th>
                            <th className="px-2 py-2 text-start">יתרה</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedule.rows.map((row) => (
                            <tr key={row.periodIndex} className="border-b border-border-subtle/60">
                              <td className="px-2 py-2">{row.periodIndex + 1}</td>
                              <td className="px-2 py-2">{formatShortDate(row.dueDate)}</td>
                              <td className="px-2 py-2"><bdi dir="ltr">{formatIls(row.principalPart)}</bdi></td>
                              <td className="px-2 py-2"><bdi dir="ltr">{formatIls(row.interestPart)}</bdi></td>
                              <td className="px-2 py-2"><bdi dir="ltr">{formatIls(row.cpiAdjustment)}</bdi></td>
                              <td className="px-2 py-2"><bdi dir="ltr">{formatIls(row.totalPayment)}</bdi></td>
                              <td className="px-2 py-2"><bdi dir="ltr">{formatIls(row.remainingPrincipal)}</bdi></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              ) : null}

              <section className="rounded-xl border border-border-subtle bg-surface-card p-4 shadow-soft">
                <h3 className="mb-3 text-sm font-semibold">פירעון מוקדם — מה אם?</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <LabelledField id="scenario-name" label="שם תרחיש">
                    <input
                      id="scenario-name"
                      className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                      value={scenarioForm.name}
                      onChange={(e) => setScenarioForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </LabelledField>
                  <LabelledField id="scenario-extra" label="סכום נוסף (₪)">
                    <input
                      id="scenario-extra"
                      type="number"
                      min="1"
                      className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                      value={scenarioForm.extraPayment}
                      onChange={(e) => setScenarioForm((f) => ({ ...f, extraPayment: e.target.value }))}
                    />
                  </LabelledField>
                  <div className="flex items-end">
                    <button
                      type="button"
                      className="min-h-11 w-full rounded-lg bg-brand-navy-700 px-4 py-2 text-sm text-white"
                      onClick={() => void handleScenario()}
                    >
                      חישוב ושמירה
                    </button>
                  </div>
                </div>

                {scenarios.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {scenarios.map((row) => (
                      <li
                        key={row.scenario.id}
                        className="rounded-lg bg-surface-elevated px-4 py-3 text-sm"
                      >
                        <p className="font-medium">{row.scenario.name}</p>
                        <p className="text-text-secondary">
                          תשלום נוסף <bdi dir="ltr">{formatIls(row.scenario.extraPayment)}</bdi>
                          · חיסכון בריבית <bdi dir="ltr">{formatIls(row.interestSaved)}</bdi>
                          · {row.monthsSaved} חודשים
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-text-muted">אין תרחישים שמורים עדיין.</p>
                )}
              </section>
            </div>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="מחיקת הלוואה"
        message="הפעולה תמחק את ההלוואה, כל המסלולים ולוח הסילוקין. לא ניתן לבטל."
        confirmLabel="מחיקה"
        tone="danger"
        onConfirm={() => void handleDeleteLoan()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
