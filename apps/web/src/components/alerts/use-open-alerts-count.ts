"use client";

/**
 * Open-alerts badge count for the sidebar and the phone "more" sheet. Same idea as
 * attention/use-attention-count.ts: calls with the same key share one in-flight fetch for 10 s,
 * a new pathname refetches, a failed fetch keeps the last count. Uses the existing alerts list
 * API (the server already returns only open alerts). notifyAlertsChanged() lets the alerts page
 * refresh the badge right after a dismissal instead of waiting for navigation.
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchAlerts } from "@/lib/api-client";

const CACHE_MS = 10_000;
const CHANGED_EVENT = "moneytrack:alerts-changed";

let cached: { key: string; at: number; promise: Promise<number> } | null = null;

export function loadOpenAlertsCount(
  key: string,
  fetcher: () => Promise<number> = async () => (await fetchAlerts()).filter((a) => a.status !== "dismissed").length,
  now: number = Date.now(),
): Promise<number> {
  if (cached && cached.key === key && now - cached.at < CACHE_MS) return cached.promise;
  const entry = { key, at: now, promise: fetcher() };
  cached = entry;
  entry.promise.catch(() => {
    if (cached === entry) cached = null;
  });
  return entry.promise;
}

export function resetOpenAlertsCountCache(): void {
  cached = null;
}

export function notifyAlertsChanged(): void {
  cached = null;
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function useOpenAlertsCount(): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadOpenAlertsCount(pathname)
        .then((value) => {
          if (!cancelled) setCount(value);
        })
        .catch(() => {
          // Advisory badge; keep the previous count on a transient error.
        });
    };
    refresh();
    window.addEventListener(CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(CHANGED_EVENT, refresh);
    };
  }, [pathname]);

  return count;
}
