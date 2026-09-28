/**
 * Stacked card list for transaction-style rows below md (Track E2).
 */
import type { ReactNode } from "react";

type MobileCardListProps = {
  children: ReactNode;
  className?: string;
};

export function MobileCardList({ children, className = "" }: MobileCardListProps) {
  return (
    <ul className={["flex flex-col gap-2 md:hidden", className].filter(Boolean).join(" ")}>
      {children}
    </ul>
  );
}

type MobileCardListItemProps = {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
};

export function MobileCardListItem({ children, onClick, className = "" }: MobileCardListItemProps) {
  const interactive = typeof onClick === "function";

  return (
    <li>
      {interactive ? (
        <button
          type="button"
          onClick={onClick}
          className={[
            "w-full rounded-card border border-border-subtle bg-surface-card p-4 text-start shadow-sm",
            "min-h-11 active:bg-surface-elevated",
            className,
          ].join(" ")}
        >
          {children}
        </button>
      ) : (
        <div
          className={[
            "rounded-card border border-border-subtle bg-surface-card p-4 shadow-sm",
            className,
          ].join(" ")}
        >
          {children}
        </div>
      )}
    </li>
  );
}
