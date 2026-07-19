// Shared between lib/supabase/proxy.ts (edge middleware, sets the cookie)
// and lib/analytics/geo.ts (client, reads it). Kept in its own file with no
// other imports so neither side accidentally pulls server-only code
// (next/server, @supabase/ssr) into a client bundle.
export const GEO_COOKIE_NAME = "lumeo_geo";
