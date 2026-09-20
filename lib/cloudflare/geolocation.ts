type CloudflareGeo = {
  city?: string | null;
  region?: string | null;
  country?: string | null;
};

type RequestWithCloudflare = Request & {
  cf?: CloudflareGeo;
};

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readCloudflareGeo(request: Request): CloudflareGeo | null {
  const cf = (request as RequestWithCloudflare).cf;
  if (!cf) return null;

  const city = clean(cf.city);
  const region = clean(cf.region);
  const country = clean(cf.country);

  if (!city && !region && !country) return null;
  return {
    city: city || null,
    region: region || null,
    country: country || null,
  };
}

export function formatApproximateLocation(request: Request): string | null {
  const geo = readCloudflareGeo(request);
  if (!geo) return null;

  const parts = [geo.city, geo.region, geo.country].filter(
    (value): value is string => Boolean(value),
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

export function buildGeoCookieValue(request: Request): string | null {
  const geo = readCloudflareGeo(request);
  if (!geo) return null;
  return [geo.city ?? "", geo.region ?? "", geo.country ?? ""].join("|");
}
