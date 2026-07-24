import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { geolocation } from "@vercel/functions";
import { GEO_COOKIE_NAME } from "@/lib/analytics/geo-cookie-name";
import { getSupabaseEnv } from "@/lib/supabase/env";

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

export async function updateSession(request: NextRequest) {
  let env;

  try {
    env = getSupabaseEnv();
  } catch (error) {
    if (!isMissingSupabaseEnv(error)) {
      throw error;
    }

    return NextResponse.next({
      request,
    });
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
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getClaims();

  const geoCookieValue = buildGeoCookieValue(request);

  if (!bypassesMaintenanceMode(request.nextUrl.pathname)) {
    // Fails open: any RPC error (migration not yet applied, DB unreachable)
    // must never take the whole public site down on its own -- only an
    // explicit enabled:true from the settings row does that.
    const { data, error } = await supabase.rpc("get_public_maintenance_status");
    const enabled = !error && data && typeof data === "object" && (data as { enabled?: unknown }).enabled === true;

    if (enabled) {
      const maintenanceUrl = new URL("/maintenance", request.url);
      const maintenanceResponse = NextResponse.rewrite(maintenanceUrl);
      // Carry over any Set-Cookie from the Supabase session refresh above --
      // rewrite() builds a fresh response, so without this an auth-cookie
      // refresh that happened on this same request would be silently dropped.
      response.cookies.getAll().forEach((cookie) => {
        maintenanceResponse.cookies.set(cookie);
      });
      // Keep search engines from indexing the maintenance page while it's up.
      maintenanceResponse.headers.set("X-Robots-Tag", "noindex");
      applyGeoCookie(maintenanceResponse, geoCookieValue);
      return maintenanceResponse;
    }
  }

  applyGeoCookie(response, geoCookieValue);
  return response;
}
