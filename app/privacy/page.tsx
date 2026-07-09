import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";

export const metadata: Metadata = {
  title: "Lumeo Privacy Policy",
  description:
    "Privacy Policy for Lumeo PDF Workspace, a simple, privacy-first PDF workspace for everyday documents.",
  alternates: {
    canonical: "https://lumeo.in/privacy",
  },
  openGraph: {
    title: "Lumeo Privacy Policy",
    description:
      "Privacy Policy for Lumeo PDF Workspace, a simple, privacy-first PDF workspace for everyday documents.",
    url: "https://lumeo.in/privacy",
    siteName: "Lumeo",
    type: "website",
  },
};

export default function PrivacyPage() {
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
          Privacy
        </p>

        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Privacy Policy
        </h1>

        <p className="mt-4 text-sm text-[#F7F0DE]/40">
          Last updated: July 2026
        </p>

        <div className="mt-10 space-y-10 text-base leading-8 text-[#F7F0DE]/60">
          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Information we collect
            </h2>
            <p>
              Lumeo may collect basic information needed to operate the site,
              such as browser session data, usage diagnostics, and information
              you choose to provide when using future account-based features.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              How we use information
            </h2>
            <p>
              We use information to provide, maintain, secure, and improve
              Lumeo PDF Workspace. We do not sell your personal information.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Document files
            </h2>
            <p>
              Lumeo is being designed so most PDF tools can run in your browser
              where possible. If server processing is required later, files
              should be temporary and handled with clear deletion rules.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Cookies and session data
            </h2>
            <p>
              Lumeo may use cookies or similar browser storage for essential
              site behavior, security, session management, and product
              reliability.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Security
            </h2>
            <p>
              We take reasonable steps to protect data. No online service can
              guarantee absolute security, so you should keep backup copies of
              important files.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Changes to this policy
            </h2>
            <p>
              This Privacy Policy may be updated as Lumeo develops. Any changes
              will be reflected on this page with an updated date.
            </p>
          </section>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
