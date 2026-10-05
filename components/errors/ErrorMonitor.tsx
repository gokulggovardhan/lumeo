"use client";

import { useEffect } from "react";
import { captureClientError } from "@/lib/errors/client";
import { isNonActionableGlobalClientError } from "@/lib/errors/classification";

/**
 * Mounted once in the root layout. Catches errors that never reach a React
 * error boundary: script errors, and unhandled promise rejections (the two
 * things window/document-level listeners see that component-tree
 * boundaries structurally cannot).
 */
export function ErrorMonitor() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      const message = event.message || "Unhandled error";
      if (isNonActionableGlobalClientError(message)) return;

      void captureClientError({
        message,
        stack: event.error instanceof Error ? event.error.stack : null,
        source: "client",
        severity: "medium",
      });
    }

    function handleRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      if (isNonActionableGlobalClientError(message)) return;

      void captureClientError({
        message,
        stack: reason instanceof Error ? reason.stack : null,
        source: "unhandled_rejection",
        severity: "medium",
      });
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
