import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function apiError(
  status: number,
  error: string,
  code?: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, code, details }, { status });
}

export function zodErrorResponse(error: ZodError): NextResponse {
  return apiError(400, "Invalid request", "validation_error", {
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

export function notFound(resource = "Resource"): NextResponse {
  return apiError(404, `${resource} not found`, "not_found");
}
