import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  ACQUISITION_COOKIE_MAX_AGE_SECONDS,
  ANALYTICS_ACQUISITION_COOKIE,
  buildAcquisitionContext,
  encodeAcquisitionCookie,
} from "@/lib/analytics/acquisition";
import { getSupabaseEnv } from "@/lib/supabase/env";

const SESSION_CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const;

const PRODUCTION_HOSTS = new Set(["lumeo.in", "www.lumeo.in"]);

function applyBaselineSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
}

function productionHttpsRedirect(request: NextRequest) {
  const hostname = request.nextUrl.hostname.toLowerCase();
  if (!PRODUCTION_HOSTS.has(hostname)) return null;

  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const isHttp =
    request.nextUrl.protocol === "http:" || forwardedProto === "http";

  if (!isHttp) return null;

  const httpsUrl = request.nextUrl.clone();
  httpsUrl.protocol = "https:";
  const response = NextResponse.redirect(httpsUrl, 308);
  applyBaselineSecurityHeaders(response);
  return response;
}

function shouldCaptureAcquisition(request: NextRequest) {
  if (request.cookies.has(ANALYTICS_ACQUISITION_COOKIE)) return false;
  if (request.method !== "GET") return false;

  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/office-runtime") ||
    pathname.startsWith("/maintenance")
  ) {
    return false;
  }

  const destination = request.headers.get("sec-fetch-dest");
  const acceptsHtml = request.headers.get("accept")?.includes("text/html") ?? false;
  return destination === "document" || acceptsHtml;
}

function acquisitionCookieValue(request: NextRequest) {
  if (!shouldCaptureAcquisition(request)) return null;
  return encodeAcquisitionCookie(
    buildAcquisitionContext(request.url, request.headers.get("referer")),
  );
}

function applyAcquisitionCookie(
  response: NextResponse,
  request: NextRequest,
  value: string | null,
) {
  if (!value) return;
  response.cookies.set(ANALYTICS_ACQUISITION_COOKIE, value, {
    path: "/",
    maxAge: ACQUISITION_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
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
  const httpsRedirect = productionHttpsRedirect(request);
  if (httpsRedirect) return httpsRedirect;

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
    applyAcquisitionCookie(
      fallbackResponse,
      request,
      acquisitionCookieValue(request),
    );
    applyAdminCachePolicy(fallbackResponse, request.nextUrl.pathname);
    applyBaselineSecurityHeaders(fallbackResponse);
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

  const acquisitionValue = acquisitionCookieValue(request);

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
      applyAcquisitionCookie(maintenanceResponse, request, acquisitionValue);
      applyBaselineSecurityHeaders(maintenanceResponse);
      return maintenanceResponse;
    }
  }

  applyAcquisitionCookie(response, request, acquisitionValue);
  applyAdminCachePolicy(response, request.nextUrl.pathname);
  applyBaselineSecurityHeaders(response);
  return response;
}
