import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

export async function GET() {
  const admin = await getAdminContext();

  return NextResponse.json(
    {
      authenticated: admin.authenticated,
      authorized: admin.authorized,
    },
    {
      status: 200,
      headers: noStoreHeaders,
    },
  );
}
