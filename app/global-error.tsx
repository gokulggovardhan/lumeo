"use client";

import { useEffect } from "react";
import { captureClientError } from "@/lib/errors/client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void captureClientError({
      message: error.message,
      stack: error.stack ?? null,
      component: "GlobalError",
      source: "error_boundary",
      severity: "critical",
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "2rem",
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Something went wrong.</h1>
          <p style={{ maxWidth: "32ch", color: "#666" }}>
            Your files never left your device. Try again or reload the page.
          </p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: "2.75rem",
                padding: "0 1rem",
                borderRadius: "0.5rem",
                border: "1px solid #ccc",
                background: "#111",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                minHeight: "2.75rem",
                padding: "0 1rem",
                borderRadius: "0.5rem",
                border: "1px solid #ccc",
                background: "#fff",
                color: "#111",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
