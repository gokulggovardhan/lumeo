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
    <main className="lumeo-page-enter relative flex min-h-dvh flex-col overflow-x-hidden bg-[#0C1220] text-[#F0EAD6]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="lumeo-ambient absolute -left-44 -top-52 h-[34rem] w-[34rem] rounded-full bg-[#0D2C6D]/22 blur-[155px]" />
        <div className="lumeo-ambient absolute -right-44 top-[-5rem] h-[32rem] w-[32rem] rounded-full bg-[#CBA052]/[0.075] blur-[155px] [animation-delay:-4s]" />
        <div className="absolute bottom-[-18rem] left-[44%] h-[28rem] w-[28rem] rounded-full bg-[#1E6B4A]/[0.07] blur-[150px]" />
      </div>

      <nav className="lumeo-nav-enter relative z-30 border-b border-[#E8DFC8]/8 bg-[#0C1220]/92 px-5 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex h-[70px] max-w-[1160px] items-center justify-between gap-4">
          <Link
            href="/"
            aria-label="Lumeo PDF home"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/50"
          >
            <BrandLockup markSize="h-9 w-9 sm:h-10 sm:w-10" />
          </Link>

          <div className="flex items-center gap-1 text-xs font-semibold text-[#F0EAD6]/64 sm:gap-2 sm:text-sm">
            <PublicPdfToolsMenu />
            <Link href="/guides" className="hidden rounded-full px-4 py-2.5 transition hover:bg-[#F0EAD6]/[0.045] hover:text-[#F0EAD6] sm:inline-flex">
              Guides
            </Link>
            <Link href="/privacy" className="rounded-full px-3 py-2.5 transition hover:bg-[#F0EAD6]/[0.045] hover:text-[#F0EAD6] sm:px-4">
              Privacy
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative z-10 flex-1">
        <div className="mx-auto w-full max-w-[1160px] px-5 pb-10 pt-7 sm:px-8 sm:pb-12 sm:pt-9 lg:pb-14">
          <section aria-labelledby="tool-heading">
            <header className="lumeo-fade-up mx-auto mb-7 max-w-3xl text-center sm:mb-8">
              <p className="text-[0.63rem] font-bold uppercase tracking-[0.2em] text-[#CBA052]">
                Lumeo PDF Workspace
              </p>
              <h1
                id="tool-heading"
                className="mt-3 text-[2.25rem] font-bold leading-[1.05] tracking-[-0.04em] text-[#F0EAD6] sm:text-[3rem]"
              >
                Choose a tool. Get it done.
              </h1>
            </header>

            <div className="lumeo-fade-up lumeo-fade-up-delay-1"><PdfToolLauncher showHeading={false} /></div>
          </section>

          <section className="lumeo-fade-up lumeo-fade-up-delay-2 mx-auto mt-8 max-w-3xl text-center sm:mt-9">
            <p className="text-sm leading-6 text-[#F0EAD6]/64 sm:text-base">
              Merge, split or compress a PDF privately in your browser.
            </p>
            <p className="mt-3 text-xs font-semibold text-[#F0EAD6]/48">
              Browser-only · No account · Cleared after download
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
