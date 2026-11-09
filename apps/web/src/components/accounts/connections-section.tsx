"use client";

/**
 * Bank and card sync connections — owned by Track A (agent and connections).
 * One card per connection with a one-line status (syncing / missing credentials / failed / last
 * sync); the page-level "needs action" block (needs-action-block.tsx) sits above this section.
 * Sync state and live ids come from the page, which polls while a job runs.
 */
import type { Connection, Job, ProviderCatalogEntry } from "@moneytrack/contracts";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  findInvalidStatementFiles,
  sortStatementFiles,
  summarizeStatementUploads,
  supportsStatementUpload,
  type StatementUploadResult,
} from "@/components/accounts/statement-upload";
import { EmptyState } from "@/components/empty-state";
import { ConnectionModal } from "@/components/accounts/connection-modal";
import { OtpModal } from "@/components/accounts/otp-modal";
import { connectionStatus } from "@/components/accounts/accounts-needs-action";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { deleteConnection, uploadStatement } from "@/lib/api-client";
import { apiUrl } from "@/lib/base-path";
import { formatIsoDateTime } from "@/lib/dates";
import { providerLabel } from "@/lib/provider-labels";
import he from "@/locales/he.json";
import type { SyncConnectionState } from "@/components/sync/auto-sync-api";
import { describeSyncError } from "@/components/sync/sync-error-messages";

type ConnectionsSectionProps = {
  connections: Connection[];
  jobs: Job[];
  providers: ProviderCatalogEntry[];
  syncStates: SyncConnectionState[];
  /** Connections with a running sync (see liveConnectionIds). */
  liveIds: ReadonlySet<string>;
  otpJob: Job | null;
  connectionModalOpen: boolean;
  editingConnection: Connection | null;
  onOpenConnectionModal: (connection: Connection | null) => void;
  onCloseConnectionModal: () => void;
  onSync: (connectionId: string) => void;
  onSaved: () => void;
  onOtpClose: () => void;
  onOtpOpen: (job: Job) => void;
};

function jobStatusLabel(status: Job["status"]): string {
  switch (status) {
    case "queued":
      return "בתור";
    case "running":
      return "רץ";
    case "otp_required":
      return "נדרש OTP";
    case "done":
      return "הושלם";
    case "failed":
      return "נכשל";
    default:
      return status;
  }
}

function readJobConnectionId(job: Job): string | null {
  const connectionId = job.payloadJson.connectionId;
  return typeof connectionId === "string" ? connectionId : null;
}

function latestScrapeJob(jobs: Job[], connectionId: string): Job | undefined {
  return jobs
    .filter((job) => job.kind === "scrape" && readJobConnectionId(job) === connectionId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function failureReason(job: Job, providerCode: string, state?: SyncConnectionState): string {
  if (job.errorClass === "CONNECTION_DELETED") {
    return "החיבור נמחק";
  }
  // The job row only says SYNC_FAILED; the state endpoint resolves the scrape run's real class.
  return describeSyncError(state?.failure?.errorClass ?? job.errorClass, providerCode).text;
}

function statusText(connection: Connection, status: ReturnType<typeof connectionStatus>): string {
  const copy = he.accountsUx.status;
  switch (status) {
    case "syncing":
      return copy.syncing;
    case "disabled":
      return copy.disabled;
    case "credentials_missing":
      return copy.credentialsMissing;
    case "failed":
      return copy.failed;
    case "manual_upload":
      return he.sync.banner.statementNotice;
    case "never":
      return copy.never;
    default:
      return copy.lastSuccess.replace(
        "{date}",
        connection.lastSuccessAt ? formatIsoDateTime(connection.lastSuccessAt) : "",
      );
  }
}

async function patchConnection(id: string, body: { enabled: boolean }): Promise<Connection> {
  const response = await fetch(apiUrl(`/api/connections/${id}`), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as Connection & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
}

export function ConnectionsSection({
  connections,
  jobs,
  providers,
  syncStates,
  liveIds,
  otpJob,
  connectionModalOpen,
  editingConnection,
  onOpenConnectionModal,
  onCloseConnectionModal,
  onSync,
  onSaved,
  onOtpClose,
  onOtpOpen,
}: ConnectionsSectionProps) {
  const { showToast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetId = useRef<string | null>(null);

  // A details element targeted by #statement-help (banner link) does not open itself.
  useEffect(() => {
    if (window.location.hash !== "#statement-help") return;
    const el = document.getElementById("statement-help") as HTMLDetailsElement | null;
    if (el) {
      el.open = true;
      el.scrollIntoView({ block: "center" });
    }
  }, [connections.length]);

  const bankConnections = connections.filter((c) => c.providerCode !== "manual");

  async function handleToggleEnabled(connection: Connection) {
    setBusyId(connection.id);
    try {
      await patchConnection(connection.id, { enabled: !connection.enabled });
      showToast(connection.enabled ? "החיבור הושבת" : "החיבור הופעל", "success");
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "שגיאה בעדכון החיבור", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) {
      return;
    }
    const targetId = deleteTarget.id;
    setDeleteTarget(null);
    setBusyId(targetId);
    try {
      await deleteConnection(targetId);
      showToast("החיבור נמחק", "success");
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "שגיאה במחיקת החיבור", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const copy = he.accountsUx.statementUpload;
    const input = event.target;
    const files = Array.from(input.files ?? []);
    const connectionId = uploadTargetId.current;
    input.value = "";
    uploadTargetId.current = null;
    if (files.length === 0 || !connectionId) {
      return;
    }
    const invalid = findInvalidStatementFiles(files);
    if (invalid.length > 0) {
      const names = invalid
        .map((f) => `${f.name} (${f.check === "type" ? copy.errorType : copy.errorSize})`)
        .join(", ");
      showToast(copy.errorInvalidFiles.replace("{files}", names), "error");
      return;
    }
    const ordered = sortStatementFiles(files);
    const results: StatementUploadResult[] = [];
    setBusyId(connectionId);
    try {
      for (const [index, file] of ordered.entries()) {
        setUploadProgress(
          ordered.length > 1
            ? copy.progress
                .replace("{current}", String(index + 1))
                .replace("{total}", String(ordered.length))
            : null,
        );
        try {
          const result = await uploadStatement(connectionId, file);
          results.push({ name: file.name, ingested: result.ingested });
        } catch (err) {
          results.push({
            name: file.name,
            error: err instanceof Error ? err.message : copy.errorGeneric,
          });
        }
      }
      const { ingested, failed } = summarizeStatementUploads(results);
      const failures = failed.map((f) => `${f.name}: ${f.error}`).join("; ");
      if (failed.length === 0) {
        showToast(copy.success.replace("{count}", String(ingested)), "success");
      } else if (failed.length === results.length) {
        showToast(copy.allFailed.replace("{failures}", failures), "error");
      } else {
        showToast(
          copy.partialSuccess.replace("{count}", String(ingested)).replace("{failures}", failures),
          "error",
        );
      }
      onSaved();
    } finally {
      setUploadProgress(null);
      setBusyId(null);
    }
  }

  return (
    <>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl text-text-primary">{he.accountsUx.connections.title}</h2>
          <button
            type="button"
            onClick={() => onOpenConnectionModal(null)}
            className="min-h-11 rounded-lg border border-border-subtle bg-surface-card px-4 text-sm font-medium hover:bg-surface-elevated"
          >
            {he.accountsUx.connections.add}
          </button>
        </div>

        {bankConnections.length === 0 ? (
          <EmptyState
            title="אין חיבורים"
            description="הוסיפו בנק או חברת אשראי, הזינו את פרטי ההתחברות ולחצו סנכרון."
          />
        ) : (
          <ul className="space-y-3">
            {bankConnections.map((connection) => {
              const latestJob = latestScrapeJob(jobs, connection.id);
              const state = syncStates.find((s) => s.connectionId === connection.id);
              const isBusy = busyId === connection.id;
              const isLive = liveIds.has(connection.id);
              const status = connectionStatus(connection, state, isLive);

              return (
                <li
                  key={connection.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border-subtle bg-surface-card px-4 py-4 shadow-sm"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-text-primary">
                      {providerLabel(connection.providerCode)}
                    </p>
                    <p
                      className={`flex items-center gap-1.5 text-sm ${
                        status === "credentials_missing" || status === "failed"
                          ? "text-brand-orange-500"
                          : "text-text-secondary"
                      }`}
                    >
                      {status === "syncing" ? (
                        <Icon icon={LoaderCircle} size={14} className="animate-spin" />
                      ) : null}
                      {statusText(connection, status)}
                    </p>
                    <label className="flex items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={connection.enabled}
                        disabled={isBusy}
                        onChange={() => void handleToggleEnabled(connection)}
                        className="size-4 rounded border-border-subtle"
                      />
                      {connection.enabled ? "פעיל" : "מושבת"}
                    </label>
                    {latestJob?.status === "failed" &&
                    !isLive &&
                    !supportsStatementUpload(connection.providerCode) &&
                    !(latestJob.errorClass === "CREDENTIALS_MISSING" && !connection.credentialsSet) ? (
                      <p className="text-sm leading-6 text-brand-orange-500">
                        {failureReason(latestJob, connection.providerCode, state)}
                      </p>
                    ) : null}
                    {supportsStatementUpload(connection.providerCode) && status === "manual_upload" ? (
                      <p className="text-sm leading-6 text-text-secondary">
                        {he.accountsUx.statementUpload.helper}
                      </p>
                    ) : null}
                    {latestJob?.status === "otp_required" ? (
                      <p className="text-xs text-text-secondary">
                        סטטוס: {jobStatusLabel(latestJob.status)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenConnectionModal(connection)}
                      className={`min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-surface-elevated ${
                        connection.credentialsSet
                          ? "border-border-subtle"
                          : "border-brand-orange-500 bg-brand-orange-500/10 font-semibold ring-2 ring-brand-orange-500/40"
                      }`}
                    >
                      פרטי התחברות
                    </button>
                    <button
                      type="button"
                      disabled={!connection.enabled || !connection.credentialsSet || isLive || isBusy}
                      onClick={() => onSync(connection.id)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-blue-500 px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {isLive ? (
                        <>
                          <Icon icon={LoaderCircle} size={16} className="animate-spin" />
                          {he.accountsUx.status.syncing}
                        </>
                      ) : (
                        he.accountsUx.needsAction.sync
                      )}
                    </button>
                    {supportsStatementUpload(connection.providerCode) ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        aria-label={he.accountsUx.statementUpload.ariaLabel.replace(
                          "{provider}",
                          providerLabel(connection.providerCode),
                        )}
                        onClick={() => {
                          uploadTargetId.current = connection.id;
                          fileInputRef.current?.click();
                        }}
                        className="min-h-11 rounded-lg border border-border-subtle px-4 text-sm font-medium hover:bg-surface-elevated disabled:opacity-50"
                      >
                        {isBusy ? (uploadProgress ?? he.accountsUx.statementUpload.uploading) : he.accountsUx.statementUpload.button}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setDeleteTarget(connection)}
                      className="min-h-11 rounded-lg border border-brand-orange-500/40 px-4 text-sm font-medium text-brand-orange-500 hover:bg-brand-orange-500/10 disabled:opacity-50"
                    >
                      מחק
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {connections.some((c) => supportsStatementUpload(c.providerCode)) ? (
          <details
            id="statement-help"
            className="rounded-lg border border-border-subtle p-3 text-sm text-text-secondary open:bg-surface-elevated target:ring-2 target:ring-brand-blue-500/40"
          >
            <summary className="flex min-h-11 cursor-pointer items-center font-medium text-text-primary">
              {he.accountsUx.statementUpload.helpTitle}
            </summary>
            <ol className="list-decimal space-y-1 ps-5 leading-6">
              {he.accountsUx.statementUpload.helpSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="mt-2 leading-6">{he.accountsUx.statementUpload.helpNote}</p>
          </details>
        ) : null}
      </section>

      {jobs.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-xl text-text-primary">סנכרונים אחרונים</h2>
          <ul className="space-y-2">
            {jobs.slice(0, 5).map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm"
              >
                <span className="text-text-secondary" dir="ltr">
                  {String(job.payloadJson.connectionId ?? "").slice(0, 8)}…
                </span>
                <span className="font-medium text-text-primary">{jobStatusLabel(job.status)}</span>
                {job.status === "otp_required" ? (
                  <button
                    type="button"
                    onClick={() => onOtpOpen(job)}
                    className="text-brand-orange-500 underline"
                  >
                    הזן OTP
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void handleFileChosen(event)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="מחיקת חיבור"
        message="למחוק את החיבור? פרטי ההתחברות יוסרו מהמערכת. אם כבר סונכרו תנועות, המחיקה תיחסם."
        confirmLabel="מחק"
        tone="danger"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConnectionModal
        open={connectionModalOpen}
        providers={providers}
        existing={editingConnection}
        onClose={onCloseConnectionModal}
        onSaved={onSaved}
      />

      <OtpModal
        open={otpJob !== null}
        jobId={otpJob?.id ?? ""}
        prompt={otpJob?.otpPrompt ?? null}
        onClose={onOtpClose}
        onSubmitted={onSaved}
      />
    </>
  );
}
