"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AuraButton, L2PublicErrorState } from "@/components/ui/Aura";
import { captureClientError } from "@/lib/errors/client";

export default function PdfToolsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void captureClientError({
      message: error.message,
      stack: error.stack ?? null,
      component: "PdfToolsError",
      source: "error_boundary",
      severity: "high",
    });
  }, [error]);

  return (
    <main className="min-h-dvh bg-[var(--surface-canvas)] px-5 py-12 text-[var(--text-primary)] sm:px-8">
      <L2PublicErrorState
        title="Tools are still available."
        message="The live catalog could not load. You can retry or return home without exposing any file data."
        actions={(
          <>
            <AuraButton type="button" onClick={reset}>Try again</AuraButton>
            <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-hairline)] bg-[var(--surface-interactive)] px-4 text-sm font-extrabold text-[var(--text-primary)] shadow-[var(--shadow-xs)] transition hover:bg-[rgba(var(--paper-rgb),0.12)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)]">
              Back home
            </Link>
          </>
        )}
      />
    </main>
  );
}
