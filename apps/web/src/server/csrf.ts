const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function requestHost(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-host");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get("host");
}

export function assertValidOrigin(request: Request): void {
  if (!MUTATING.has(request.method.toUpperCase())) {
    return;
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new Response(JSON.stringify({ error: "Missing Origin header" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  const host = requestHost(request);
  if (!host) {
    throw new Response(JSON.stringify({ error: "Missing Host header" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  const expected = new URL(origin);
  if (expected.host !== host) {
    throw new Response(JSON.stringify({ error: "Invalid Origin" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
}
