"use client";

import Link from "next/link";

export default function PdfToolsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-dvh bg-[#0C1220] px-5 py-12 text-[#F0EAD6] sm:px-8">
      <section className="mx-auto max-w-xl rounded-[24px] border border-[#E8DFC8]/10 bg-[#111A2B] p-6 text-center">
        <p className="text-[0.63rem] font-bold uppercase tracking-[0.2em] text-[#CBA052]">
          PDF tools
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">Tools are still available.</h1>
        <p className="mt-3 text-sm leading-6 text-[#F0EAD6]/58">
          The live catalog could not load. Local tool routes remain available from the homepage.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-[#1E6B4A]/45 bg-[#1E6B4A]/18 px-4 py-2 text-sm font-bold"
          >
            Try again
          </button>
          <Link href="/" className="rounded-full border border-[#E8DFC8]/12 px-4 py-2 text-sm font-bold">
            Back home
          </Link>
        </div>
      </section>
    </main>
  );
}
