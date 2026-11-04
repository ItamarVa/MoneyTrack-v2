"use client";

/**
 * Shell-wide sync notice, mounted once in AppShell. Priority: a sync running now (spinner and
 * provider), then clear per-connection problems from the on-open auto sync (what happened and
 * what to do, with a button to Accounts), then "updated", then the stale-data notice (rule in stale-data.ts).
 * Dismissal lasts for the browser session only, so the warning returns next visit. On /accounts and
 * /attention only the running and updated states show, the cards there carry the problems.
 * Copy lives in locales/he.json (`sync.banner`, `autoSync`).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleCheck, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { evaluateStaleData, type StaleDataStatus } from "@/components/sync/stale-data";
import { useAutoSync } from "@/components/sync/use-auto-sync";
import { useEmbedded } from "@/components/use-embedded";
import { formatIsoDateTime } from "@/lib/dates";
import he from "@/locales/he.json";

const copy = he.sync.banner;
const auto = he.autoSync;
const DISMISS_KEY = "mt-stale-banner-dismissed";
const LINK_TONE = "whitespace-nowrap font-medium text-brand-blue-500 underline underline-offset-2";
const ACTION_LINK = `inline-flex min-h-11 items-center ${LINK_TONE}`;
// Embedded (HA iframe, ~375px): short padding and text so the notice is one or two lines.
const COMPACT_LINK = `ms-1 inline ${LINK_TONE}`;

function bannerMessage(status: Extract<StaleDataStatus, { show: true }>): string {
  if (status.kind === "stale" && status.since) {
    return copy.stale.replace("{date}", formatIsoDateTime(status.since));
  }
  return status.kind === "partial" ? copy.partial : copy.never;
}

export function StaleDataBanner() {
  const pathname = usePathname();
  const { connections, running, problems, updated, reloadPending, reload } = useAutoSync(pathname);
  const embedded = useEmbedded();
  const [dismissed, setDismissed] = useState(false);
  const BAR = `border-b px-4 sm:px-6 ${embedded ? "py-1" : "py-2"}`;
  const textSize = embedded ? "text-xs leading-5" : "text-sm leading-6";

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // storage blocked: the banner just stays until reload
    }
  }, []);

  const status: StaleDataStatus = connections
    ? evaluateStaleData(connections, new Date())
    : { show: false };

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // storage blocked
    }
  }

  if (running.length > 0) {
    const text =
      running.length === 1
        ? auto.runningProvider.replace("{provider}", running[0] ?? "")
        : `${auto.running} (${running.join(", ")})`;
    return (
      <div role="status" className={`${BAR} border-brand-blue-500/40 bg-brand-blue-500/10`}>
        <div className="flex items-center gap-3">
          <Icon icon={LoaderCircle} size={18} className="shrink-0 animate-spin text-brand-blue-500" />
          <p className={`min-w-0 flex-1 ${textSize} text-text-primary`}>{text}</p>
        </div>
      </div>
    );
  }

  if (updated) {
    return (
      <div role="status" className={`${BAR} border-money-income/40 bg-money-income/10`}>
        <div className="flex items-center gap-3">
          <Icon icon={CircleCheck} size={18} className="shrink-0 text-money-income" />
          <p className={`min-w-0 flex-1 ${textSize} text-text-primary`}>{auto.updated}</p>
          {reloadPending ? (
            <button type="button" onClick={reload} className={embedded ? COMPACT_LINK : ACTION_LINK}>
              {auto.reloadNow}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (dismissed || pathname === "/accounts" || pathname === "/attention") {
    return null;
  }

  if (problems.length === 0 && !status.show) {
    return null;
  }

  const action = (
    <Link href="/accounts" className={embedded ? COMPACT_LINK : ACTION_LINK}>
      {problems.length > 0 ? auto.action : copy.action}
    </Link>
  );

  return (
    <div
      role={problems.length > 0 ? "alert" : "status"}
      className={`${BAR} border-brand-orange-500/40 bg-brand-orange-500/10`}
    >
      <div className="flex items-start gap-3">
        <Icon
          icon={TriangleAlert}
          size={embedded ? 16 : 18}
          className={`shrink-0 text-brand-orange-500 ${embedded ? "mt-0.5" : "mt-1.5"}`}
        />
        <div className={`min-w-0 flex-1 space-y-1 ${textSize} text-text-primary`}>
          {problems.length > 0 ? (
            <>
              <p className="font-semibold">{auto.failedTitle}</p>
              {problems.map((problem, index) => (
                <p key={problem.connectionId}>
                  {problem.text}
                  {embedded && index === problems.length - 1 ? action : null}
                </p>
              ))}
            </>
          ) : status.show ? (
            <p>
              <span className="font-semibold">{copy.title}</span> {bannerMessage(status)}
              {embedded ? action : null}
            </p>
          ) : null}
          {embedded ? null : action}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={copy.dismiss}
          className={`-me-2 inline-flex shrink-0 ${
            embedded ? "-my-1 min-h-9 min-w-9" : "-my-2 min-h-11 min-w-11"
          } items-center justify-center rounded-lg text-text-secondary hover:bg-surface-elevated hover:text-text-primary`}
        >
          <Icon icon={X} size={18} />
        </button>
      </div>
    </div>
  );
}
