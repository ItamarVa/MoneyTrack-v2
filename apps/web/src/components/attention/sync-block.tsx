"use client";

/**
 * Sync problems on the attention page: one row per connection that needs the user, with the plain
 * message from selectNeedsAction and a button to /accounts where the fix happens.
 * Renders nothing when there are no problems. Isracard/Amex (no auto sync) get the calm
 * StatementInfo line instead, never the orange block.
 */
import { AlertTriangle, Info } from "lucide-react";
import Link from "next/link";
import type { NeedsActionItem } from "@/components/accounts/accounts-needs-action";
import { Icon } from "@/components/ui/icon";
import he from "@/locales/he.json";

const copy = he.attention.sync;
const banner = he.sync.banner;

export function SyncBlock({ items }: { items: NeedsActionItem[] }) {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="attention-sync-title"
      className="space-y-3 rounded-card border border-brand-orange-500/40 bg-brand-orange-500/10 p-4"
    >
      <h2
        id="attention-sync-title"
        className="flex items-center gap-2 font-display text-lg text-text-primary"
      >
        <Icon icon={AlertTriangle} size={18} className="text-brand-orange-500" />
        {copy.title}
      </h2>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.connectionId} className="flex flex-col gap-2">
            <p className="text-sm leading-6 text-text-primary">{item.message}</p>
            <Link
              href="/accounts"
              className="flex min-h-11 items-center justify-center rounded-lg bg-brand-blue-500 px-4 text-sm font-semibold text-white transition hover:opacity-90"
            >
              {copy.action}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Neutral "no automatic sync, upload a file" line; same copy as the shell banner. */
export function StatementInfo({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-card border border-border-subtle bg-surface-elevated p-4"
    >
      <Icon icon={Info} size={18} className="mt-1.5 shrink-0 text-text-secondary" />
      <p className="min-w-0 flex-1 text-sm leading-6 text-text-secondary">
        {banner.statementNotice}
        <Link
          href="/accounts#statement-help"
          className="ms-1 inline-flex min-h-11 items-center whitespace-nowrap font-medium text-brand-blue-500 underline underline-offset-2"
        >
          {banner.statementHow}
        </Link>
      </p>
    </div>
  );
}
