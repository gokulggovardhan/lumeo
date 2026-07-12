import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/supabase/env";

function isServerComponentCookieWriteError(error: unknown) {
  if (!(error instanceof Error)) return false;

  return (
    error.message.includes("Cookies can only be modified") ||
    error.message.includes("ReadonlyRequestCookies") ||
    error.message.toLowerCase().includes("read-only")
  );
}

export async function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch (error) {
          if (!isServerComponentCookieWriteError(error)) {
            throw error;
          }
        }
      },
    },
  });
}
