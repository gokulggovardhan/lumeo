type CloudflareGeo = {
  city?: string | null;
  region?: string | null;
  regionCode?: string | null;
  country?: string | null;
};

type RequestWithCloudflare = Request & {
  cf?: CloudflareGeo;
};

export type ApproximateLocation = {
  city: string | null;
  region: string | null;
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
    region: clean(
      cf?.regionCode ??
        cf?.region ??
        request.headers.get("cf-region-code") ??
        request.headers.get("cf-region"),
    ),
    country: clean(cf?.country ?? request.headers.get("cf-ipcountry")),
  };
}

export function formatApproximateLocation(
  location: ApproximateLocation,
): string | null {
  const parts = [location.city, location.region, location.country].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

export function encodeAnalyticsGeoCookie(
  location: ApproximateLocation,
): string | null {
  if (!location.city && !location.region && !location.country) return null;
  return [
    location.city ?? "",
    location.region ?? "",
    location.country ?? "",
  ].join("|");
}
