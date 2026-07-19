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

  const raw = match.slice(GEO_COOKIE_NAME.length + 1);
  const [city, region, country] = raw.split("|").map((part) => {
    try {
      const decoded = decodeURIComponent(part ?? "");
      return decoded || null;
    } catch {
      return null;
    }
  });

  if (!city && !region && !country) return null;
  return { city, region, country };
}
