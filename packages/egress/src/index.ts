import {
  Agent,
  fetch as undiciFetch,
  setGlobalDispatcher,
  type Dispatcher,
} from "undici";

export const EGRESS_ALLOWLIST: readonly string[] = [
  "boi.org.il",
  "edge.boi.gov.il",
  "api.cbs.gov.il",
  "data.gov.il",
  "api.frankfurter.dev",
  "query1.finance.yahoo.com",
] as const;

export type EgressLogEntry = {
  host: string;
  path: string;
  purpose: string;
  status: number;
  bytes: number;
  durationMs: number;
  at: string;
};

export class EgressDeniedError extends Error {
  readonly host: string;

  constructor(host: string) {
    super(`Egress denied for host: ${host}`);
    this.name = "EgressDeniedError";
    this.host = host;
  }
}

const egressLog: EgressLogEntry[] = [];
let guardInstalled = false;

export function isHostAllowlisted(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return EGRESS_ALLOWLIST.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

function assertAllowlisted(hostname: string): void {
  if (!isHostAllowlisted(hostname)) {
    throw new EgressDeniedError(hostname);
  }
}

class AllowlistAgent extends Agent {
  override dispatch(
    options: Dispatcher.DispatchOptions,
    handler: Dispatcher.DispatchHandler,
  ): boolean {
    const origin = options.origin;
    if (typeof origin === "string") {
      const hostname = new URL(origin).hostname;
      assertAllowlisted(hostname);
    }
    return super.dispatch(options, handler);
  }
}

export function installEgressGuard(): void {
  if (guardInstalled) {
    return;
  }
  setGlobalDispatcher(new AllowlistAgent());
  guardInstalled = true;
}

export function getEgressLog(): readonly EgressLogEntry[] {
  return egressLog;
}

export function clearEgressLog(): void {
  egressLog.length = 0;
}

function recordEgress(entry: EgressLogEntry): void {
  egressLog.push(entry);
  if (process.env.NODE_ENV !== "test") {
    process.stdout.write(
      `[egress] ${entry.at} ${entry.host}${entry.path} ${entry.status} ${entry.durationMs}ms purpose=${entry.purpose}\n`,
    );
  }
}

type UndiciFetchInit = NonNullable<Parameters<typeof undiciFetch>[1]>;
type UndiciResponse = Awaited<ReturnType<typeof undiciFetch>>;

export async function egressFetch(
  url: string,
  purpose: string,
  init?: UndiciFetchInit,
): Promise<UndiciResponse> {
  const parsed = new URL(url);
  assertAllowlisted(parsed.hostname);
  const started = Date.now();
  const response = await undiciFetch(url, init);
  const body = await response.clone().arrayBuffer();
  recordEgress({
    host: parsed.hostname,
    path: `${parsed.pathname}${parsed.search}`,
    purpose,
    status: response.status,
    bytes: body.byteLength,
    durationMs: Date.now() - started,
    at: new Date().toISOString(),
  });
  return response;
}
