"use client";

import { useEffect } from "react";
import Link from "next/link";
import { captureClientError } from "@/lib/errors/client";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Report only a fixed category, never raw exception text, stack or PDF content.
    void captureClientError({ message: "Public route render failure", source: "error_boundary", component: "RootErrorBoundary", severity: "high" });
    if (process.env.NODE_ENV === "development") console.error("Lumeo route error", error);
  }, [error]);

  return (
    <main id="main-content" className="flex min-h-[70dvh] items-center justify-center bg-[var(--surface-canvas)] px-5 py-16 text-[var(--text-primary)]">
      <section role="alert" aria-labelledby="error-title" className="w-full max-w-xl rounded-3xl border border-current/10 bg-white/5 p-8 text-center shadow-sm sm:p-12">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--lumeo-gold-300)]">Something went wrong</p>
        <h1 id="error-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">We could not open this page.</h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed opacity-75">Please try again. If your connection is unavailable, reconnect and retry. If you were editing a PDF, avoid refreshing until you have saved your work: unsaved changes may be lost.</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => reset()} className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">Try again</button>
          <Link href="/pdf" className="rounded-xl border border-current/20 px-5 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">PDF Workspace</Link>
          <Link href="/pdf-tools" className="rounded-xl border border-current/20 px-5 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">PDF Tools</Link>
          <Link href="/" className="rounded-xl border border-current/20 px-5 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">Home</Link>
        </div>
      </section>
    </main>
  );
}
