import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth";
import { getServerDb } from "@/server/db";
import { buildHaStatus, HA_PIN_IDLE_MS } from "@/server/ha-auth";
import { haGatePath } from "@/server/ha-gate";
import { isHaAddonMode } from "@/server/runtime-mode";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  // HA add-on: decide the gate before touching the DB, which stays locked
  // until someone enrolls or unlocks.
  if (isHaAddonMode()) {
    const gate = haGatePath((await buildHaStatus(await headers(), token)).phase);
    if (gate) {
      redirect(gate);
    }
  }

  const db = await getServerDb();
  const session = getSessionUser(
    db,
    token,
    isHaAddonMode() ? { idleMs: HA_PIN_IDLE_MS } : undefined,
  );

  if (!session) {
    redirect(isHaAddonMode() ? "/ha/pin" : "/login");
  }
  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  return <AppShell>{children}</AppShell>;
}
