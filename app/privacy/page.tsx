import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Lumeo Privacy Policy",
  description:
    "Privacy Policy for Lumeo, a premium online creative studio for short-form video creation.",
  alternates: {
    canonical: "https://lumeo.in/privacy",
  },
  openGraph: {
    title: "Lumeo Privacy Policy",
    description:
      "Privacy Policy for Lumeo, a premium online creative studio for short-form video creation.",
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
            <span className="font-bold tracking-tight">Lumeo</span>
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
          Last updated: June 2026
        </p>

        <div className="mt-10 space-y-10 text-base leading-8 text-[#F7F0DE]/60">
          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Information we collect
            </h2>
            <p>
              When you use Lumeo, we may collect basic account information
              such as your name and email address for sign-in and project
              access. We may also store project settings, editor preferences,
              uploaded media details, and export-related information needed to
              provide the editing experience.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              How we use information
            </h2>
            <p>
              We use information to provide core Lumeo features such as
              account access, project saving, media editing, preview, export,
              and project management. We do not sell your personal information.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Uploaded media
            </h2>
            <p>
              Media uploaded to Lumeo is used to power your editing workspace
              and export flow. Your uploaded files are associated with your
              project and account. When you delete a project, Lumeo is designed
              to remove the related project media and generated exports from
              active storage.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Project data
            </h2>
            <p>
              Lumeo stores project information such as timeline settings,
              reframe settings, title settings, export preferences, and related
              editing metadata so your workspace can be restored when you
              return.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Cookies and session data
            </h2>
            <p>
              Lumeo may use cookies or similar browser storage for sign-in,
              security, session management, and essential product behavior.
              These are used to keep the product working reliably.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Security
            </h2>
            <p>
              We take reasonable steps to protect account, project, and media
              data. However, no online service can guarantee absolute security.
              You should keep copies of important original media files outside
              of Lumeo.
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

      <footer className="border-t border-[#F3E7C8]/10 px-6 py-8 text-center text-xs text-[#F7F0DE]/35">
        <div className="mb-4 flex items-center justify-center gap-6">
          <Link href="/about" className="transition hover:text-white">
            About
          </Link>
          <Link href="/privacy" className="transition hover:text-white">
            Privacy
          </Link>
          <Link href="/terms" className="transition hover:text-white">
            Terms
          </Link>
        </div>
        <p>© 2026 Lumeo. All rights reserved.</p>
        <p className="mt-1">Developed by Govardhan Gudapakam</p>
      </footer>
    </main>
  );
}