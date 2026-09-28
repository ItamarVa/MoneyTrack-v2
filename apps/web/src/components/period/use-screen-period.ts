"use client";

/**
 * One rule for every period-aware screen: after localStorage hydrates, the URL
 * seeds the picker once; from then on the picker owns the period. Screens pass
 * their own URL encoding in and get { period, ready } out.
 */
import { useEffect, useState } from "react";
import { useGlobalPeriod, type GlobalPeriod } from "./period-context";

export type ScreenPeriod = { period: GlobalPeriod; ready: boolean };

/** Pure seed decision for tests — returns the period to apply, or null to skip. */
export function seedPeriod(
  hydrated: boolean,
  seeded: boolean,
  urlPeriod: GlobalPeriod | null,
  period: GlobalPeriod,
): GlobalPeriod | null {
  if (!hydrated || seeded) return null;
  if (urlPeriod !== null && urlPeriod !== period) return urlPeriod;
  return null;
}

export function useScreenPeriod(urlPeriod: GlobalPeriod | null): ScreenPeriod {
  const { period, setPeriod, hydrated } = useGlobalPeriod();
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!hydrated || seeded) return;
    const next = seedPeriod(hydrated, seeded, urlPeriod, period);
    if (next !== null) setPeriod(next);
    setSeeded(true);
  }, [hydrated, seeded, urlPeriod, period, setPeriod]);

  return { period, ready: hydrated && seeded };
}
