import { formatLocationLabel } from "@/lib/analytics/location-names";

type CloudflareBotManagement = {
  verifiedBot?: boolean;
};

type CloudflareGeo = {
  city?: string | null;
  region?: string | null;
  regionCode?: string | null;
  country?: string | null;
  colo?: string | null;
  botManagement?: CloudflareBotManagement | null;
};

export type RequestWithCloudflare = Request & {
  cf?: CloudflareGeo;
};

export type ApproximateLocation = {
  city: string | null;
  region: string | null;
  regionCode: string | null;
  countryCode: string | null;
};

const INVALID_TEXT = new Set([
  "unknown",
  "undefined",
  "null",
  "n/a",
  "na",
  "not found",
  "localhost",
]);

function cleanText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (INVALID_TEXT.has(normalized.toLowerCase())) return null;
  return normalized.slice(0, 120);
}

function cleanCountryCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || normalized === "XX" || !/^[A-Z]{2}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function cleanRegionCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || normalized === "XX" || !/^[A-Z0-9-]{1,12}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function readCloudflareApproximateLocation(
  request: Request,
): ApproximateLocation {
  const cf = (request as RequestWithCloudflare).cf;
  const countryCode = cleanCountryCode(
    cf?.country ?? request.headers.get("cf-ipcountry"),
  );

  // Cloudflare colo is intentionally never read here. It identifies the
  // point of presence that handled the request, not the visitor's location.
  if (!countryCode) {
    return {
      city: null,
      region: null,
      regionCode: null,
      countryCode: null,
    };
  }

  return {
    city: cleanText(cf?.city ?? request.headers.get("cf-ipcity")),
    region: cleanText(cf?.region ?? request.headers.get("cf-region")),
    regionCode: cleanRegionCode(
      cf?.regionCode ?? request.headers.get("cf-region-code"),
    ),
    countryCode,
  };
}

export function isCloudflareVerifiedBot(request: Request) {
  return (request as RequestWithCloudflare).cf?.botManagement?.verifiedBot === true;
}

export function formatApproximateLocation(
  location: ApproximateLocation,
): string | null {
  if (!location.countryCode) return null;

  const region = location.region || location.regionCode;
  return formatLocationLabel(location.city, region, location.countryCode);
}
