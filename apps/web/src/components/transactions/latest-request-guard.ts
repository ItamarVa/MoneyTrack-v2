/**
 * Sequence guard for overlapping async fetches: only the most recently started request may
 * apply its result, so a slow response for an old query can never overwrite a newer one.
 * Used by: transactions-page-client.tsx (list page loads while the search box is typed into).
 */
export type LatestRequestGuard = {
  /** Starts a request; returns a check that is true only while no newer request has started. */
  begin: () => () => boolean;
};

export function createLatestRequestGuard(): LatestRequestGuard {
  let latest = 0;
  return {
    begin: () => {
      const mine = ++latest;
      return () => mine === latest;
    },
  };
}
