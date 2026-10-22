import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-[70dvh] items-center justify-center bg-[var(--surface-canvas)] px-5 py-16 text-[var(--text-primary)]">
      <section aria-labelledby="not-found-title" className="w-full max-w-xl rounded-3xl border border-current/10 bg-white/5 p-8 text-center shadow-sm sm:p-12">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--lumeo-gold-300)]">404 · Page not found</p>
        <h1 id="not-found-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">This page is not here.</h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed opacity-75">The link may be outdated or the address may contain a typo. Your PDF files have not been uploaded by this page.</p>
        <nav aria-label="Page recovery" className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">Go home</Link>
          <Link href="/pdf" className="rounded-xl border border-current/20 px-5 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">Open PDF Workspace</Link>
        </nav>
      </section>
    </main>
  );
}
