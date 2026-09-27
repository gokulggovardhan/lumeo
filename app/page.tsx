// app/page.tsx

import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import { PublicNav } from "@/components/PublicPdfChrome";
import { PdfToolLauncher } from "@/components/pdf/PdfToolLauncher";
import { ContinueWorking } from "@/components/ContinueWorking";
import { withSeoOverride } from "@/lib/public-site/seo";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
import { resolveLumeoTools } from "@/lib/tools/resolve";
import { buildTiles } from "@/lib/tools/tiles";

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/", {
    title: {
      absolute: "Lumeo PDF - Private Browser-First PDF Tools",
    },
    description:
      "Merge, compress, edit, sign, and convert PDFs and documents in a focused browser-first workspace. No account or installation required for current public tools.",
    alternates: { canonical: "/" },
    openGraph: {
      title: "Lumeo PDF - Private Browser-First PDF Tools",
      description:
        "A focused PDF and document workspace with clear browser-first processing.",
      url: "https://lumeo.in",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Lumeo PDF Workspace",
      description:
        "Private, browser-first PDF tools with clear processing details.",
    },
  });
}

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
      "A browser-first PDF workspace for organizing, optimizing, editing, signing, converting, and extracting document content.",
    featureList: [
      "Merge PDF",
      "Split PDF",
      "Organize PDF",
      "Compress PDF",
      "Edit PDF",
      "Crop PDF",
      "Watermark PDF",
      "Page Numbers",
      "Header & Footer",
      "Sign PDF",
      "Word to PDF",
      "PDF to Word",
      "JPG to PDF",
      "PDF to JPG",
      "HTML to PDF",
      "Extract Text",
      "HEIC to JPEG",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Lumeo PDF",
    url: "https://lumeo.in",
    logo: "https://lumeo.in/icon.png",
  },
];

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-[var(--atelier-sage-300)]"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

const trustRail = [
  "Browser-first processing",
  "No account required for public tools",
  "No installation",
];

const privacyItems = [
  {
    title: "Open locally",
    description:
      "Current supported document workflows open files in your browser and explain their handling before you begin.",
  },
  {
    title: "Work locally",
    description:
      "Current public PDF tools are designed around browser-first processing rather than a required cloud document library.",
  },
  {
    title: "Export locally",
    description:
      "Finish the task in the workspace and export the result without creating an account for current public tools.",
  },
];

export default async function Home() {
  const catalog = await getPublicPdfCatalog();
  const tiles = buildTiles(resolveLumeoTools(catalog.tools));

  return (
    <main
      id="main-content"
      className="lumeo-page-enter aura-home relative flex min-h-dvh flex-col overflow-x-hidden text-[var(--lumeo-paper-100)]"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="lumeo-ambient absolute -left-44 -top-52 h-[30rem] w-[30rem] rounded-full bg-[rgba(var(--atelier-sage-rgb),0.045)] blur-[60px] md:blur-[150px]" />
        <div className="lumeo-ambient absolute -right-44 top-[-5rem] h-[28rem] w-[28rem] rounded-full bg-[rgba(var(--atelier-brass-rgb),0.04)] blur-[60px] md:blur-[150px] [animation-delay:-4s]" />
      </div>

      <PublicNav />

      <section className="relative z-10 flex-1">
        <div className="mx-auto w-full max-w-[1160px] px-5 pb-14 pt-5 sm:px-8 sm:pt-7">
          <header className="lumeo-fade-up max-w-[52rem]">
            <p className="aura-text-label text-[var(--text-accent)]">
              Lumeo PDF Workspace
            </p>
            <h1 className="mt-2 font-serif text-[clamp(2rem,4.4vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-[var(--text-primary)]">
              One PDF. One private workspace.
            </h1>
            <p className="mt-2.5 max-w-[46rem] text-[15px] leading-6 text-[var(--text-secondary)] sm:text-base">
              Every change in one session. Open once · Work locally · Undo
              anything · Finish once.
            </p>
          </header>

          <div className="mt-7 sm:mt-8">
            <PdfToolLauncher />
          </div>

          <ContinueWorking tiles={tiles} />

          <section
            className="mt-12 border-y border-[var(--border-hairline)] py-10 sm:mt-14 sm:py-12"
            aria-labelledby="workspace-heading"
          >
            <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="aura-text-label text-[var(--text-premium)]">
                  PDF Workspace
                </p>
                <h2
                  id="workspace-heading"
                  className="mt-2 font-serif text-[1.85rem] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]"
                >
                  Open once. Keep working.
                </h2>
              </div>
              <div className="space-y-3 text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
                <p>
                  The tool directory is the discovery layer. After a document is
                  opened, Lumeo is evolving toward one persistent workspace where
                  compatible edits, page organization, signing, watermarks,
                  numbering, compression, and export can stay connected.
                </p>
                <p>
                  Standalone tool pages remain available. The Workspace connects
                  them so you do not have to repeatedly export, return to the
                  directory, and reopen the same PDF for every compatible step.
                </p>
              </div>
            </div>
          </section>

          <section
            className="mt-10 sm:mt-12"
            aria-labelledby="privacy-heading"
          >
            <div className="grid gap-7 lg:grid-cols-[0.85fr_1.4fr] lg:items-start">
              <div>
                <p className="aura-text-label text-[var(--atelier-sage-300)]">
                  Privacy & local-first
                </p>
                <h2
                  id="privacy-heading"
                  className="mt-2 font-serif text-[1.8rem] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]"
                >
                  Your PDFs stay yours.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
                  Open locally · Work locally · Export locally, where the
                  selected workflow supports browser-local processing.
                </p>

                <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
                  {trustRail.map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]"
                    >
                      <CheckIcon />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {privacyItems.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-[15px] border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-4"
                  >
                    <h3 className="font-serif text-base font-semibold text-[var(--text-primary)]">
                      {item.title}
                    </h3>
                    <p className="mt-1.5 text-[12.5px] leading-5 text-[var(--text-secondary)]">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </section>

      <div className="relative z-10">
        <PublicFooter />
      </div>
    </main>
  );
}
