/**
 * Shared helpers for /api/ha/* route handlers.
 */
import { NextResponse } from "next/server";
import { isHaAddonMode } from "@/server/runtime-mode";

export function haModeOnly(): Response | null {
  if (!isHaAddonMode()) {
    return NextResponse.json(
      { error: "Not available outside HA add-on mode", code: "not_ha_addon" },
      { status: 404 },
    );
  }
  return null;
}

export function clientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
