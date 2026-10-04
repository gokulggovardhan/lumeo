type CloudflareGeo = {
  city?: string | null;
  region?: string | null;
  regionCode?: string | null;
  country?: string | null;
  botManagement?: {
    verifiedBot?: boolean | null;
  } | null;
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
  if (!normalized || normalized.toUpperCase() === "XX") return null;
  return normalized.slice(0, 120);
}

function countryCode(value: string | null | undefined) {
  const normalized = clean(value)?.toUpperCase() ?? null;
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

export function readCloudflareApproximateLocation(
  request: Request,
): ApproximateLocation {
  const cf = (request as RequestWithCloudflare).cf;
  const regionCode = clean(
    cf?.regionCode ?? request.headers.get("cf-region-code"),
  );

  return {
    city: clean(cf?.city ?? request.headers.get("cf-ipcity")),
    region: clean(
      cf?.region ??
        request.headers.get("cf-region") ??
        regionCode,
    ),
    regionCode: regionCode?.toUpperCase() ?? null,
    country: countryCode(cf?.country ?? request.headers.get("cf-ipcountry")),
  };
}

export function readCloudflareVerifiedBot(request: Request) {
  const cf = (request as RequestWithCloudflare).cf;
  return cf?.botManagement?.verifiedBot === true;
}

export function formatApproximateLocation(
  location: ApproximateLocation,
): string | null {
  const parts = [location.city, location.region, location.country].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

// Legacy compatibility only. Verified analytics no longer sends geolocation
// through a browser-readable cookie; it reads request.cf in /api/analytics.
export function encodeAnalyticsGeoCookie(
  location: ApproximateLocation,
): string | null {
  if (!location.city && !location.region && !location.country) return null;
  return [
    location.city ?? "",
    location.regionCode ?? location.region ?? "",
    location.country ?? "",
  ].join("|");
}
