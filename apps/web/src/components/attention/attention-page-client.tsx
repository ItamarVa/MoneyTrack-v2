"use client";

/**
 * "Needs your attention" page for the phone user: sync problems, quick classify, open alerts,
 * or an all-clear message. Loads everything once; blocks report changes back through callbacks.
 * Gotcha: the classify list is a snapshot, so finishing it never flips the page to "all clear" mid-flow.
 */
import type { Alert, UncategorizedMerchant } from "@moneytrack/contracts";
import { CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { liveConnectionIds, selectNeedsAction, type NeedsActionItem } from "@/components/accounts/accounts-needs-action";
import { AlertsBlock } from "@/components/attention/alerts-block";
import { ClassifyBlock } from "@/components/attention/classify-block";
import { SyncBlock } from "@/components/attention/sync-block";
import { fetchAutoSyncState, type SyncConnectionState } from "@/components/sync/auto-sync-api";
import { Icon } from "@/components/ui/icon";
import { fetchAlerts, fetchConnections, fetchUncategorizedMerchants } from "@/lib/api-client";
import he from "@/locales/he.json";

const copy = he.attention;

type Loaded = { sync: NeedsActionItem[]; merchants: UncategorizedMerchant[]; alerts: Alert[] };

async function loadAll(): Promise<Loaded> {
  const [connections, merchants, alerts, states] = await Promise.all([
    fetchConnections(),
    fetchUncategorizedMerchants(),
    fetchAlerts(),
    // ponytail: the state endpoint only adds failure reasons; without it the block still works
    fetchAutoSyncState().then((r) => r.connections).catch(() => [] as SyncConnectionState[]),
  ]);
  return {
    sync: selectNeedsAction(connections, states, liveConnectionIds(states, [])),
    merchants,
    alerts,
  };
}

export function AttentionPageClient() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    loadAll().then(setData, () => setFailed(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const heading = <h1 className="font-display text-2xl text-text-primary md:text-3xl">{copy.title}</h1>;

  if (failed) {
    return (
      <div className="space-y-4">
        {heading}
        <div className="space-y-3 rounded-card border border-brand-orange-500/40 bg-surface-card px-6 py-8 text-center">
          <p className="text-brand-orange-500">{copy.loadError}</p>
          <button type="button" onClick={load} className="min-h-11 px-4 font-semibold text-brand-blue-500">
            {copy.retry}
          </button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        {heading}
        <div className="h-48 animate-pulse rounded-card bg-surface-card" aria-hidden="true" />
      </div>
    );
  }

  const nothing = data.sync.length === 0 && data.merchants.length === 0 && data.alerts.length === 0;
  if (nothing) {
    return (
      <div className="space-y-4">
        {heading}
        <div className="flex flex-col items-center gap-3 rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center">
          <Icon icon={CheckCircle2} size={48} className="text-brand-blue-500" />
          <h2 className="font-display text-xl text-text-primary">{copy.allClear.title}</h2>
          <p className="text-sm text-text-muted">{copy.allClear.description}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      {heading}
      <SyncBlock items={data.sync} />
      <ClassifyBlock merchants={data.merchants} />
      <AlertsBlock
        alerts={data.alerts}
        onDismissed={(id) =>
          setData((current) =>
            current ? { ...current, alerts: current.alerts.filter((a) => a.id !== id) } : current,
          )
        }
      />
    </div>
  );
}
