import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILD_INFO_CACHE_CONTROL = "no-store, max-age=0, must-revalidate";

// Keep build metadata on a production source path so every certified Cloudflare
// revision exposes the exact commit that the production health gates verify.
export function GET() {
  const response = NextResponse.json({
    commit: process.env.LUMEO_BUILD_SHA || null,
    environment: process.env.LUMEO_DEPLOYMENT_ENV || "unknown",
  });

  response.headers.set("Cache-Control", BUILD_INFO_CACHE_CONTROL);
  return response;
}
