import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Lumeo Terms of Use",
  description:
    "Terms of Use for Lumeo, a premium online creative studio for short-form video creation.",
  alternates: {
    canonical: "https://lumeo.in/terms",
  },
  openGraph: {
    title: "Lumeo Terms of Use",
    description:
      "Terms of Use for Lumeo, a premium online creative studio for short-form video creation.",
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
          Terms
        </p>

        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Terms of Use
        </h1>

        <p className="mt-4 text-sm text-[#F7F0DE]/40">
          Last updated: June 2026
        </p>

        <div className="mt-10 space-y-10 text-base leading-8 text-[#F7F0DE]/60">
          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Use of Lumeo
            </h2>
            <p>
              Lumeo is an online creative studio for creating and editing
              short-form videos. By using Lumeo, you agree to use the platform
              responsibly, lawfully, and in accordance with these terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Your content
            </h2>
            <p>
              You retain ownership of the videos, audio, images, text, and
              other materials you upload or create using Lumeo. By uploading
              content, you confirm that you have the rights needed to use that
              content and that your use does not violate the rights of others.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Uploads and exports
            </h2>
            <p>
              Lumeo processes uploaded media to provide editing, preview, and
              export features. You are responsible for reviewing your exported
              content before publishing or sharing it outside Lumeo.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Acceptable use
            </h2>
            <p>
              You may not use Lumeo to upload, create, edit, or distribute
              unlawful, harmful, abusive, infringing, or misleading content.
              You may not attempt to interfere with the platform, misuse
              storage or export systems, or access data that does not belong to
              you.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Service availability
            </h2>
            <p>
              Lumeo is provided as an online service and may change as the
              platform develops. We aim to provide a reliable experience, but
              we do not guarantee uninterrupted access, error-free operation,
              or permanent availability of any specific feature.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Responsibility
            </h2>
            <p>
              Lumeo is designed to support creative workflows, but you remain
              responsible for your content, your project decisions, and how you
              use exported videos. You should keep backup copies of important
              original files outside the platform.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-[#F7F0DE]">
              Changes to these terms
            </h2>
            <p>
              These Terms of Use may be updated as Lumeo develops. Continued
              use of the platform after updates means you accept the revised
              terms.
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