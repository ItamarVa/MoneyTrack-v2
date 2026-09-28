"use client";



/**

 * Bank and card sync connections — owned by Track A (agent and connections).

 */

import type { Connection, Job, ProviderCatalogEntry } from "@moneytrack/contracts";

import { useState } from "react";

import { EmptyState } from "@/components/empty-state";

import { ConnectionModal } from "@/components/accounts/connection-modal";

import { OtpModal } from "@/components/accounts/otp-modal";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useToast } from "@/components/ui/toast";

import { deleteConnection } from "@/lib/api-client";
import { apiUrl } from "@/lib/base-path";

import { formatIsoDateTime } from "@/lib/dates";

import { providerLabel } from "@/lib/provider-labels";



type ConnectionsSectionProps = {

  connections: Connection[];

  jobs: Job[];

  providers: ProviderCatalogEntry[];

  syncingId: string | null;

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



function failureReason(job: Job): string {

  if (job.errorClass === "CONNECTION_DELETED") {

    return "החיבור נמחק";

  }

  return job.errorClass ?? "שגיאה לא ידועה";

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

  syncingId,

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



  return (

    <>

      <section className="space-y-4">

        <div className="flex flex-wrap items-center justify-between gap-3">

          <h2 className="font-display text-xl text-text-primary">חיבורים לסנכרון</h2>

          <button

            type="button"

            onClick={() => onOpenConnectionModal(null)}

            className="min-h-11 rounded-lg border border-border-subtle bg-surface-card px-4 text-sm font-medium hover:bg-surface-elevated"

          >

            + חיבור בנק או אשראי

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

              const isBusy = busyId === connection.id;



              return (

                <li

                  key={connection.id}

                  className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border-subtle bg-surface-card px-4 py-4 shadow-sm"

                >

                  <div className="min-w-0 space-y-1">

                    <p className="font-medium text-text-primary">

                      {providerLabel(connection.providerCode)}

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

                    {latestJob?.status === "done" ? (

                      <p className="text-xs text-text-muted">

                        סנכרון אחרון: {formatIsoDateTime(latestJob.updatedAt)}

                      </p>

                    ) : null}

                    {latestJob?.status === "failed" ? (

                      <p className="text-xs text-brand-orange-500">

                        כשלון: {failureReason(latestJob)}

                      </p>

                    ) : null}

                    {latestJob &&

                    (latestJob.status === "queued" ||

                      latestJob.status === "running" ||

                      latestJob.status === "otp_required") ? (

                      <p className="text-xs text-text-secondary">

                        סטטוס: {jobStatusLabel(latestJob.status)}

                      </p>

                    ) : null}

                  </div>

                  <div className="flex flex-wrap gap-2">

                    <button

                      type="button"

                      onClick={() => onOpenConnectionModal(connection)}

                      className="min-h-11 rounded-lg border border-border-subtle px-4 text-sm font-medium hover:bg-surface-elevated"

                    >

                      פרטי התחברות

                    </button>

                    <button

                      type="button"

                      disabled={!connection.enabled || syncingId === connection.id || isBusy}

                      onClick={() => onSync(connection.id)}

                      className="min-h-11 rounded-lg bg-brand-blue-500 px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"

                    >

                      {syncingId === connection.id ? "מתחיל…" : "סנכרון"}

                    </button>

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

                <span className="font-medium text-text-primary">

                  {jobStatusLabel(job.status)}

                </span>

                {job.status === "failed" && job.errorClass ? (

                  <span className="text-xs text-brand-orange-500" dir="ltr">

                    {job.errorClass}

                  </span>

                ) : null}

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

