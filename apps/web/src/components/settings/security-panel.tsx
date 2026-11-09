"use client";

/**
 * Settings → אבטחה: HA household user reset (add-on only) + audit log.
 */
import { AuditLogPanel } from "@/components/settings/audit-log-panel";
import { HaHouseholdUsersPanel } from "@/components/settings/ha-household-users-panel";

export function SecurityPanel() {
  return (
    <div className="space-y-8">
      <HaHouseholdUsersPanel />
      <AuditLogPanel />
    </div>
  );
}
