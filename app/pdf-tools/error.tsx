"use client";

import Link from "next/link";

export default function PdfToolsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-dvh bg-[var(--surface-canvas)] px-5 py-12 text-[var(--text-primary)] sm:px-8">
      <section className="aura-luminous-card mx-auto max-w-xl rounded-[var(--radius-2xl)] p-6 text-center">
        <p className="relative text-[0.63rem] font-bold uppercase tracking-[0.2em] text-[var(--text-accent)]">
          PDF tools
        </p>
        <h1 className="relative mt-3 text-3xl font-bold tracking-[-0.04em]">Tools are still available.</h1>
        <p className="relative mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          The live catalog could not load. Local tool routes remain available from the homepage.
        </p>
        <div className="relative mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-[linear-gradient(180deg,var(--lumeo-seal-400),var(--lumeo-seal-600))] px-4 py-2 text-sm font-bold text-[var(--text-primary)] shadow-[var(--shadow-success)]"
          >
            Try again
          </button>
          <Link href="/" className="rounded-full bg-[rgba(var(--lumeo-paper-rgb),0.075)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)]">
            Back home
          </Link>
        </div>
      </section>
    </main>
  );
}
