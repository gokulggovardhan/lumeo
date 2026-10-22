"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AuraButton, L2PublicErrorState } from "@/components/ui/Aura";
import { captureClientError } from "@/lib/errors/client";

export default function PdfToolError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void captureClientError({
      message: "PDF tool render failure",
      component: "PdfToolError",
      source: "error_boundary",
      severity: "high",
    });
  }, [error]);

  return (
    <main id="main-content" className="min-h-dvh bg-[var(--surface-canvas)] px-5 py-12 text-[var(--text-primary)] sm:px-8">
      <L2PublicErrorState
        title="This tool hit a snag."
        message="This PDF could not be opened or processed. Check the document format and try again. If you were editing, unsaved changes may be lost when you leave."
        actions={(
          <>
            <AuraButton type="button" onClick={reset}>Try again</AuraButton>
            <Link href="/pdf" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-hairline)] bg-[var(--surface-interactive)] px-4 text-sm font-extrabold text-[var(--text-primary)] shadow-[var(--shadow-xs)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)]">PDF Workspace</Link>
            <Link href="/pdf-tools" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-hairline)] bg-[var(--surface-interactive)] px-4 text-sm font-extrabold text-[var(--text-primary)] shadow-[var(--shadow-xs)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)]">PDF Tools</Link>
            <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-hairline)] bg-[var(--surface-interactive)] px-4 text-sm font-extrabold text-[var(--text-primary)] shadow-[var(--shadow-xs)] transition hover:bg-[rgba(var(--paper-rgb),0.12)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)]">
              Back home
            </Link>
          </>
        )}
      />
    </main>
  );
}
