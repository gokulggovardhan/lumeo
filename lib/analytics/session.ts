const SESSION_KEY = "lumeo.analytics.session";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getAnonymousSessionId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing && UUID_PATTERN.test(existing)) return existing;

    const next = window.crypto?.randomUUID?.();
    if (!next || !UUID_PATTERN.test(next)) return null;

    window.sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return null;
  }
}
