// app/page.tsx

import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import { PublicNav } from "@/components/PublicPdfChrome";
import { PdfToolLauncher } from "@/components/pdf/PdfToolLauncher";
import { PublicPdfToolsMenu } from "@/components/public/PublicPdfToolsMenu";
import { L2TrustRail } from "@/components/ui/Aura";

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
    <main id="main-content" className="lumeo-page-enter aura-home relative flex min-h-dvh flex-col overflow-x-hidden text-[var(--lumeo-paper-100)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="lumeo-ambient absolute -left-44 -top-52 h-[30rem] w-[30rem] rounded-full bg-[rgba(var(--atelier-sage-rgb),0.055)] blur-[60px] md:blur-[150px]" />
        <div className="lumeo-ambient absolute -right-44 top-[-5rem] h-[28rem] w-[28rem] rounded-full bg-[rgba(var(--atelier-brass-rgb),0.05)] blur-[60px] md:blur-[150px] [animation-delay:-4s]" />
        <div className="absolute bottom-[-16rem] left-[42%] h-[26rem] w-[26rem] rounded-full bg-[rgba(var(--atelier-sage-rgb),0.045)] blur-[60px] md:blur-[145px]" />
      </div>

      <PublicNav toolsMenu={<PublicPdfToolsMenu />} />

      <section className="relative z-10 flex-1">
        <div className="mx-auto w-full max-w-[1160px] px-5 pb-10 pt-6 sm:px-8 sm:pb-12 sm:pt-8 lg:pb-14">
          <section aria-labelledby="tool-heading" className="aura-home-workspace">
            <header className="lumeo-fade-up mx-auto mb-6 max-w-[46rem] text-center sm:mb-7">
              <p className="aura-text-label text-[var(--lumeo-gold-300)]">
                LUMEO PDF WORKSPACE
              </p>
              <h1
                id="tool-heading"
                className="mt-4 font-serif text-[clamp(2.2rem,4.48vw,3.25rem)] leading-[0.98] tracking-[var(--tracking-display)] text-[var(--text-primary)]"
              >
                Documents, beautifully handled.
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[var(--text-secondary)] sm:text-lg">
                Fast PDF tools that work privately in your browser.
              </p>
            </header>

            <div className="lumeo-fade-up lumeo-fade-up-delay-1"><PdfToolLauncher showHeading={false} /></div>
          </section>

          <L2TrustRail
            className="lumeo-fade-up lumeo-fade-up-delay-2 mt-6"
            items={[
              "Browser-first processing",
              "Files stay on your device for supported live tools",
              "Clear your workspace whenever you finish",
            ]}
          />
        </div>
      </section>

      <div className="relative z-10">
        <PublicFooter />
      </div>
    </main>
  );
}
