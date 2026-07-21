import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

// Storage-only client for API routes. Unlike lib/supabase/server.ts this
// carries no request cookies -- the word-to-pdf route is stateless and only
// ever touches the lumeo-temp bucket, never a signed-in session.
export function createStorageServerClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createSupabaseClient(url, publishableKey, {
    auth: { persistSession: false },
  });
}
