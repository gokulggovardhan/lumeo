export type SupabaseEnv = {
  url: string;
  publishableKey: string;
};

const SUPABASE_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

export function getSupabaseEnv(): SupabaseEnv {
  // Keep these as direct property accesses. Next and Vite/vinext can only
  // replace browser-safe public env values statically when the property name
  // is visible at build time.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) {
    throw new Error(`${SUPABASE_URL_KEY} is required.`);
  }

  if (!publishableKey) {
    throw new Error(`${SUPABASE_PUBLISHABLE_KEY} is required.`);
  }

  return {
    url,
    publishableKey,
  };
}
