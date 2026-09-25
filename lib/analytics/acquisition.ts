export const ANALYTICS_ACQUISITION_COOKIE = "lumeo_acquisition";
export const ACQUISITION_COOKIE_MAX_AGE_SECONDS = 60 * 30;

export type AcquisitionSource =
  | "direct"
  | "google"
  | "bing"
  | "other_search"
  | "referral"
  | "campaign";

export type AcquisitionContext = {
  source: AcquisitionSource;
  referrerHost: string | null;
  landingPath: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

const OWN_HOSTS = new Set(["lumeo.in", "www.lumeo.in"]);

function cleanCampaignValue(value: string | null, maxLength: number) {
  if (!value) return null;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
  return cleaned || null;
}

export function normalizeAnalyticsPath(value: string) {
  try {
    const url = value.startsWith("http://") || value.startsWith("https://")
      ? new URL(value)
      : new URL(value, "https://lumeo.in");
    const pathname = url.pathname.replace(/\/{2,}/g, "/").slice(0, 220);
    if (!/^\/[A-Za-z0-9/_-]*$/.test(pathname)) return "/";
    return pathname || "/";
  } catch {
    return "/";
  }
}

export function normalizedReferrerHost(value: string | null) {
  if (!value) return null;
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/\.$/, "");
    if (!hostname || OWN_HOSTS.has(hostname)) return null;
    if (!/^[a-z0-9.-]+$/.test(hostname)) return null;
    return hostname.slice(0, 160);
  } catch {
    return null;
  }
}

function sourceFromReferrer(host: string | null): AcquisitionSource {
  if (!host) return "direct";
  if (/(^|\.)google\.[a-z.]+$/i.test(host)) return "google";
  if (host === "bing.com" || host.endsWith(".bing.com")) return "bing";
  if (
    /(^|\.)(duckduckgo\.com|search\.yahoo\.com|baidu\.com|yandex\.[a-z.]+)$/i.test(host)
  ) {
    return "other_search";
  }
  return "referral";
}

export function buildAcquisitionContext(
  requestUrl: string,
  referrer: string | null,
): AcquisitionContext {
  const url = new URL(requestUrl);
  const utmSource = cleanCampaignValue(url.searchParams.get("utm_source"), 100);
  const utmMedium = cleanCampaignValue(url.searchParams.get("utm_medium"), 100);
  const utmCampaign = cleanCampaignValue(url.searchParams.get("utm_campaign"), 120);
  const referrerHost = normalizedReferrerHost(referrer);

  return {
    source: utmSource || utmMedium || utmCampaign ? "campaign" : sourceFromReferrer(referrerHost),
    referrerHost,
    landingPath: normalizeAnalyticsPath(url.pathname),
    utmSource,
    utmMedium,
    utmCampaign,
  };
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function encodeAcquisitionCookie(context: AcquisitionContext) {
  return encodeBase64Url(JSON.stringify(context));
}

export function decodeAcquisitionCookie(value: string | null | undefined): AcquisitionContext | null {
  if (!value || value.length > 1500) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(value)) as Partial<AcquisitionContext>;
    if (
      !parsed.source ||
      !["direct", "google", "bing", "other_search", "referral", "campaign"].includes(parsed.source) ||
      typeof parsed.landingPath !== "string"
    ) {
      return null;
    }
    return {
      source: parsed.source,
      referrerHost: typeof parsed.referrerHost === "string" ? parsed.referrerHost.slice(0, 160) : null,
      landingPath: normalizeAnalyticsPath(parsed.landingPath),
      utmSource: typeof parsed.utmSource === "string" ? cleanCampaignValue(parsed.utmSource, 100) : null,
      utmMedium: typeof parsed.utmMedium === "string" ? cleanCampaignValue(parsed.utmMedium, 100) : null,
      utmCampaign: typeof parsed.utmCampaign === "string" ? cleanCampaignValue(parsed.utmCampaign, 120) : null,
    };
  } catch {
    return null;
  }
}
