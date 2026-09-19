"use client";

import { useEffect, useRef, type ReactNode } from "react";

const signedOutDestination = "/admin/login?message=session-ended";

function setSuspended(element: HTMLDivElement | null, suspended: boolean) {
  if (!element) return;

  if (suspended) {
    element.style.visibility = "hidden";
    element.style.pointerEvents = "none";
    element.setAttribute("aria-hidden", "true");
    element.dataset.adminHistorySuspended = "true";
    return;
  }

  element.style.removeProperty("visibility");
  element.style.removeProperty("pointer-events");
  element.removeAttribute("aria-hidden");
  delete element.dataset.adminHistorySuspended;
}

export function AdminSessionBoundary({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    const suspend = () => setSuspended(rootRef.current, true);
    const resume = () => setSuspended(rootRef.current, false);

    const verifyRestoredSession = async () => {
      suspend();

      try {
        const response = await fetch("/admin/session", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });

        if (!mounted) return;

        if (!response.ok) {
          window.location.replace(signedOutDestination);
          return;
        }

        // A BFCache entry contains a frozen React / Server Component tree.
        // Even after the session probe succeeds, reload so the protected
        // layout authorizes again and dynamic admin data is rendered fresh.
        window.location.reload();
      } catch {
        if (mounted) {
          // History restoration is security-sensitive. A failed verification
          // must never reveal the frozen protected tree.
          window.location.replace(signedOutDestination);
        }
      }
    };

    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted) {
        suspend();
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void verifyRestoredSession();
        return;
      }

      resume();
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      mounted = false;
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return (
    <div ref={rootRef} className="contents">
      {children}
    </div>
  );
}
