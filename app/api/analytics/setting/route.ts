import { NextResponse } from "next/server";
import { readPublicRpc } from "@/lib/public-site/read-public-rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = await readPublicRpc("get_public_analytics_setting");
  return NextResponse.json(
    { enabled: enabled === true },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
