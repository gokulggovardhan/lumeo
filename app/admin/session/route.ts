import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

export async function GET() {
  const admin = await getAdminContext();

  if (!admin.authenticated) {
    return NextResponse.json(
      { authenticated: false, authorized: false },
      { status: 401, headers: noStoreHeaders },
    );
  }

  if (!admin.authorized) {
    return NextResponse.json(
      { authenticated: true, authorized: false },
      { status: 403, headers: noStoreHeaders },
    );
  }

  return new NextResponse(null, {
    status: 204,
    headers: noStoreHeaders,
  });
}
