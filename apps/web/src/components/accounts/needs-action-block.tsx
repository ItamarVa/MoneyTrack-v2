"use client";

/**
 * "Needs action" block at the very top of the accounts page: one compact row per connection
 * that lacks credentials, last failed, or never synced. Renders nothing when all is well.
 * Selection and order live in accounts-needs-action.ts (pure, tested).
 */
import type { Connection } from "@moneytrack/contracts";
import { AlertTriangle } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { providerLabel } from "@/lib/provider-labels";
import he from "@/locales/he.json";
import type { NeedsActionItem } from "@/components/accounts/accounts-needs-action";

type NeedsActionBlockProps = {
  items: NeedsActionItem[];
  connections: Connection[];
  onEnterCredentials: (connection: Connection) => void;
  onSync: (connectionId: string) => void;
};

export function NeedsActionBlock({
  items,
  connections,
  onEnterCredentials,
  onSync,
}: NeedsActionBlockProps) {
  if (items.length === 0) {
    return null;
  }
  const copy = he.accountsUx.needsAction;

  return (
    <section
      aria-labelledby="needs-action-title"
      className="space-y-3 rounded-card border border-brand-orange-500/40 bg-brand-orange-500/10 p-4"
    >
      <h2
        id="needs-action-title"
        className="flex items-center gap-2 font-display text-lg text-text-primary"
      >
        <Icon icon={AlertTriangle} size={18} className="text-brand-orange-500" />
        {copy.title}
      </h2>
      <ul className="space-y-3">
        {items.map((item) => {
          const connection = connections.find((c) => c.id === item.connectionId);
          if (!connection) {
            return null;
          }
          return (
            <li key={item.connectionId} className="flex flex-col gap-2">
              <p className="text-sm leading-6 text-text-primary">{item.message}</p>
              <button
                type="button"
                aria-label={`${item.action === "credentials" ? copy.enterCredentials : copy.sync} — ${providerLabel(connection.providerCode)}`}
                onClick={() =>
                  item.action === "credentials" ? onEnterCredentials(connection) : onSync(connection.id)
                }
                className="min-h-11 rounded-lg bg-brand-blue-500 px-4 text-sm font-semibold text-white transition hover:opacity-90"
              >
                {item.action === "credentials" ? copy.enterCredentials : copy.sync}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
