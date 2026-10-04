import { NextRequest, NextResponse } from "next/server";
import {
  ANALYTICS_SESSION_COOKIE,
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
  AnalyticsConversionStage,
  AnalyticsErrorCode,
  AnalyticsEventInput,
  AnalyticsEventName,
  AnalyticsSizeBucket,
} from "@/lib/analytics/types";
import {
  readCloudflareApproximateLocation,
  readCloudflareVerifiedBot,
} from "@/lib/cloudflare/request-location";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 4096;
const SUPABASE_TIMEOUT_MS = 2000;

const EVENT_NAMES = new Set<AnalyticsEventName>([
  "page_view",
  "tool_opened",
  "processing_started",
  "processing_succeeded",
  "processing_failed",
  "processing_cancelled",
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
  "input_validation",
  "docx_parse_error",
  "unsupported_document_feature",
  "wasm_load_error",
  "wasm_compile_error",
  "worker_error",
  "font_load_error",
  "render_error",
  "pdf_generation_error",
  "pdf_validation_error",
  "memory_limit",
  "timeout",
  "user_cancelled",
  "unknown",
]);

const FAILURE_STAGES = new Set<AnalyticsConversionStage>([
  "preparing",
  "loading-engine",
  "converting",
  "generating",
  "validating",
  "finalizing",
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
  "failureStage",
  "pagePath",
]);

type ParsedEvent = AnalyticsEventInput & { pagePath: string | null };

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

function normalizePagePath(value: unknown) {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (
    !path ||
    path.length > 220 ||
    !/^\/[A-Za-z0-9/_-]*$/.test(path) ||
    path.includes("?") ||
    path.includes("#")
  ) {
    return null;
  }
  return path;
}

function parseEventInput(value: unknown): ParsedEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_BODY_KEYS.has(key))) return null;

  if (
    typeof record.eventName !== "string" ||
    !EVENT_NAMES.has(record.eventName as AnalyticsEventName)
  ) {
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

  const failureStage =
    record.failureStage === undefined || record.failureStage === null
      ? null
      : typeof record.failureStage === "string" &&
          FAILURE_STAGES.has(record.failureStage as AnalyticsConversionStage)
        ? (record.failureStage as AnalyticsConversionStage)
        : undefined;
  if (failureStage === undefined) return null;

  const pagePath = normalizePagePath(record.pagePath);
  if (eventName === "page_view" && !pagePath) return null;

  return {
    eventName,
    toolSlug,
    durationMs,
    inputSizeBucket,
    outputSizeBucket,
    success,
    errorCode,
    failureStage,
    pagePath,
  };
}

function getRequiredSecret(name: "ANALYTICS_IDENTITY_SECRET" | "ANALYTICS_INGEST_SECRET") {
  const value = process.env[name];
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

function responseWithIdentity(
  request: NextRequest,
  visitorToken: string,
  sessionToken: string,
) {
  const response = noStore(
    NextResponse.json({ accepted: true }, { status: 202 }),
  );
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

export async function POST(request: NextRequest) {
  if (!sameOriginRequest(request)) return rejected(403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return rejected(415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return rejected(413);
  }

  const identitySecret = getRequiredSecret("ANALYTICS_IDENTITY_SECRET");
  const ingestSecret = getRequiredSecret("ANALYTICS_INGEST_SECRET");
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

  // The raw address is used only as input to an HMAC rate-limit key. It is
  // never sent to Supabase and never stored.
  const networkIdentity =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    "unavailable";

  const [visitorKey, sessionKey, requestKey] = await Promise.all([
    deriveAnalyticsKey(identitySecret, "visitor", visitorToken),
    deriveAnalyticsKey(identitySecret, "session", sessionToken),
    deriveAnalyticsKey(identitySecret, "network", networkIdentity),
  ]);

  const userAgent = request.headers.get("user-agent");
  const traffic = classifyAnalyticsTraffic({
    userAgent,
    cloudflareBot: {
      verifiedBot: readCloudflareVerifiedBot(request),
    },
  });
  const technical = classifyServerUserAgent(userAgent);
  const location = readCloudflareApproximateLocation(request);
  const countryCode =
    location.country && /^[A-Z]{2}$/.test(location.country)
      ? location.country
      : null;
  const geography = countryCode
    ? {
        countryCode,
        region: location.region,
        regionCode: location.regionCode,
        city: location.city,
        geoSource: "cloudflare" as const,
        geoPrecision: location.city
          ? ("city" as const)
          : location.region || location.regionCode
            ? ("region" as const)
            : ("country" as const),
      }
    : {
        countryCode: null,
        region: null,
        regionCode: null,
        city: null,
        geoSource: "unresolved" as const,
        geoPrecision: "unresolved" as const,
      };

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
      p_page_path: input.pagePath,
      p_referrer_host: null,
      p_landing_path: null,
      p_acquisition_source: "direct",
      p_utm_source: null,
      p_utm_medium: null,
      p_utm_campaign: null,
      p_failure_stage: input.failureStage ?? null,
    },
    ingestSecret,
  );

  if (stored === null) return rejected(503);
  if (stored === false) return noStore(new NextResponse(null, { status: 204 }));

  return responseWithIdentity(request, visitorToken, sessionToken);
}
