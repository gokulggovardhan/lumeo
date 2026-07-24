import { GEO_COOKIE_NAME } from "@/lib/analytics/geo-cookie-name";

export type GeoInfo = {
  city: string | null;
  region: string | null;
  country: string | null;
};

// Reads the geo cookie set by proxy.ts on every request -- no extra network
// call needed, it's already part of this page's own response.
export function readGeoCookie(): GeoInfo | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${GEO_COOKIE_NAME}=`));
  if (!match) return null;

  const rawValue = match.slice(GEO_COOKIE_NAME.length + 1);

  // proxy.ts joins the three raw segments with "|" and lets the cookie
  // serializer's own percent-encoding handle the whole value on write --
  // that encoding pass turns "|" into "%7C", so it must be decoded once as
  // a whole BEFORE splitting, not split first and decoded per part (that
  // used to find zero literal "|" characters and dump the entire decoded
  // blob into `city` alone, leaving region/country empty).
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawValue);
  } catch {
    return null;
  }

  const [city, region, country] = decoded.split("|").map((part) => part || null);

  if (!city && !region && !country) return null;
  return { city, region, country };
}
