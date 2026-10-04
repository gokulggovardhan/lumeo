type CloudflareBotManagement = {
  verifiedBot?: boolean | null;
};

type CloudflareGeo = {
  city?: string | null;
  region?: string | null;
  regionCode?: string | null;
  country?: string | null;
  botManagement?: CloudflareBotManagement | null;
};

type RequestWithCloudflare = Request & {
  cf?: CloudflareGeo;
};

export type ApproximateLocation = {
  city: string | null;
  region: string | null;
  regionCode: string | null;
  country: string | null;
};

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || normalized === "XX") return null;
  return normalized.slice(0, 120);
}

export function readCloudflareApproximateLocation(
  request: Request,
): ApproximateLocation {
  const cf = (request as RequestWithCloudflare).cf;

  return {
    city: clean(cf?.city ?? request.headers.get("cf-ipcity")),
    // Cloudflare `region` is the human-readable first-level region name.
    // Keep it distinct from regionCode. Never use request.cf.colo here:
    // colo is the Cloudflare datacenter, not the visitor's location.
    region: clean(cf?.region ?? request.headers.get("cf-region")),
    regionCode: clean(cf?.regionCode ?? request.headers.get("cf-region-code")),
    country: clean(cf?.country ?? request.headers.get("cf-ipcountry")),
  };
}

export function isCloudflareVerifiedBot(request: Request): boolean {
  const cf = (request as RequestWithCloudflare).cf;
  return cf?.botManagement?.verifiedBot === true;
}

export function formatApproximateLocation(
  location: ApproximateLocation,
): string | null {
  const parts = [
    location.city,
    location.region ?? location.regionCode,
    location.country,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : null;
}

export function encodeAnalyticsGeoCookie(
  location: ApproximateLocation,
): string | null {
  if (!location.city && !location.region && !location.regionCode && !location.country) return null;
  return [
    location.city ?? "",
    location.region ?? location.regionCode ?? "",
    location.country ?? "",
  ].join("|");
}
