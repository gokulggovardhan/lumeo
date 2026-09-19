"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ADMIN_SIGNED_OUT_MARKER } from "@/components/admin/AdminSignOutButton";

const signedOutDestination = "/admin/login?message=session-ended";

type SessionState = {
  authenticated: boolean;
  authorized: boolean;
};

function setSuspended(element: HTMLDivElement | null, suspended: boolean) {
  if (!element) return;

  if (suspended) {
    element.style.display = "none";
    element.setAttribute("aria-hidden", "true");
    element.dataset.adminHistorySuspended = "true";
    return;
  }

  element.style.removeProperty("display");
  element.removeAttribute("aria-hidden");
  delete element.dataset.adminHistorySuspended;
}

function hasSignedOutMarker() {
  try {
    return window.sessionStorage.getItem(ADMIN_SIGNED_OUT_MARKER) === "1";
  } catch {
    return false;
  }
}

function clearSignedOutMarker() {
  try {
    window.sessionStorage.removeItem(ADMIN_SIGNED_OUT_MARKER);
  } catch {
    // Storage is defense in depth only.
  }
}

function isBackForwardNavigation() {
  const [entry] = performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];

  if (entry?.type === "back_forward") return true;

  // Older engines can expose only the legacy numeric navigation type.
  const legacyPerformance = performance as Performance & {
    navigation?: { type?: number };
  };
  return legacyPerformance.navigation?.type === 2;
}

export function AdminSessionBoundary({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    let verificationInFlight = false;

    const suspend = () => setSuspended(rootRef.current, true);
    const resume = () => setSuspended(rootRef.current, false);

    const verifyRestoredSession = async () => {
      if (verificationInFlight) return;
      verificationInFlight = true;
      suspend();

      try {
        const response = await fetch("/admin/session", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        const state = (await response.json()) as SessionState;

        if (!mounted) return;

        if (
          !response.ok ||
          state.authenticated !== true ||
          state.authorized !== true
        ) {
          window.location.replace(signedOutDestination);
          return;
        }

        // The server has re-authorized this restored history entry. Clear a
        // logout marker only after that proof, then reload so the protected
        // layout and dynamic Server Components render fresh data.
        clearSignedOutMarker();
        window.location.reload();
      } catch {
        if (mounted) {
          // History restoration is security-sensitive. A failed verification
          // must never reveal a frozen/cached protected tree.
          window.location.replace(signedOutDestination);
        }
      } finally {
        verificationInFlight = false;
      }
    };

    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted || hasSignedOutMarker()) {
        suspend();
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (
        event.persisted ||
        hasSignedOutMarker() ||
        isBackForwardNavigation()
      ) {
        void verifyRestoredSession();
        return;
      }

      resume();
    };

    const handlePopState = () => {
      // Chromium can restore a protected history entry without reporting
      // pageshow.persisted. Popstate is the deterministic browser-history
      // boundary for that path.
      void verifyRestoredSession();
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("popstate", handlePopState);

    // If the browser performed a full back/forward document navigation,
    // pageshow can occur before React effects attach. Verify immediately from
    // Navigation Timing in that case. A fresh server-authorized page can clear
    // any old logout marker because requireAdmin() already ran for this HTML.
    if (isBackForwardNavigation()) {
      void verifyRestoredSession();
    } else {
      clearSignedOutMarker();
      resume();
    }

    return () => {
      mounted = false;
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return (
    <div ref={rootRef} className="contents">
      {children}
    </div>
  );
}
