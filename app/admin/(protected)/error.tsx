"use client";

import Link from "next/link";
import { useEffect } from "react";
import { captureClientError } from "@/lib/errors/client";

export default function ProtectedAdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void captureClientError({
      message: "Protected admin route render failure",
      source: "error_boundary",
      component: "ProtectedAdminErrorBoundary",
      severity: "high",
    });
    if (process.env.NODE_ENV === "development") console.error("Protected admin route error", error);
  }, [error]);

  return (
    <section role="alert" aria-labelledby="protected-admin-error-title" className="mx-auto w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-8 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest">Lumeo Control Center</p>
      <h1 id="protected-admin-error-title" className="mt-4 text-3xl font-semibold">This admin page could not load.</h1>
      <p className="mt-4 leading-relaxed opacity-75">Retry the page. If your administrator session has expired, sign in again. No administrator access is granted by this error screen.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Try again</button>
        <Link href="/admin/login" className="rounded-xl border border-current/20 px-5 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Admin sign in</Link>
        <Link href="/" className="rounded-xl border border-current/20 px-5 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Public site</Link>
      </div>
    </section>
  );
}
