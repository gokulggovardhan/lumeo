const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const ANALYTICS_VISITOR_COOKIE = "lumeo_visitor";
export const ANALYTICS_SESSION_COOKIE = "lumeo_session";
export const ANALYTICS_SYNTHETIC_COOKIE = "lumeo_synthetic_test";
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 30;

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

export function isValidAnalyticsToken(value: string | null | undefined) {
  return Boolean(value && TOKEN_PATTERN.test(value));
}

export function createAnalyticsToken() {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function deriveAnalyticsKey(
  secret: string,
  purpose: "visitor" | "session" | "network",
  rawValue: string,
) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${purpose}:${rawValue}`),
  );
  return toBase64Url(new Uint8Array(signature));
}

export function analyticsCookieOptions(requestUrl: string, maxAge: number) {
  const secure = new URL(requestUrl).protocol === "https:";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
