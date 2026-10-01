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
import styles from "./home.module.css";

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

const privacyItems = [
  {
    title: "Files stay local where supported",
    description:
      "Supported workflows are designed to process documents in your browser instead of sending them away for routine PDF work.",
  },
  {
    title: "Clear file handling",
    description:
      "Each tool explains how it handles files and any browser requirements before you begin.",
  },
  {
    title: "No unnecessary storage",
    description:
      "Current public tools do not require a Lumeo account or cloud document library to complete everyday tasks.",
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
        <div className="mx-auto w-full max-w-[1160px] px-5 pb-12 pt-5 sm:px-8 sm:pt-7 lg:pt-8">
          <header className={`lumeo-fade-up ${styles.heroGrid}`}>
            <div className="max-w-[48rem]">
              <p className="aura-text-label inline-flex items-center gap-2 text-[var(--text-accent)]">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-[var(--text-accent)]"
                />
                Private, browser-first PDF tools
              </p>

              <h1
                className={`${styles.heroTitle} mt-2.5 font-serif text-[clamp(2.45rem,6vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-[var(--text-primary)]`}
              >
                Your PDFs stay yours.
              </h1>

              <p className="mt-3 max-w-[43rem] text-[15px] leading-6 text-[var(--text-secondary)] sm:text-base">
                Merge, edit, sign, compress, and convert documents directly in
                your browser, with file handling explained before you begin.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href="/pdf-tools"
                  className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--action-primary)] px-5 text-sm font-bold text-[var(--text-on-accent)] shadow-[0_10px_24px_rgba(var(--atelier-sage-rgb),0.14)] transition hover:-translate-y-0.5 hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)] motion-reduce:transform-none"
                >
                  Explore PDF tools
                </Link>
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                  Fast to open · Simple to use
                </span>
              </div>
            </div>

            <aside className={styles.heroTrust} aria-label="Lumeo trust principles">
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
          </header>

          <div className="mt-7 sm:mt-8">
            <PdfToolLauncher allToolsLabel="View all tools" />
          </div>

          <ContinueWorking tiles={tiles} />

          <section
            className="mt-11 border-y border-[var(--border-hairline)] py-9 sm:mt-12 sm:py-10"
            aria-labelledby="privacy-heading"
          >
            <div className="grid gap-6 lg:grid-cols-[0.78fr_1.3fr] lg:items-start">
              <div>
                <p className="aura-text-label text-[var(--atelier-sage-300)]">
                  Privacy, without the fine print
                </p>
                <h2
                  id="privacy-heading"
                  className="mt-2 font-serif text-[1.8rem] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]"
                >
                  Private by design. Clear by default.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
                  Lumeo keeps the privacy message simple: explain where work
                  happens, avoid unnecessary storage, and tell you what a tool
                  needs before it starts.
                </p>
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
