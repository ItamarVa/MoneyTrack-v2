/**
 * GET/PATCH salary reporting window settings (app_settings key-value store).
 * Controls the 25–5 charge-date rule used by engine rollups and ingest sync.
 */
import {
  SALARY_REPORTING_SETTING_KEYS,
  SalaryReportingSettingsPatchRequestSchema,
  SalaryReportingSettingsResponseSchema,
  SalaryReportingSettingsSchema,
  type SalaryReportingSettings,
} from "@moneytrack/contracts";
import { appSettings, eq, inArray, type MoneyTrackDb } from "@moneytrack/db";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { writeAudit } from "@/server/auth";
import { zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

const DEFAULT_SALARY_REPORTING_SETTINGS = SalaryReportingSettingsSchema.parse({});

function nowIso(): string {
  return new Date().toISOString();
}

function parseSettingValue(
  key: string,
  value: string | undefined,
): boolean | number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (key === SALARY_REPORTING_SETTING_KEYS.enabled) {
    return value === "true";
  }
  if (
    key === SALARY_REPORTING_SETTING_KEYS.startDay ||
    key === SALARY_REPORTING_SETTING_KEYS.endDay
  ) {
    return Number.parseInt(value, 10);
  }
  return undefined;
}

function loadSalaryReportingSettings(db: MoneyTrackDb): SalaryReportingSettings {
  const keys = Object.values(SALARY_REPORTING_SETTING_KEYS);
  const rows = db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, keys))
    .all();
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return SalaryReportingSettingsSchema.parse({
    enabled:
      parseSettingValue(
        SALARY_REPORTING_SETTING_KEYS.enabled,
        byKey.get(SALARY_REPORTING_SETTING_KEYS.enabled),
      ) ?? DEFAULT_SALARY_REPORTING_SETTINGS.enabled,
    startDay:
      parseSettingValue(
        SALARY_REPORTING_SETTING_KEYS.startDay,
        byKey.get(SALARY_REPORTING_SETTING_KEYS.startDay),
      ) ?? DEFAULT_SALARY_REPORTING_SETTINGS.startDay,
    endDay:
      parseSettingValue(
        SALARY_REPORTING_SETTING_KEYS.endDay,
        byKey.get(SALARY_REPORTING_SETTING_KEYS.endDay),
      ) ?? DEFAULT_SALARY_REPORTING_SETTINGS.endDay,
  });
}

function upsertAppSetting(db: MoneyTrackDb, key: string, value: string, updatedAt: string): void {
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  if (existing) {
    db.update(appSettings).set({ value, updatedAt }).where(eq(appSettings.key, key)).run();
    return;
  }
  db.insert(appSettings).values({ key, value, updatedAt }).run();
}

function toResponse(settings: SalaryReportingSettings) {
  return SalaryReportingSettingsResponseSchema.parse({ settings });
}

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  return NextResponse.json(toResponse(loadSalaryReportingSettings(ctx.db)));
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  try {
    const body = SalaryReportingSettingsPatchRequestSchema.parse(await request.json());
    const now = nowIso();

    if (body.enabled !== undefined) {
      upsertAppSetting(
        ctx.db,
        SALARY_REPORTING_SETTING_KEYS.enabled,
        body.enabled ? "true" : "false",
        now,
      );
    }
    if (body.startDay !== undefined) {
      upsertAppSetting(
        ctx.db,
        SALARY_REPORTING_SETTING_KEYS.startDay,
        String(body.startDay),
        now,
      );
    }
    if (body.endDay !== undefined) {
      upsertAppSetting(
        ctx.db,
        SALARY_REPORTING_SETTING_KEYS.endDay,
        String(body.endDay),
        now,
      );
    }

    const settings = loadSalaryReportingSettings(ctx.db);
    writeAudit(ctx.db, "salary_reporting_settings_update", ctx.session.user.id, {
      enabled: settings.enabled,
      startDay: settings.startDay,
      endDay: settings.endDay,
    });

    return NextResponse.json(toResponse(settings));
  } catch (error) {
    if (error instanceof ZodError) {
      return zodErrorResponse(error);
    }
    throw error;
  }
}
