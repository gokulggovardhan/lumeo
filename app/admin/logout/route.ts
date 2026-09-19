import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Keep logout responses generic; do not expose provider internals.
  }

  revalidatePath("/admin", "layout");

  // Use a relative Location so reverse proxies/dev hosts cannot turn logout
  // into a cross-origin navigation (for example 127.0.0.1 -> localhost).
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/admin/login?message=signed-out",
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    },
  });
}
