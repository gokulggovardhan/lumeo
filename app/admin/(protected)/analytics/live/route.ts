import { NextResponse, type NextRequest } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";
import { canViewAnalytics } from "@/lib/admin/permissions";
import {
  getVerifiedLiveTraffic,
  type VerifiedTrafficScope,
} from "@/lib/admin/verified-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

function parseScope(value: string | null): VerifiedTrafficScope {
  if (value === "synthetic" || value === "automation" || value === "all") {
    return value;
  }
  return "real_audience";
}

export async function GET(request: NextRequest) {
  const admin = await getAdminContext();
  if (!admin.authenticated) {
    return NextResponse.json(
      { data: null, error: "Authentication required." },
      { status: 401, headers: noStoreHeaders },
    );
  }
  if (!admin.authorized || !canViewAnalytics(admin.role)) {
    return NextResponse.json(
      { data: null, error: "Analytics access denied." },
      { status: 403, headers: noStoreHeaders },
    );
  }

  const scope = parseScope(request.nextUrl.searchParams.get("traffic"));
  const live = await getVerifiedLiveTraffic(scope);
  if (!live.data) {
    return NextResponse.json(
      { data: null, error: live.error },
      { status: 503, headers: noStoreHeaders },
    );
  }

  return NextResponse.json(
    { data: live.data, error: null },
    { status: 200, headers: noStoreHeaders },
  );
}
