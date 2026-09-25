import { NextRequest, NextResponse } from "next/server";
import {
  ANALYTICS_ACQUISITION_COOKIE,
  buildAcquisitionContext,
  decodeAcquisitionCookie,
  normalizeAnalyticsPath,
} from "@/lib/analytics/acquisition";
import { verifyGitHubSyntheticToken } from "@/lib/analytics/github-oidc";
import {
  ANALYTICS_SESSION_COOKIE,
  ANALYTICS_SYNTHETIC_COOKIE,
  ANALYTICS_VISITOR_COOKIE,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  VISITOR_COOKIE_MAX_AGE_SECONDS,
  analyticsCookieOptions,
  createAnalyticsToken,
  deriveAnalyticsKey,
  isValidAnalyticsToken,
} from "@/lib/analytics/server-identity";
import { classifyServerUserAgent } from "@/lib/analytics/server-user-agent";
import { classifyAnalyticsTraffic } from "@/lib/analytics/traffic-classification";
import type {
  AnalyticsErrorCode,
  AnalyticsEventInput,
  AnalyticsEventName,
  AnalyticsSizeBucket,
} from "@/lib/analytics/types";
import { readCloudflareApproximateLocation } from "@/lib/cloudflare/request-location";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 4096;
const SUPABASE_TIMEOUT_MS = 1800;
const EVENT_NAMES = new Set<AnalyticsEventName>([
  "page_view",
  "tool_opened",
  "processing_started",
  "processing_succeeded",
  "processing_failed",
  "download_started",
]);
const SIZE_BUCKETS = new Set<AnalyticsSizeBucket>([
  "under_1mb",
  "1mb_to_5mb",
  "5mb_to_20mb",
  "20mb_to_50mb",
  "over_50mb",
  "unknown",
]);
const ERROR_CODES = new Set<AnalyticsErrorCode>([
  "unsupported_file",
  "file_too_large",
  "invalid_pdf",
  "processing_error",
  "browser_limit",
  "cancelled",
  "unknown",
]);
const ALLOWED_BODY_KEYS = new Set([
  "eventName",
  "toolSlug",
  "durationMs",
  "inputSizeBucket",
  "outputSizeBucket",
  "success",
  "errorCode",
]);

type RequestCf = {
  botManagement?: {
    verifiedBot?: boolean | null;
  };
};

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  return response;
}

function rejected(status: number) {
  return noStore(NextResponse.json({ accepted: false }, { status }));
}

function sameOriginRequest(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function parseEventInput(value: unknown): AnalyticsEventInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  if (Object.keys(record).some((key) => !ALLOWED_BODY_KEYS.has(key))) return null;
  if (typeof record.eventName !== "string" || !EVENT_NAMES.has(record.eventName as AnalyticsEventName)) {
    return null;
  }

  const eventName = record.eventName as AnalyticsEventName;
  let toolSlug: string | null = null;
  if (record.toolSlug !== undefined && record.toolSlug !== null) {
    if (
      typeof record.toolSlug !== "string" ||
      !/^[a-z0-9-]{1,80}$/.test(record.toolSlug)
    ) {
      return null;
    }
    toolSlug = record.toolSlug;
  }
  if (eventName !== "page_view" && !toolSlug) return null;

  let durationMs: number | null = null;
  if (record.durationMs !== undefined && record.durationMs !== null) {
    if (
      typeof record.durationMs !== "number" ||
      !Number.isFinite(record.durationMs) ||
      record.durationMs < 0 ||
      record.durationMs > 86_400_000
    ) {
      return null;
    }
    durationMs = Math.round(record.durationMs);
  }

  const inputSizeBucket =
    record.inputSizeBucket === undefined || record.inputSizeBucket === null
      ? null
      : typeof record.inputSizeBucket === "string" &&
          SIZE_BUCKETS.has(record.inputSizeBucket as AnalyticsSizeBucket)
        ? (record.inputSizeBucket as AnalyticsSizeBucket)
        : undefined;
  if (inputSizeBucket === undefined) return null;

  const outputSizeBucket =
    record.outputSizeBucket === undefined || record.outputSizeBucket === null
      ? null
      : typeof record.outputSizeBucket === "string" &&
          SIZE_BUCKETS.has(record.outputSizeBucket as AnalyticsSizeBucket)
        ? (record.outputSizeBucket as AnalyticsSizeBucket)
        : undefined;
  if (outputSizeBucket === undefined) return null;

  const success =
    record.success === undefined || record.success === null
      ? null
      : typeof record.success === "boolean"
        ? record.success
        : undefined;
  if (success === undefined) return null;

  const errorCode =
    record.errorCode === undefined || record.errorCode === null
      ? null
      : typeof record.errorCode === "string" &&
          ERROR_CODES.has(record.errorCode as AnalyticsErrorCode)
        ? (record.errorCode as AnalyticsErrorCode)
        : undefined;
  if (errorCode === undefined) return null;

  return {
    eventName,
    toolSlug,
    durationMs,
    inputSizeBucket,
    outputSizeBucket,
    success,
    errorCode,
  };
}

function pagePathFromReferer(request: NextRequest) {
  const referrer = request.headers.get("referer");
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.origin !== request.nextUrl.origin) return null;
    return normalizeAnalyticsPath(url.pathname);
  } catch {
    return null;
  }
}

function geographyForRequest(request: NextRequest) {
  const location = readCloudflareApproximateLocation(request);
  if (!location.country) {
    return {
      countryCode: null,
      region: null,
      regionCode: null,
      city: null,
      geoSource: "unresolved" as const,
      geoPrecision: "unresolved" as const,
    };
  }

  return {
    countryCode: location.country,
    region: location.region,
    regionCode: location.regionCode,
    city: location.city,
    geoSource: "cloudflare" as const,
    geoPrecision: location.city
      ? ("city" as const)
      : location.region || location.regionCode
        ? ("region" as const)
        : ("country" as const),
  };
}

function getIdentitySecret() {
  const value = process.env.ANALYTICS_IDENTITY_SECRET;
  return value && value.length >= 32 ? value : null;
}

function getIngestSecret() {
  const value = process.env.ANALYTICS_INGEST_SECRET;
  return value && value.length >= 32 ? value : null;
}

async function writeAnalyticsEvent(
  payload: Record<string, unknown>,
  ingestSecret: string,
) {
  const { url, publishableKey } = getSupabaseEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${url}/rest/v1/rpc/record_server_analytics_event`,
      {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "content-type": "application/json",
          "x-lumeo-analytics-ingest": ingestSecret,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      },
    );
    if (!response.ok) return null;
    const result = (await response.json()) as unknown;
    return typeof result === "boolean" ? result : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOriginRequest(request)) return rejected(403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return rejected(415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return rejected(413);
  }

  const identitySecret = getIdentitySecret();
  const ingestSecret = getIngestSecret();
  if (!identitySecret || !ingestSecret) return rejected(503);

  let text: string;
  try {
    text = await request.text();
  } catch {
    return rejected(400);
  }
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    return rejected(413);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(text);
  } catch {
    return rejected(400);
  }

  const input = parseEventInput(parsedBody);
  if (!input) return rejected(400);

  const existingVisitor = request.cookies.get(ANALYTICS_VISITOR_COOKIE)?.value;
  const existingSession = request.cookies.get(ANALYTICS_SESSION_COOKIE)?.value;
  const visitorToken = isValidAnalyticsToken(existingVisitor)
    ? existingVisitor!
    : createAnalyticsToken();
  const sessionToken = isValidAnalyticsToken(existingSession)
    ? existingSession!
    : createAnalyticsToken();

  const networkIdentity =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    "unavailable";

  const [visitorKey, sessionKey, requestKey, syntheticVerified] = await Promise.all([
    deriveAnalyticsKey(identitySecret, "visitor", visitorToken),
    deriveAnalyticsKey(identitySecret, "session", sessionToken),
    deriveAnalyticsKey(identitySecret, "network", networkIdentity),
    verifyGitHubSyntheticToken(
      request.cookies.get(ANALYTICS_SYNTHETIC_COOKIE)?.value,
    ),
  ]);

  const userAgent = request.headers.get("user-agent");
  const cf = (request as unknown as { cf?: RequestCf }).cf;
  const traffic = classifyAnalyticsTraffic({
    syntheticVerified,
    userAgent,
    cloudflareBot: cf?.botManagement ?? null,
  });
  const technical = classifyServerUserAgent(userAgent);
  const geography = geographyForRequest(request);
  const pagePath = pagePathFromReferer(request);
  const acquisition =
    decodeAcquisitionCookie(
      request.cookies.get(ANALYTICS_ACQUISITION_COOKIE)?.value,
    ) ??
    buildAcquisitionContext(
      pagePath ? new URL(pagePath, request.nextUrl.origin).toString() : request.nextUrl.origin,
      null,
    );

  const stored = await writeAnalyticsEvent(
    {
      p_event_name: input.eventName,
      p_tool_slug: input.toolSlug ?? null,
      p_visitor_key: visitorKey,
      p_session_key: sessionKey,
      p_request_key: requestKey,
      p_traffic_class: traffic.trafficClass,
      p_traffic_class_reason: traffic.reason,
      p_duration_ms: input.durationMs ?? null,
      p_input_size_bucket: input.inputSizeBucket ?? "unknown",
      p_output_size_bucket: input.outputSizeBucket ?? "unknown",
      p_device_class: technical.deviceClass,
      p_browser_family: technical.browserFamily,
      p_operating_system: technical.operatingSystem,
      p_success: input.success ?? null,
      p_error_code: input.errorCode ?? null,
      p_country_code: geography.countryCode,
      p_region: geography.region,
      p_region_code: geography.regionCode,
      p_city: geography.city,
      p_geo_source: geography.geoSource,
      p_geo_precision: geography.geoPrecision,
      p_page_path: pagePath,
      p_referrer_host: acquisition.referrerHost,
      p_landing_path: acquisition.landingPath,
      p_acquisition_source: acquisition.source,
      p_utm_source: acquisition.utmSource,
      p_utm_medium: acquisition.utmMedium,
      p_utm_campaign: acquisition.utmCampaign,
    },
    ingestSecret,
  );

  if (stored === null) return rejected(503);
  if (stored === false) return noStore(new NextResponse(null, { status: 204 }));

  const response = noStore(NextResponse.json({ accepted: true }, { status: 202 }));
  response.cookies.set(
    ANALYTICS_VISITOR_COOKIE,
    visitorToken,
    analyticsCookieOptions(request.url, VISITOR_COOKIE_MAX_AGE_SECONDS),
  );
  response.cookies.set(
    ANALYTICS_SESSION_COOKIE,
    sessionToken,
    analyticsCookieOptions(request.url, SESSION_COOKIE_MAX_AGE_SECONDS),
  );
  return response;
}
