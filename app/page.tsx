// app/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";
import { PublicNav } from "@/components/PublicPdfChrome";
import { PdfToolLauncher } from "@/components/pdf/PdfToolLauncher";
import { ContinueWorking } from "@/components/ContinueWorking";
import { withSeoOverride } from "@/lib/public-site/seo";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
import { resolveLumeoTools } from "@/lib/tools/resolve";
import { buildTiles } from "@/lib/tools/tiles";
import {
  LOCAL_FIRST_DISCLOSURE,
  LOCAL_FIRST_MESSAGE,
} from "@/lib/public-site/copy";

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/", {
    title: {
      absolute: "Lumeo PDF - Private Browser-First PDF Tools",
    },
    description:
      "Merge, compress, edit, sign, and convert PDFs and documents in a focused browser-first experience. No account or installation required for current public tools.",
    alternates: { canonical: "/" },
    openGraph: {
      title: "Lumeo PDF - Private Browser-First PDF Tools",
      description:
        "Private, browser-first PDF tools with clear file handling and no installation required.",
      url: "https://lumeo.in",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Lumeo PDF",
      description:
        "Private, browser-first PDF tools with clear file handling.",
    },
  });
}

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Lumeo PDF",
    alternateName: ["Lumeo", "Lumeo PDF Tools", "lumeo.in"],
    url: "https://lumeo.in",
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Lumeo PDF",
    url: "https://lumeo.in",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any modern browser",
    description:
      "Browser-first PDF tools for organizing, optimizing, editing, signing, converting, and extracting document content.",
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

export default async function Home() {
  const catalog = await getPublicPdfCatalog();
  const tiles = buildTiles(resolveLumeoTools(catalog.tools));

  return (
    <main
      id="main-content"
      className="aura-home relative flex min-h-dvh flex-col overflow-x-hidden text-[var(--lumeo-paper-100)]"
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
        <div className="mx-auto w-full max-w-[1160px] px-5 pb-12 pt-5 sm:px-8 sm:pt-7 lg:pt-8">
          <div className="grid items-stretch gap-[0.85rem] sm:gap-[1.15rem] min-[900px]:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.55fr)] min-[900px]:gap-x-6 min-[900px]:gap-y-7">
            <header className="order-1 min-[900px]:col-start-1 min-[900px]:row-start-1">
              <div className="max-w-[48rem]">
              <p className="aura-text-label inline-flex items-center gap-2 text-[var(--text-accent)]">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-[var(--text-accent)]"
                />
                Private, browser-first PDF tools
              </p>

              <h1
                className="mt-2.5 text-[clamp(2rem,10.5vw,2.65rem)] font-semibold leading-[0.98] tracking-[-0.03em] text-[var(--text-primary)] sm:text-[clamp(2.25rem,4.6vw,3.75rem)] sm:leading-[0.99] sm:tracking-[-0.035em]"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                Your PDFs stay yours.
              </h1>

              <p className="mt-2.5 max-w-[43rem] text-[14px] leading-6 text-[var(--text-secondary)] sm:mt-3 sm:text-base">
                Use one focused tool for a quick task, or upload once into PDF
                Workspace and keep the same document open across compatible tools.
              </p>

              <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:mt-4 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                <Link
                  href="/pdf"
                  prefetch={false}
                  className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--action-primary)] px-3 text-center text-[13px] font-bold leading-tight text-[var(--text-on-accent)] shadow-[0_10px_24px_rgba(var(--atelier-sage-rgb),0.14)] transition hover:-translate-y-0.5 hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)] motion-reduce:transform-none sm:px-5 sm:text-sm"
                >
                  Start PDF Workspace
                </Link>
                <Link
                  href="/pdf-tools"
                  prefetch={false}
                  className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-center text-[13px] font-bold leading-tight text-[var(--text-secondary)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)] sm:px-4 sm:text-sm"
                >
                  Explore PDF tools
                </Link>
                <span className="col-span-2 text-xs font-semibold leading-5 text-[var(--text-muted)] sm:w-auto">
                  Quick tool when you need one · Upload once when you need more
                </span>
              </div>
              </div>
            </header>

            <aside className="order-3 self-end rounded-2xl border border-[var(--border-hairline)] bg-[rgba(var(--paper-rgb),0.025)] p-[0.75rem_0.8rem] shadow-[inset_0_1px_0_rgba(var(--paper-rgb),0.035)] sm:p-[0.9rem_1rem] min-[900px]:col-start-2 min-[900px]:row-start-1" aria-label="Lumeo trust principles">
              <p className="aura-text-label text-[var(--atelier-sage-300)]">
                Designed for private document work
              </p>
              <div className="mt-3 grid gap-2.5">
                {trustRail.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2.5 text-[13px] text-[var(--text-secondary)]"
                  >
                    <CheckIcon />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </aside>

            <div className="order-2 min-w-0 min-[900px]:col-span-2 min-[900px]:row-start-2">
              <PdfToolLauncher allToolsLabel="View all tools" />
            </div>
          </div>

          <ContinueWorking tiles={tiles} />

          <section
            className="mt-10 border-y border-[var(--border-hairline)] py-6 sm:mt-11"
            aria-labelledby="privacy-heading"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="aura-text-label text-[var(--atelier-sage-300)]">
                  Local-first privacy
                </p>
                <h2
                  id="privacy-heading"
                  className="mt-1.5 font-serif text-xl font-semibold tracking-[-0.015em] text-[var(--text-primary)]"
                >
                  Private by design. Clear by default.
                </h2>
              </div>
              <div className="max-w-2xl sm:text-right">
                <p className="text-sm leading-6 text-[var(--text-secondary)]">
                  {LOCAL_FIRST_MESSAGE}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  {LOCAL_FIRST_DISCLOSURE}
                </p>
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
