"use client";

/**
 * Settings "connections" tab: the existing connections UI (list, modals, needs-action block,
 * statement upload and #statement-help) fed by useConnectionsData. Accounts page no longer owns it.
 */
import type { Connection } from "@moneytrack/contracts";
import { useState } from "react";
import { ConnectionsSection } from "@/components/accounts/connections-section";
import { NeedsActionBlock } from "@/components/accounts/needs-action-block";
import { SkeletonPanel } from "@/components/ui/skeleton";
import { useConnectionsData } from "./use-connections-data";

export function ConnectionsPanel() {
  const data = useConnectionsData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Connection | null>(null);

  function openCredentials(connection: Connection | null) {
    setEditing(connection);
    setModalOpen(true);
  }

  return (
    <div className="space-y-8">
      {data.error ? (
        <p className="rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-brand-orange-500">
          {data.error}
        </p>
      ) : null}
      {data.loading ? (
        <SkeletonPanel lines={4} />
      ) : (
        <>
          <NeedsActionBlock
            items={data.needsAction}
            connections={data.connections}
            onEnterCredentials={openCredentials}
            onSync={(id) => void data.sync(id)}
          />
          <ConnectionsSection
            connections={data.connections}
            jobs={data.jobs}
            providers={data.providers}
            syncStates={data.syncStates}
            liveIds={data.liveIds}
            otpJob={data.otpJob}
            connectionModalOpen={modalOpen}
            editingConnection={editing}
            onOpenConnectionModal={openCredentials}
            onCloseConnectionModal={() => {
              setModalOpen(false);
              setEditing(null);
            }}
            onSync={(id) => void data.sync(id)}
            onSaved={() => void data.reload()}
            onOtpClose={() => data.setOtpJob(null)}
            onOtpOpen={data.setOtpJob}
          />
        </>
      )}
    </div>
  );
}
