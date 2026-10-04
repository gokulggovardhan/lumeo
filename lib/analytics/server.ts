import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const ANALYTICS_VISITOR_COOKIE = "lumeo.analytics.visitor.v2";
export const ANALYTICS_SESSION_COOKIE = "lumeo.analytics.session.v2";
export const ANALYTICS_VISITOR_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
export const ANALYTICS_SESSION_MAX_AGE_SECONDS = 60 * 30;

let cachedSecret: string | null = null;
let cachedHmacKey: Promise<CryptoKey> | null = null;

function analyticsSecret() {
  const value = process.env.LUMEO_ANALYTICS_INGEST_SECRET?.trim();
  if (!value || value.length < 32) return null;
  return value;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function createAnalyticsToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function hmacKey(secret: string) {
  if (cachedSecret !== secret || !cachedHmacKey) {
    cachedSecret = secret;
    cachedHmacKey = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }
  return cachedHmacKey;
}

export async function pseudonymousAnalyticsKey(value: string) {
  const secret = analyticsSecret();
  if (!secret) return null;
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return base64Url(new Uint8Array(signature));
}

export function analyticsIngestAvailable() {
  return Boolean(analyticsSecret());
}

export async function writeTrustedAnalyticsEvent(
  args: Record<string, string | number | boolean | null>,
) {
  const secret = analyticsSecret();
  if (!secret) {
    return { ok: false as const, reason: "not_configured" as const };
  }

  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createSupabaseClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-lumeo-analytics-ingest": secret,
      },
    },
  });

  const { error } = await supabase.rpc("record_trusted_analytics_event", args);
  if (error) {
    return {
      ok: false as const,
      reason: /rate limit/i.test(error.message) ? "rate_limit" as const : "write_failed" as const,
    };
  }

  return { ok: true as const };
}
