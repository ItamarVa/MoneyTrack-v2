"use client";

/**
 * Open-items badge count shared by the sidebar and the phone tab bar, which are mounted together.
 * One fetch per route change: calls with the same key share the in-flight promise and the result
 * for 10 s, so two consumers (or a fast remount) never double-fetch. A new pathname refetches.
 * A failed fetch is not cached and the consumer keeps its last known count.
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchAttentionCount } from "@/components/attention/attention-api";

const CACHE_MS = 10_000;

let cached: { key: string; at: number; promise: Promise<number> } | null = null;

export function loadAttentionCount(
  key: string,
  fetcher: () => Promise<number> = fetchAttentionCount,
  now: number = Date.now(),
): Promise<number> {
  if (cached && cached.key === key && now - cached.at < CACHE_MS) {
    return cached.promise;
  }
  const entry = { key, at: now, promise: fetcher() };
  cached = entry;
  entry.promise.catch(() => {
    if (cached === entry) cached = null;
  });
  return entry.promise;
}

export function resetAttentionCountCache(): void {
  cached = null;
}

export function useAttentionCount(): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadAttentionCount(pathname)
      .then((value) => {
        if (!cancelled) setCount(value);
      })
      .catch(() => {
        // Badge is advisory; keep the previous count instead of hiding it on a transient error.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return count;
}
