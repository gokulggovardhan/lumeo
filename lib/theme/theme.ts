// Aura OS v2 theme helper utilities (PR 2).
//
// Infrastructure only -- nothing in this module is imported or called
// anywhere in the app yet. It exists so a future PR can wire an actual
// theme toggle without first inventing this plumbing. Dark remains the
// only theme actually in production; "light" and "system" are handled
// here for completeness of the API but produce no visual difference
// today since app/aura-v2-tokens.css's [data-theme="light"] block is
// still an intentional placeholder (identical values to dark).

export type AuraTheme = "dark" | "light" | "system";

const STORAGE_KEY = "aura-theme";

export function resolveSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function getStoredTheme(): AuraTheme | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "dark" || value === "light" || value === "system" ? value : null;
}

// Resolves a theme preference (explicit or "system") to the concrete
// theme that should actually be applied.
export function resolveTheme(preference: AuraTheme): "dark" | "light" {
  return preference === "system" ? resolveSystemTheme() : preference;
}

// Writes data-theme onto <html>. Not called anywhere today -- Lumeo's
// production default remains the unscoped :root dark values in
// app/globals.css, which apply regardless of this attribute being
// present or absent.
export function applyTheme(preference: AuraTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolveTheme(preference));
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage can throw in private-browsing/quota-exceeded contexts;
    // theme preference simply won't persist across reloads in that case.
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
