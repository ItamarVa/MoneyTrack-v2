/**
 * Breadcrumb trail for donut drill levels.
 */
import type { BreadcrumbSegment } from "./types";

type DrillBreadcrumbProps = {
  segments: BreadcrumbSegment[];
  onSelect: (segment: BreadcrumbSegment) => void;
  /** Keep the last segment clickable so the user can step back one ring level. */
  lastSegmentClickable?: boolean;
};

export function DrillBreadcrumb({
  segments,
  onSelect,
  lastSegmentClickable = false,
}: DrillBreadcrumbProps) {
  if (segments.length <= 1) return null;

  return (
    <nav aria-label="ניווט פירוט" className="text-sm text-text-secondary">
      <ol className="flex flex-wrap items-center gap-1">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          const isClickable = !isLast || lastSegmentClickable;
          return (
            <li key={`${index}-${segment.dimension}-${segment.label}`} className="flex items-center gap-1">
              {index > 0 ? <span aria-hidden="true">›</span> : null}
              {isClickable ? (
                <button
                  type="button"
                  onClick={() => onSelect(segment)}
                  className={
                    isLast
                      ? "rounded px-1 font-medium text-text-primary hover:text-brand-blue-500 hover:underline"
                      : "rounded px-1 hover:text-brand-blue-500 hover:underline"
                  }
                >
                  {segment.label}
                </button>
              ) : (
                <span className="font-medium text-text-primary">{segment.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
