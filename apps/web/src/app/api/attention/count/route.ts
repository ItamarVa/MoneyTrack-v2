/**
 * GET /api/attention/count -> { count }: sync problems + uncategorized merchants + open alerts.
 * Why: one number for the nav badge. Reuses the sibling GET handlers (each runs its own guardApi)
 * so the rules stay in one place; countAttention in components/attention holds the arithmetic.
 * Gotcha: a non-OK sibling response (e.g. 401) is passed through unchanged.
 */
import type { Alert, Connection, UncategorizedMerchant } from "@moneytrack/contracts";
import { NextResponse } from "next/server";
import { GET as getAlerts } from "@/app/api/alerts/route";
import { GET as getClassifyUncategorized } from "@/app/api/classify/uncategorized/route";
import { GET as getConnections } from "@/app/api/connections/route";
import { GET as getSyncState } from "@/app/api/sync/auto/route";
import { countAttention } from "@/components/attention/attention-logic";
import type { AutoSyncStateResponse } from "@/components/sync/auto-sync-api";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const [connectionsRes, stateRes, merchantsRes, alertsRes] = await Promise.all([
    getConnections(),
    getSyncState(),
    getClassifyUncategorized(),
    getAlerts(),
  ]);
  for (const res of [connectionsRes, stateRes, merchantsRes, alertsRes]) {
    if (!res.ok) return res;
  }

  const [connections, state, merchants, alerts] = await Promise.all([
    connectionsRes.json() as Promise<{ connections: Connection[] }>,
    stateRes.json() as Promise<AutoSyncStateResponse>,
    merchantsRes.json() as Promise<{ merchants: UncategorizedMerchant[] }>,
    alertsRes.json() as Promise<{ alerts: Alert[] }>,
  ]);

  return NextResponse.json({
    count: countAttention({
      connections: connections.connections,
      states: state.connections,
      merchants: merchants.merchants,
      alerts: alerts.alerts,
    }),
  });
}
