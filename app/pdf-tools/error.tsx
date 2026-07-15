"use client";

import Link from "next/link";
import { AuraButton, L2PublicErrorState } from "@/components/ui/Aura";

export default function PdfToolsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
