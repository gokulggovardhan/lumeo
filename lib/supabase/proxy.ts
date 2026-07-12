import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

function isMissingSupabaseEnv(error: unknown) {
  if (!(error instanceof Error)) return false;

  return (
    error.message === "NEXT_PUBLIC_SUPABASE_URL is required." ||
    error.message === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required."
  );
}

export async function updateSession(request: NextRequest) {
  let env;

  try {
    env = getSupabaseEnv();
  } catch (error) {
    if (!isMissingSupabaseEnv(error)) {
      throw error;
    }

    return NextResponse.next({
      request,
    });
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
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getClaims();

  return response;
}
