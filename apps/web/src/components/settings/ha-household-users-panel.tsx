"use client";

/**
 * HA add-on: let one household user reset the other's PIN/passphrase enrollment.
 */
import type { HouseholdUserSummary } from "@moneytrack/contracts";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { fetchHouseholdUsers, resetHouseholdUserCredentials } from "@/lib/api-client";
import he from "@/locales/he.json";

const copy = he.haPassphrase.household;

export function HaHouseholdUsersPanel() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<HouseholdUserSummary[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [resetTarget, setResetTarget] = useState<HouseholdUserSummary | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchHouseholdUsers();
      setUsers(data.users);
      setCurrentUserId(data.currentUserId);
      setAvailable(true);
    } catch {
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmReset() {
    if (!resetTarget) return;
    setResetting(true);
    try {
      await resetHouseholdUserCredentials(resetTarget.id);
      showToast("המשתמש יידרש להירשם מחדש בביקור הבא", "success");
      setResetTarget(null);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "איפוס נכשל", "error");
    } finally {
      setResetting(false);
    }
  }

  if (loading || !available) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-card border border-border-subtle bg-surface-card p-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">משתמשי האפליקציה</h2>
        <p className="mt-1 text-sm text-text-muted">{copy.description}</p>
      </div>
      <ul className="divide-y divide-border-subtle">
        {users.map((user) => {
          const isSelf = user.id === currentUserId;
          const status = !user.enrolled
            ? "ממתין להרשמה"
            : user.pinLocked
              ? "PIN נעול"
              : "פעיל";
          return (
            <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium text-text-primary">{user.username}</p>
                <p className="text-sm text-text-muted">{status}</p>
              </div>
              {!isSelf && user.enrolled ? (
                <button
                  type="button"
                  onClick={() => setResetTarget(user)}
                  className="min-h-11 rounded-lg border border-border-subtle px-4 text-sm font-medium text-text-primary"
                >
                  איפוס גישה
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={resetTarget !== null}
        title="איפוס גישת משתמש"
        message={
          resetTarget
            ? copy.confirmReset.replace("{username}", resetTarget.username)
            : ""
        }
        confirmLabel={resetting ? "מאפס…" : "איפוס"}
        tone="danger"
        onConfirm={() => {
          if (!resetting) void confirmReset();
        }}
        onCancel={() => setResetTarget(null)}
      />
    </section>
  );
}
