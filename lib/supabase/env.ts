export type SupabaseEnv = {
  url: string;
  publishableKey: string;
};

const SUPABASE_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

export function getSupabaseEnv(): SupabaseEnv {
  const url = process.env[SUPABASE_URL_KEY];
  const publishableKey = process.env[SUPABASE_PUBLISHABLE_KEY];

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
