import type {
  AnalyticsBrowserFamily,
  AnalyticsConversionStage,
  AnalyticsDeviceClass,
  AnalyticsErrorCode,
  AnalyticsEventName,
  AnalyticsOperatingSystem,
  AnalyticsSizeBucket,
} from "@/lib/analytics/types";
import {
  isCloudflareVerifiedBot,
  readCloudflareApproximateLocation,
} from "@/lib/cloudflare/request-location";

export const ANALYTICS_VISITOR_COOKIE = "lumeo_av";
export const ANALYTICS_SESSION_COOKIE = "lumeo_as";
export const ANALYTICS_VISITOR_MAX_AGE = 60 * 60 * 24 * 90;
export const ANALYTICS_SESSION_MAX_AGE = 60 * 30;
export const SYNTHETIC_TRAFFIC_HEADER = "x-lumeo-synthetic-traffic";
export const SYNTHETIC_TRAFFIC_VALUE = "cloudflare-production-audit";

const PATH_PATTERN = /^\/[A-Za-z0-9/_-]*$/;
const HOST_PATTERN = /^[a-z0-9.-]+$/;
const COUNTRY_PATTERN = /^[A-Za-z]{2}$/;

export type ServerAnalyticsInput = {
  eventName: AnalyticsEventName;
  toolSlug: string | null;
  durationMs: number | null;
  inputSizeBucket: AnalyticsSizeBucket;
  outputSizeBucket: AnalyticsSizeBucket;
  deviceClass: AnalyticsDeviceClass;
  browserFamily: AnalyticsBrowserFamily;
  operatingSystem: AnalyticsOperatingSystem;
  success: boolean | null;
  errorCode: AnalyticsErrorCode | null;
  failureStage: AnalyticsConversionStage | null;
  pagePath: string | null;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

export type TrafficClass = "real_audience" | "synthetic" | "known_bot";

function text(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function parseServerAnalyticsInput(body: unknown): ServerAnalyticsInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const data = body as Record<string, unknown>;

  const eventName = oneOf(
    data.eventName,
    [
      "page_view",
      "tool_opened",
      "processing_started",
      "processing_succeeded",
      "processing_failed",
      "processing_cancelled",
      "download_started",
    ] as const,
    "" as AnalyticsEventName,
  );
  if (!eventName) return null;

  const toolSlug = text(data.toolSlug, 80);
  if (eventName !== "page_view" && !toolSlug) return null;
  if (toolSlug && !/^[a-z0-9-]+$/.test(toolSlug)) return null;

  const durationRaw = data.durationMs;
  const durationMs =
    typeof durationRaw === "number" && Number.isFinite(durationRaw)
      ? Math.max(0, Math.min(Math.round(durationRaw), 86_400_000))
      : null;

  const pagePathCandidate = text(data.pagePath, 220);
  const pagePath =
    pagePathCandidate && PATH_PATTERN.test(pagePathCandidate)
      ? pagePathCandidate
      : null;

  const referrerCandidate = text(data.referrerHost, 160)?.toLowerCase() ?? null;
  const referrerHost =
    referrerCandidate && HOST_PATTERN.test(referrerCandidate)
      ? referrerCandidate
      : null;

  return {
    eventName,
    toolSlug,
    durationMs,
    inputSizeBucket: oneOf(
      data.inputSizeBucket,
      ["under_1mb", "1mb_to_5mb", "5mb_to_20mb", "20mb_to_50mb", "over_50mb", "unknown"] as const,
      "unknown",
    ),
    outputSizeBucket: oneOf(
      data.outputSizeBucket,
      ["under_1mb", "1mb_to_5mb", "5mb_to_20mb", "20mb_to_50mb", "over_50mb", "unknown"] as const,
      "unknown",
    ),
    deviceClass: oneOf(
      data.deviceClass,
      ["desktop", "tablet", "mobile", "unknown"] as const,
      "unknown",
    ),
    browserFamily: oneOf(
      data.browserFamily,
      ["Chrome", "Edge", "Firefox", "Safari", "Other", "Unknown"] as const,
      "Unknown",
    ),
    operatingSystem: oneOf(
      data.operatingSystem,
      ["Windows", "macOS", "Linux", "Android", "iOS", "Other", "Unknown"] as const,
      "Unknown",
    ),
    success: typeof data.success === "boolean" ? data.success : null,
    errorCode: text(data.errorCode, 60) as AnalyticsErrorCode | null,
    failureStage: text(data.failureStage, 40) as AnalyticsConversionStage | null,
    pagePath,
    referrerHost,
    utmSource: text(data.utmSource, 100),
    utmMedium: text(data.utmMedium, 100),
    utmCampaign: text(data.utmCampaign, 120),
  };
}

export function classifyTraffic(request: Request): {
  trafficClass: TrafficClass;
  reason: string;
} {
  if (
    request.headers.get(SYNTHETIC_TRAFFIC_HEADER) ===
    SYNTHETIC_TRAFFIC_VALUE
  ) {
    return { trafficClass: "synthetic", reason: "lumeo-production-audit" };
  }

  if (isCloudflareVerifiedBot(request)) {
    return { trafficClass: "known_bot", reason: "cloudflare-verified-bot" };
  }

  return { trafficClass: "real_audience", reason: "public-browser" };
}

export function readTrustedGeo(request: Request) {
  const location = readCloudflareApproximateLocation(request);
  const country =
    location.country && COUNTRY_PATTERN.test(location.country)
      ? location.country.toUpperCase()
      : null;

  if (!country) {
    return {
      countryCode: null,
      region: null,
      regionCode: null,
      city: null,
      geoSource: "unresolved" as const,
      geoPrecision: "unresolved" as const,
    };
  }

  const city = location.city;
  const region = location.region;
  const regionCode = location.regionCode?.toUpperCase() ?? null;
  return {
    countryCode: country,
    region,
    regionCode,
    city,
    geoSource: "cloudflare" as const,
    geoPrecision: city
      ? ("city" as const)
      : region || regionCode
        ? ("region" as const)
        : ("country" as const),
  };
}

export function acquisitionSource(input: ServerAnalyticsInput) {
  if (input.utmSource || input.utmMedium || input.utmCampaign) return "campaign";
  const host = input.referrerHost;
  if (!host) return "direct";
  if (/(^|\.)google\./.test(host)) return "google";
  if (/(^|\.)bing\.com$/.test(host)) return "bing";
  if (
    /(^|\.)(duckduckgo\.com|search\.yahoo\.com|ecosia\.org)$/.test(host)
  ) {
    return "other_search";
  }
  return "referral";
}

export function randomAnalyticsToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export async function analyticsHmac(secret: string, namespace: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${namespace}:${value}`),
  );
  return toBase64Url(new Uint8Array(signature));
}

export function requestIdentityBasis(request: Request, visitorToken: string) {
  // CF-Connecting-IP is used only transiently as HMAC input for rate limiting.
  // The raw IP is never persisted or forwarded to Supabase.
  return request.headers.get("cf-connecting-ip")?.trim() || visitorToken;
}
