const WORD_TO_PDF_ROUTE = "/pdf/word-to-pdf";
const ISOLATION_RELOAD_KEY = "lumeo:word-to-pdf:isolation-reload";

export function isWordToPdfRoute(pathname: string): boolean {
  return (
    pathname === WORD_TO_PDF_ROUTE ||
    pathname.startsWith(`${WORD_TO_PDF_ROUTE}/`)
  );
}

export function shouldReloadWordToPdfForIsolation(input: {
  pathname: string;
  crossOriginIsolated: boolean;
  previousAttempt: string | null;
}): boolean {
  return (
    isWordToPdfRoute(input.pathname) &&
    !input.crossOriginIsolated &&
    input.previousAttempt !== input.pathname
  );
}

/**
 * Cross-origin isolation is established only by a top-level document response.
 * A Next.js client navigation can change the route to /pdf/word-to-pdf while
 * keeping the non-isolated document that originally loaded /pdf-tools, /guides,
 * or another public page. Perform one hard reload so the route-scoped COOP/COEP
 * headers can create the SharedArrayBuffer-capable document the threaded Office
 * runtime actually requires.
 */
export function ensureWordToPdfCrossOriginIsolation(): boolean {
  if (typeof window === "undefined") return false;

  const pathname = window.location.pathname;
  if (!isWordToPdfRoute(pathname)) return false;

  let previousAttempt: string | null = null;
  try {
    previousAttempt = window.sessionStorage.getItem(ISOLATION_RELOAD_KEY);
  } catch {
    // Storage can be unavailable in hardened/private contexts. In that case,
    // do not risk a reload loop; the normal capability error will explain the
    // missing cross-origin isolation requirement.
  }

  if (window.crossOriginIsolated) {
    try {
      window.sessionStorage.removeItem(ISOLATION_RELOAD_KEY);
    } catch {}
    return false;
  }

  if (
    !shouldReloadWordToPdfForIsolation({
      pathname,
      crossOriginIsolated: window.crossOriginIsolated,
      previousAttempt,
    })
  ) {
    return false;
  }

  try {
    window.sessionStorage.setItem(ISOLATION_RELOAD_KEY, pathname);
  } catch {
    return false;
  }

  window.location.reload();
  return true;
}
