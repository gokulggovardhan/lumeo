import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { geolocation } from "@vercel/functions";
import { GEO_COOKIE_NAME } from "@/lib/analytics/geo-cookie-name";
import { getSupabaseEnv } from "@/lib/supabase/env";

const SESSION_CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const;

// Next's cookie serializer already percent-encodes the whole value on write
// (that's a single encoding pass we don't control) -- pre-encoding each
// segment here on top of that double-encodes it. The literal "|" join
// character itself gets encoded to %7C by that pass, so the client-side
// reader must decode the WHOLE value once before splitting on "|", not
// split first and decode each part (see lib/analytics/geo.ts).
function buildGeoCookieValue(request: NextRequest) {
  const { city, countryRegion, country } = geolocation(request);
  if (!city && !countryRegion && !country) return null;
  return [city ?? "", countryRegion ?? "", country ?? ""].join("|");
}

function applyGeoCookie(response: NextResponse, value: string | null) {
  if (!value) return;
  response.cookies.set(GEO_COOKIE_NAME, value, {
    path: "/",
    maxAge: 60 * 60 * 24,
    sameSite: "lax",
  });
}

function applySessionHeaders(
  response: NextResponse,
  headers: Record<string, string> | undefined,
) {
  if (!headers) return;

  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
}

function copySessionMetadata(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });

  SESSION_CACHE_HEADERS.forEach((key) => {
    const value = from.headers.get(key);
    if (value) {
      to.headers.set(key, value);
    }
  });
}

function isMissingSupabaseEnv(error: unknown) {
  if (!(error instanceof Error)) return false;

  return (
    error.message === "NEXT_PUBLIC_SUPABASE_URL is required." ||
    error.message === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required."
  );
}

// Routes that must stay reachable even when maintenance mode is on: the admin
// console itself (so an owner can turn it back off) and the maintenance page
// it rewrites to (rewriting a request already destined for /maintenance back
// to /maintenance would loop).
function bypassesMaintenanceMode(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/maintenance");
}

function applyAdminCachePolicy(response: NextResponse, pathname: string) {
  if (!pathname.startsWith("/admin")) return;
  response.headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate",
  );
}

export async function updateSession(request: NextRequest) {
  let env;

  try {
    env = getSupabaseEnv();
  } catch (error) {
    if (!isMissingSupabaseEnv(error)) {
      throw error;
    }

    const fallbackResponse = NextResponse.next({
      request,
    });
    applyAdminCachePolicy(fallbackResponse, request.nextUrl.pathname);
    return fallbackResponse;
  }

  const { url, publishableKey } = env;
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        // @supabase/ssr supplies cache-control metadata alongside refreshed
        // auth cookies. Dropping it can allow a refreshed/stale auth response
        // to be cached independently of its cookies, producing intermittent
        // session state across browsers and edge caches.
        applySessionHeaders(response, headers);
      },
    },
  });

  // Keep this immediately after client construction. Supabase SSR relies on
  // getClaims() to validate/refresh the request session before downstream
  // Server Components read it.
  await supabase.auth.getClaims();

  const geoCookieValue = buildGeoCookieValue(request);

  if (!bypassesMaintenanceMode(request.nextUrl.pathname)) {
    // Fails open: any RPC error (migration not yet applied, DB unreachable)
    // must never take the whole public site down on its own -- only an
    // explicit enabled:true from the settings row does that.
    const { data, error } = await supabase.rpc("get_public_maintenance_status");
    const enabled =
      !error &&
      data &&
      typeof data === "object" &&
      (data as { enabled?: unknown }).enabled === true;

    if (enabled) {
      const maintenanceUrl = new URL("/maintenance", request.url);
      const maintenanceResponse = NextResponse.rewrite(maintenanceUrl);
      // rewrite() builds a fresh response. Preserve both refreshed cookies
      // and Supabase's cache-control metadata so auth state cannot go stale.
      copySessionMetadata(response, maintenanceResponse);
      maintenanceResponse.headers.set("X-Robots-Tag", "noindex");
      applyGeoCookie(maintenanceResponse, geoCookieValue);
      return maintenanceResponse;
    }
  }

  applyGeoCookie(response, geoCookieValue);
  applyAdminCachePolicy(response, request.nextUrl.pathname);
  return response;
}
