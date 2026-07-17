"use client";

import { useEffect } from "react";

/**
 * iOS Safari can restore a backgrounded tab from the back-forward cache
 * (bfcache) instead of doing a fresh navigation. WebKit does not reliably
 * resume Web Workers / WASM linear memory across that suspend-resume cycle,
 * so PDF tooling (pdf.js worker, WASM) can be left in a dead state with no
 * thrown error to catch. `pageshow` with `event.persisted === true` is the
 * signal that the page came back from bfcache rather than a real load, so we
 * force a real reload to guarantee workers/WASM are reinitialized.
 */
export function ResumeRecovery() {
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        window.location.reload();
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return null;
}
