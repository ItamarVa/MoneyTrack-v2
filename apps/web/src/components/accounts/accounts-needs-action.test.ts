import type { Job } from "@moneytrack/contracts";
import { describe, expect, it } from "vitest";
import type { SyncConnectionState } from "@/components/sync/auto-sync-api";
import {
  connectionStatus,
  liveConnectionIds,
  selectNeedsAction,
  type ConnectionLike,
} from "./accounts-needs-action";

function conn(over: Partial<ConnectionLike> = {}): ConnectionLike {
  return {
    id: "c1",
    providerCode: "discount",
    enabled: true,
    lastSuccessAt: "2026-11-04T08:00:00.000Z",
    credentialsSet: true,
    ...over,
  };
}

function state(over: Partial<SyncConnectionState> = {}): SyncConnectionState {
  return {
    connectionId: "c1",
    providerCode: "discount",
    live: false,
    otpRequired: false,
    failure: null,
    ...over,
  };
}

function job(over: Record<string, unknown> = {}): Job {
  return { kind: "scrape", status: "running", payloadJson: { connectionId: "c1" }, ...over } as unknown as Job;
}

const none = new Set<string>();

describe("selectNeedsAction", () => {
  it("returns nothing when every connection is healthy", () => {
    expect(selectNeedsAction([conn()], [], none)).toEqual([]);
  });

  it("flags missing credentials with the credentials action", () => {
    const [item] = selectNeedsAction([conn({ credentialsSet: false, lastSuccessAt: null })], [], none);
    expect(item).toMatchObject({ reason: "credentials_missing", action: "credentials" });
  });

  it("flags a failed connection with a sync action for transient errors", () => {
    const failure = { errorClass: "TIMEOUT", at: "2026-11-04T09:00:00.000Z" };
    const [item] = selectNeedsAction([conn()], [state({ failure })], none);
    expect(item).toMatchObject({ reason: "failed", action: "sync" });
  });

  it("sends wrong-password failures to the credentials action", () => {
    const failure = { errorClass: "INVALID_PASSWORD", at: "2026-11-04T09:00:00.000Z" };
    const [item] = selectNeedsAction([conn()], [state({ failure })], none);
    expect(item?.action).toBe("credentials");
  });

  it("flags a never-synced connection that has credentials", () => {
    const [item] = selectNeedsAction([conn({ lastSuccessAt: null })], [], none);
    expect(item).toMatchObject({ reason: "never_synced", action: "sync" });
  });

  it("never lists Isracard/Amex sync failures or never-synced as needs action", () => {
    const failure = { errorClass: "INVALID_PASSWORD", at: "2026-11-04T09:00:00.000Z" };
    const list = [conn({ providerCode: "isracard" }), conn({ id: "c2", providerCode: "amex", lastSuccessAt: null })];
    expect(selectNeedsAction(list, [state({ failure }), state({ connectionId: "c2", failure })], none)).toEqual([]);
    expect(selectNeedsAction([conn({ providerCode: "isracard", credentialsSet: false })], [], none)).toHaveLength(1);
  });

  it("skips disabled, manual and live connections", () => {
    const list = [
      conn({ id: "a", credentialsSet: false, enabled: false }),
      conn({ id: "b", providerCode: "manual", credentialsSet: false }),
      conn({ id: "c", credentialsSet: false }),
    ];
    expect(selectNeedsAction(list, [], new Set(["c"]))).toEqual([]);
  });

  it("orders credentials, then failed, then never synced, stable within a reason", () => {
    const failure = { errorClass: "TIMEOUT", at: "2026-11-04T09:00:00.000Z" };
    const list = [
      conn({ id: "never1", lastSuccessAt: null }),
      conn({ id: "failed1" }),
      conn({ id: "cred1", credentialsSet: false }),
      conn({ id: "cred2", credentialsSet: false }),
      conn({ id: "never2", lastSuccessAt: null }),
    ];
    const items = selectNeedsAction(list, [state({ connectionId: "failed1", failure })], none);
    expect(items.map((i) => i.connectionId)).toEqual(["cred1", "cred2", "failed1", "never1", "never2"]);
  });
});

describe("liveConnectionIds", () => {
  it("collects live states, queued/running scrape jobs and the page's own sync", () => {
    const ids = liveConnectionIds(
      [state({ connectionId: "s", live: true })],
      [job(), job({ status: "done", payloadJson: { connectionId: "d" } })],
      "p",
    );
    expect([...ids].sort()).toEqual(["c1", "p", "s"]);
  });

  it("is empty when nothing runs", () => {
    expect(liveConnectionIds([state()], [job({ status: "failed" })]).size).toBe(0);
  });
});

describe("connectionStatus", () => {
  it("resolves the status by priority", () => {
    const failure = { errorClass: "TIMEOUT", at: "2026-11-04T09:00:00.000Z" };
    expect(connectionStatus(conn(), undefined, true)).toBe("syncing");
    expect(connectionStatus(conn({ enabled: false }), undefined, false)).toBe("disabled");
    expect(connectionStatus(conn({ credentialsSet: false }), undefined, false)).toBe("credentials_missing");
    expect(connectionStatus(conn(), state({ failure }), false)).toBe("failed");
    expect(connectionStatus(conn({ lastSuccessAt: null }), undefined, false)).toBe("never");
    expect(connectionStatus(conn(), undefined, false)).toBe("ok");
  });
});

describe("connectionStatus for statement providers", () => {
  it("shows the calm manual_upload status instead of failed", () => {
    const failure = { errorClass: "TIMEOUT", at: "2026-11-04T09:00:00.000Z" };
    expect(connectionStatus(conn({ providerCode: "isracard" }), state({ failure }), false)).toBe("manual_upload");
    expect(connectionStatus(conn({ providerCode: "discount" }), state({ failure }), false)).toBe("failed");
  });
});
