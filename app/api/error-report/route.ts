import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_SOURCES = new Set([
  "client",
  "error_boundary",
  "unhandled_rejection",
]);
const ALLOWED_SEVERITIES = new Set([
  "low",
  "medium",
  "high",
  "critical",
]);

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength: number) {
  const valueText = text(value, maxLength);
  return valueText ? valueText : null;
}

function sameOriginPageUrl(request: NextRequest) {
  const referer = request.headers.get("referer");
  if (!referer) return null;

  try {
    const url = new URL(referer);
    if (url.origin !== request.nextUrl.origin) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const message = text(data.message, 2000).trim();
  if (!message) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const source = text(data.source, 40);
  const severity = text(data.severity, 20);
  const anonymousSessionId =
    typeof data.anonymousSessionId === "string" &&
    UUID_PATTERN.test(data.anonymousSessionId)
      ? data.anonymousSessionId
      : null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_error_event", {
    message,
    stack: nullableText(data.stack, 4000),
    route: nullableText(data.route, 300),
    component: nullableText(data.component, 200),
    source: ALLOWED_SOURCES.has(source) ? source : "client",
    severity: ALLOWED_SEVERITIES.has(severity) ? severity : "medium",
    browser_family: nullableText(data.browserFamily, 40),
    operating_system: nullableText(data.operatingSystem, 40),
    device_class: nullableText(data.deviceClass, 40),
    page_url: sameOriginPageUrl(request),
    anonymous_session_id: anonymousSessionId,
    build_version: process.env.npm_package_version ?? null,
    git_sha: process.env.LUMEO_BUILD_SHA ?? null,
  });

  if (error) {
    if (/rate limit/i.test(error.message)) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    },
  );
}
