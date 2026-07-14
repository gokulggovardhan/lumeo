// app/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";
import { BrandLockup } from "@/components/PublicPdfChrome";
import { PdfToolLauncher } from "@/components/pdf/PdfToolLauncher";
import { PublicPdfToolsMenu } from "@/components/public/PublicPdfToolsMenu";

export const metadata: Metadata = {
  title: {
    absolute:
      "Lumeo PDF - Merge, Split & Compress PDFs Privately in Your Browser",
  },
  description:
    "Merge, split, and compress PDFs privately in your browser. Lumeo is a calm, professional document workspace with no account required.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Lumeo PDF - Private Browser PDF Tools",
    description:
      "Merge, split, and compress PDFs in a private browser-first workspace.",
    url: "https://lumeo.in",
    siteName: "Lumeo PDF",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumeo PDF Workspace",
    description: "Private PDF tools that run in your browser.",
  },
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Lumeo PDF",
    alternateName: ["Lumeo", "Lumeo PDF Workspace", "lumeo.in"],
    url: "https://lumeo.in",
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Lumeo PDF Workspace",
    url: "https://lumeo.in",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any modern browser",
    description:
      "A browser-first PDF workspace for private document merging, splitting, and compression.",
    featureList: ["Merge PDF", "Split PDF", "Compress PDF"],
  },
];

export default function Home() {
  return (
    <main id="main-content" className="lumeo-page-enter aura-home relative flex min-h-dvh flex-col overflow-x-hidden bg-[var(--surface-canvas)] text-[var(--lumeo-paper-100)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="lumeo-ambient absolute -left-44 -top-52 h-[34rem] w-[34rem] rounded-full bg-[#0D2C6D]/22 blur-[155px]" />
        <div className="lumeo-ambient absolute -right-44 top-[-5rem] h-[32rem] w-[32rem] rounded-full bg-[#CBA052]/[0.075] blur-[155px] [animation-delay:-4s]" />
        <div className="absolute bottom-[-18rem] left-[44%] h-[28rem] w-[28rem] rounded-full bg-[#1E6B4A]/[0.07] blur-[150px]" />
      </div>

      <nav className="lumeo-nav-enter aura-public-nav relative z-30 bg-[linear-gradient(180deg,rgba(20,36,59,0.94),rgba(8,16,29,0.82))] px-5 shadow-[0_16px_44px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,253,247,0.08)] backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex h-[70px] max-w-[1160px] items-center justify-between gap-4">
          <Link
            href="/"
            aria-label="Lumeo PDF home"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.2)]"
          >
            <BrandLockup markSize="h-9 w-9 sm:h-10 sm:w-10" />
          </Link>

          <div className="flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)] sm:gap-2 sm:text-sm">
            <PublicPdfToolsMenu />
            <Link href="/guides" className="hidden min-h-11 items-center rounded-full px-4 py-2.5 transition hover:bg-[rgba(var(--lumeo-paper-rgb),0.08)] hover:text-[var(--text-primary)] sm:inline-flex">
              Guides
            </Link>
            <Link href="/privacy" className="inline-flex min-h-11 items-center rounded-full px-3 py-2.5 transition hover:bg-[rgba(var(--lumeo-paper-rgb),0.08)] hover:text-[var(--text-primary)] sm:px-4">
              Privacy
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative z-10 flex-1">
        <div className="mx-auto w-full max-w-[1160px] px-5 pb-10 pt-7 sm:px-8 sm:pb-12 sm:pt-9 lg:pb-14">
          <section aria-labelledby="tool-heading" className="aura-home-workspace">
            <header className="lumeo-fade-up mx-auto mb-7 max-w-3xl text-center sm:mb-8">
              <p className="aura-text-label text-[var(--lumeo-gold-300)]">
                Lumeo PDF Workspace
              </p>
              <h1
                id="tool-heading"
                className="mt-3 font-serif text-[var(--text-display-md)] leading-[var(--leading-display)] tracking-[var(--tracking-display)] text-[var(--lumeo-paper-50)]"
              >
                Work with PDFs beautifully.
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[var(--lumeo-paper-400)]">
                Private, fast, browser-first.
              </p>
            </header>

            <div className="lumeo-fade-up lumeo-fade-up-delay-1"><PdfToolLauncher showHeading={false} /></div>
          </section>

          <section className="lumeo-fade-up lumeo-fade-up-delay-2 mx-auto mt-8 max-w-3xl text-center sm:mt-9">
            <p className="text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
              Choose a workspace and keep moving. The tools stay first.
            </p>
            <p className="mt-3 text-xs font-semibold text-[var(--text-muted)]">
              Private by design · Browser-only · Cleared after download
            </p>
          </section>
        </div>
      </section>

      <div className="relative z-10">
        <PublicFooter />
      </div>
    </main>
  );
}
