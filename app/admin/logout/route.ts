import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    await supabase.auth.signOut();
  } catch {
    // Keep logout responses generic; do not expose provider internals.
  }

  return NextResponse.redirect(
    new URL("/admin/login?message=signed-out", request.url),
    { status: 303 },
  );
}
