import { NextResponse, type NextRequest } from "next/server";
import {
  ANALYTICS_SESSION_COOKIE,
  ANALYTICS_SESSION_MAX_AGE,
  ANALYTICS_VISITOR_COOKIE,
  ANALYTICS_VISITOR_MAX_AGE,
  acquisitionSource,
  analyticsHmac,
  classifyTraffic,
  parseServerAnalyticsInput,
  randomAnalyticsToken,
  readTrustedGeo,
  requestIdentityBasis,
} from "@/lib/analytics/server-ingest";
import { getSupabaseEnv } from "@/lib/supabase/env";

function responseWithCookies(
  request: NextRequest,
  visitorToken: string,
  sessionToken: string,
  status = 200,
) {
  const response = NextResponse.json(
    { ok: status >= 200 && status < 300 },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    },
  );
  const secure = request.nextUrl.protocol === "https:";
  response.cookies.set(ANALYTICS_VISITOR_COOKIE, visitorToken, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: ANALYTICS_VISITOR_MAX_AGE,
  });
  response.cookies.set(ANALYTICS_SESSION_COOKIE, sessionToken, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: ANALYTICS_SESSION_MAX_AGE,
  });
  return response;
}

export async function POST(request: NextRequest) {
  if (request.headers.get("dnt") === "1") {
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const ingestSecret = process.env.LUMEO_ANALYTICS_INGEST_SECRET;
  if (!ingestSecret || ingestSecret.length < 32) {
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const input = parseServerAnalyticsInput(body);
  if (!input) return NextResponse.json({ ok: false }, { status: 400 });

  const existingVisitor = request.cookies.get(ANALYTICS_VISITOR_COOKIE)?.value;
  const existingSession = request.cookies.get(ANALYTICS_SESSION_COOKIE)?.value;
  const visitorToken = existingVisitor || randomAnalyticsToken();
  const sessionToken = existingSession || randomAnalyticsToken();
  const newSession = !existingSession;

  const [visitorKey, sessionKey, requestKey] = await Promise.all([
    analyticsHmac(ingestSecret, "visitor", visitorToken),
    analyticsHmac(ingestSecret, "session", sessionToken),
    analyticsHmac(
      ingestSecret,
      "request",
      requestIdentityBasis(request, visitorToken),
    ),
  ]);

  const geo = readTrustedGeo(request);
  const traffic = classifyTraffic(request);
  const { url, publishableKey } = getSupabaseEnv();

  const rpcResponse = await fetch(
    `${url}/rest/v1/rpc/record_server_analytics_event`,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        "Content-Type": "application/json",
        "x-lumeo-analytics-ingest": ingestSecret,
      },
      cache: "no-store",
      body: JSON.stringify({
        p_event_name: input.eventName,
        p_tool_slug: input.toolSlug,
        p_visitor_key: visitorKey,
        p_session_key: sessionKey,
        p_request_key: requestKey,
        p_traffic_class: traffic.trafficClass,
        p_traffic_class_reason: traffic.reason,
        p_duration_ms: input.durationMs,
        p_input_size_bucket: input.inputSizeBucket,
        p_output_size_bucket: input.outputSizeBucket,
        p_device_class: input.deviceClass,
        p_browser_family: input.browserFamily,
        p_operating_system: input.operatingSystem,
        p_success: input.success,
        p_error_code: input.errorCode,
        p_country_code: geo.countryCode,
        p_region: geo.region,
        p_region_code: geo.regionCode,
        p_city: geo.city,
        p_geo_source: geo.geoSource,
        p_geo_precision: geo.geoPrecision,
        p_page_path: input.pagePath,
        p_referrer_host: input.referrerHost,
        p_landing_path: newSession ? input.pagePath : null,
        p_acquisition_source: acquisitionSource(input),
        p_utm_source: input.utmSource,
        p_utm_medium: input.utmMedium,
        p_utm_campaign: input.utmCampaign,
        p_failure_stage: input.failureStage,
      }),
    },
  );

  if (!rpcResponse.ok) {
    const detail = await rpcResponse.text();
    if (/rate limit/i.test(detail)) {
      return responseWithCookies(request, visitorToken, sessionToken, 429);
    }
    return responseWithCookies(request, visitorToken, sessionToken, 502);
  }

  return responseWithCookies(request, visitorToken, sessionToken);
}
