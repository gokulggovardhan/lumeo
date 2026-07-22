import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

// Storage-only browser client for the public conversion tools (Word<->PDF).
// Unlike lib/supabase/client.ts (createBrowserClient from @supabase/ssr) this
// deliberately carries NO auth session: it always talks to the lumeo-temp
// bucket as the anonymous role.
//
// Why this exists: the SSR browser client attaches the visitor's session
// cookie as a Bearer JWT. A signed-in visitor (e.g. an admin testing their
// own site) therefore uploads as the `authenticated` role -- but the
// lumeo-temp bucket's storage RLS policy only grants INSERT to `anon`, so
// every authenticated upload fails with "new row violates row-level security
// policy". Anonymous visitors are unaffected, which is why this only bites
// logged-in users. These are ephemeral scratch files with no per-user
// ownership (deleted right after conversion), so the anonymous role is the
// correct, uniform context for all visitors -- mirrors createStorageServerClient.
export function createStorageBrowserClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createSupabaseClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
