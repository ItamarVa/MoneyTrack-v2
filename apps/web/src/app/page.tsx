import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/server/auth";
import { buildHaStatus } from "@/server/ha-auth";
import { haGatePath } from "@/server/ha-gate";
import { isHaAddonMode } from "@/server/runtime-mode";

export default async function HomePage() {
  if (isHaAddonMode()) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    redirect(haGatePath((await buildHaStatus(await headers(), token)).phase) ?? "/dashboard");
  }
  redirect("/login");
}
