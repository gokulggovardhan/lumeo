import { NextResponse } from "next/server";
import { readPublicRpc } from "@/lib/public-site/read-public-rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await readPublicRpc("get_public_announcements");
  return NextResponse.json(
    Array.isArray(items) ? items : [],
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
