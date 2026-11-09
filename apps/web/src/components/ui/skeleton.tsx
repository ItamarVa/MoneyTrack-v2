/**
 * Layout-preserving skeleton blocks shared across loading states.
 */
type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={["animate-pulse rounded-lg bg-surface-elevated", className].join(" ")}
    />
  );
}

export function SkeletonCardGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-28 rounded-card border border-border-subtle" />
      ))}
    </div>
  );
}

export function SkeletonPanel({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 rounded-card border border-border-subtle bg-surface-card p-6">
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className="h-4 w-full" />
      ))}
    </div>
  );
}
