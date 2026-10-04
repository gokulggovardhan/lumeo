import { NextResponse, type NextRequest } from "next/server";
import {
  isCloudflareVerifiedBot,
  readCloudflareApproximateLocation,
} from "@/lib/cloudflare/request-location";
import {
  ANALYTICS_SESSION_COOKIE,
  ANALYTICS_SESSION_MAX_AGE_SECONDS,
  ANALYTICS_VISITOR_COOKIE,
  ANALYTICS_VISITOR_MAX_AGE_SECONDS,
  analyticsIngestAvailable,
  createAnalyticsToken,
  pseudonymousAnalyticsKey,
  writeTrustedAnalyticsEvent,
} from "@/lib/analytics/server";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SAFE_PATH = /^\/[A-Za-z0-9/_-]*$/;
const ALLOWED_EVENTS = new Set([
  "page_view",
  "tool_opened",
  "processing_started",
  "processing_succeeded",
  "processing_failed",
  "processing_cancelled",
  "download_started",
]);

const KNOWN_BOT_UA =
  /Googlebot|Google-InspectionTool|bingbot|BingPreview|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|Discordbot|Applebot/i;

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength: number) {
  const valueText = text(value, maxLength);
  return valueText || null;
}

function boundedDuration(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(Math.round(value), 86_400_000));
}

function safePath(value: unknown) {
  const path = text(value, 220);
  return path && SAFE_PATH.test(path) ? path : null;
}

function sameOriginPagePath(request: NextRequest) {
  const referer = request.headers.get("referer");
  if (!referer) return null;

  try {
    const url = new URL(referer);
    if (url.origin !== request.nextUrl.origin) return null;
    return safePath(url.pathname);
  } catch {
    return null;
  }
}

function trafficClass(request: NextRequest) {
  if (request.headers.get("x-lumeo-analytics-traffic") === "synthetic") {
    return { value: "synthetic", reason: "lumeo_test_marker" };
  }

  if (isCloudflareVerifiedBot(request)) {
    return { value: "known_bot", reason: "cloudflare_verified_bot" };
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  if (KNOWN_BOT_UA.test(userAgent)) {
    return { value: "known_bot", reason: "known_bot_user_agent" };
  }

  return { value: "real_audience", reason: null };
}

function analyticsToken(request: NextRequest, name: string) {
  const existing = request.cookies.get(name)?.value;
  return existing && TOKEN_PATTERN.test(existing) ? existing : createAnalyticsToken();
}

function applyIdentityCookies(
  response: NextResponse,
  request: NextRequest,
  visitorToken: string,
  sessionToken: string,
) {
  const secure = request.nextUrl.protocol === "https:";

  response.cookies.set(ANALYTICS_VISITOR_COOKIE, visitorToken, {
    httpOnly: true,
    maxAge: ANALYTICS_VISITOR_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure,
  });
  response.cookies.set(ANALYTICS_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    maxAge: ANALYTICS_SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure,
  });
}

export async function POST(request: NextRequest) {
  if (!analyticsIngestAvailable()) {
    return NextResponse.json(
      { ok: false },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  }

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
  const eventName = text(data.eventName, 40);
  if (!ALLOWED_EVENTS.has(eventName)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const pagePath = sameOriginPagePath(request) ?? safePath(data.pagePath);
  if (eventName === "page_view" && !pagePath) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const visitorToken = analyticsToken(request, ANALYTICS_VISITOR_COOKIE);
  const sessionToken = analyticsToken(request, ANALYTICS_SESSION_COOKIE);
  const visitorKey = await pseudonymousAnalyticsKey(`visitor:${visitorToken}`);
  const sessionKey = await pseudonymousAnalyticsKey(`session:${sessionToken}`);
  const visitorIp = request.headers.get("cf-connecting-ip")?.trim();
  const requestKey = await pseudonymousAnalyticsKey(
    visitorIp ? `ip:${visitorIp}` : `session:${sessionToken}`,
  );

  if (!visitorKey || !sessionKey || !requestKey) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const location = readCloudflareApproximateLocation(request);
  const classification = trafficClass(request);
  const geoPrecision = !location.countryCode
    ? "unresolved"
    : location.city
      ? "city"
      : location.region || location.regionCode
        ? "region"
        : "country";

  const result = await writeTrustedAnalyticsEvent({
    p_event_name: eventName,
    p_tool_slug: nullableText(data.toolSlug, 80),
    p_visitor_key: visitorKey,
    p_session_key: sessionKey,
    p_request_key: requestKey,
    p_traffic_class: classification.value,
    p_traffic_class_reason: classification.reason,
    p_duration_ms: boundedDuration(data.durationMs),
    p_input_size_bucket: nullableText(data.inputSizeBucket, 30),
    p_output_size_bucket: nullableText(data.outputSizeBucket, 30),
    p_device_class: nullableText(data.deviceClass, 20),
    p_browser_family: nullableText(data.browserFamily, 24),
    p_operating_system: nullableText(data.operatingSystem, 24),
    p_success: typeof data.success === "boolean" ? data.success : null,
    p_error_code: nullableText(data.errorCode, 80),
    p_failure_stage: nullableText(data.failureStage, 40),
    p_country_code: location.countryCode,
    p_region: location.region,
    p_region_code: location.regionCode,
    p_city: location.city,
    p_geo_source: location.countryCode ? "cloudflare" : "unresolved",
    p_geo_precision: geoPrecision,
    p_page_path: pagePath,
  });

  const status =
    result.ok ? 200 : result.reason === "rate_limit" ? 429 : 503;
  const response = NextResponse.json(
    { ok: result.ok },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    },
  );
  applyIdentityCookies(response, request, visitorToken, sessionToken);
  return response;
}
