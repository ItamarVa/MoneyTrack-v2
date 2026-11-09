"use client";

/**
 * Top-bar indicator for background categorize_bulk jobs.
 * Polls /api/classify/status and dispatches moneytrack:classified when a run finishes.
 */
import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/base-path";

type ClassifyStatusResponse = {
  active: boolean;
  status: "queued" | "running" | null;
  done: number;
  total: number;
  updated: number;
  lastFinished: { updated: number; finishedAt: string } | null;
};

const POLL_MS = 2000;
const DONE_VISIBLE_MS = 4000;

async function fetchClassifyStatus(): Promise<ClassifyStatusResponse> {
  const response = await fetch(apiUrl("/api/classify/status"));
  if (!response.ok) {
    throw new Error("status fetch failed");
  }
  return response.json() as Promise<ClassifyStatusResponse>;
}

export function BackgroundWorkChip() {
  const [status, setStatus] = useState<ClassifyStatusResponse | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const wasActiveRef = useRef(false);
  const seenFinishedAtRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let doneTimer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const next = await fetchClassifyStatus();
        if (cancelled) {
          return;
        }

        if (wasActiveRef.current && !next.active && next.lastFinished) {
          const finishedAt = next.lastFinished.finishedAt;
          if (finishedAt !== seenFinishedAtRef.current) {
            seenFinishedAtRef.current = finishedAt;
            setDoneMessage(
              `הסיווג הושלם · ${next.lastFinished.updated} עסקאות עודכנו`,
            );
            window.dispatchEvent(new Event("moneytrack:classified"));
            if (doneTimer) {
              clearTimeout(doneTimer);
            }
            doneTimer = setTimeout(() => {
              if (!cancelled) {
                setDoneMessage(null);
              }
            }, DONE_VISIBLE_MS);
          }
        }

        wasActiveRef.current = next.active;
        setStatus(next);
      } catch {
        // ponytail: chip is cosmetic; next poll retries
      }
    }

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (doneTimer) {
        clearTimeout(doneTimer);
      }
    };
  }, []);

  if (doneMessage) {
    return (
      <span className="hidden rounded-lg border border-brand-blue-500/40 bg-brand-blue-500/10 px-3 py-2 text-sm text-brand-blue-500 sm:inline-flex">
        {doneMessage}
      </span>
    );
  }

  if (!status?.active) {
    return null;
  }

  const total = status.total;
  const done = status.done;
  const label =
    total > 0
      ? `מסווג ברקע · ${done} מתוך ${total} חודשים`
      : "מסווג ברקע";

  return (
    <span className="hidden rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-secondary sm:inline-flex">
      {label}
    </span>
  );
}
