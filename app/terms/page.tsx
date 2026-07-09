import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";

export const metadata: Metadata = {
  title: "Lumeo Terms of Use",
  description:
    "Terms of Use for Lumeo PDF Workspace, a simple PDF workspace for everyday documents.",
  alternates: {
    canonical: "https://lumeo.in/terms",
  },
  openGraph: {
    title: "Lumeo Terms of Use",
    description:
      "Terms of Use for Lumeo PDF Workspace, a simple PDF workspace for everyday documents.",
    url: "https://lumeo.in/terms",
    siteName: "Lumeo",
    type: "website",
  },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#07070A] text-[#F7F0DE]">
      <nav className="border-b border-[#F3E7C8]/10 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F3E7C8] text-sm font-bold text-[#111018]">
              L
            </div>
            <span className="font-bold tracking-tight">
              Lumeo PDF Workspace
            </span>
          </Link>

          <Link
            href="/"
            className="rounded-full border border-[#F3E7C8]/10 px-4 py-2 text-sm font-semibold text-[#F7F0DE]/55 transition hover:border-[#F3E7C8]/30 hover:text-white"
          >
            Back home
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-6 py-20">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-[#D8C48E]">
          Terms
        </p>

        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Terms of Use
        </h1>

        <p className="mt-4 text-sm text-[#F7F0DE]/40">
          Last updated: July 2026
        </p>

        <div className="mt-10 space-y-10 text-base leading-8 text-[#F7F0DE]/60">
          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Use of Lumeo
            </h2>
            <p>
              Lumeo PDF Workspace provides simple document tools and public
              information pages. By using Lumeo, you agree to use the site
              responsibly and lawfully.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Your files
            </h2>
            <p>
              You are responsible for the files you choose to use with Lumeo
              and for making sure you have the rights needed to process,
              convert, or share those files.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Acceptable use
            </h2>
            <p>
              You may not use Lumeo for unlawful, harmful, infringing, abusive,
              or misleading activity, or attempt to interfere with the site or
              access data that does not belong to you.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Service availability
            </h2>
            <p>
              Lumeo may change as the product develops. We aim to provide a
              reliable experience, but we do not guarantee uninterrupted access,
              error-free operation, or permanent availability of any specific
              feature.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Changes to these terms
            </h2>
            <p>
              These Terms of Use may be updated as Lumeo develops. Continued
              use of the site after updates means you accept the revised terms.
            </p>
          </section>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
