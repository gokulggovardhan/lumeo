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
        <div className="mx-auto w-full max-w-[1160px] px-5 pb-14 pt-5 sm:px-8 sm:pt-7 lg:pt-8">
          <header className={`lumeo-fade-up ${styles.heroGrid}`}>
            <div className="max-w-[50rem]">
              <p className="aura-text-label inline-flex items-center gap-2 text-[var(--text-accent)]">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-[var(--text-accent)]"
                />
                Lumeo PDF Workspace
              </p>
              <h1
                className={`${styles.heroTitle} mt-2.5 font-serif text-[clamp(2.45rem,6vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-[var(--text-primary)]`}
              >
                One PDF. One private workspace.
              </h1>
              <p className="mt-3 max-w-[43rem] text-[15px] leading-6 text-[var(--text-secondary)] sm:text-base">
                Open once · Work locally · Undo anything · Finish once.
                Start with the tool you need and keep your document work focused.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href="/pdf-tools"
                  className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--action-primary)] px-5 text-sm font-bold text-[var(--text-on-accent)] shadow-[0_10px_24px_rgba(var(--atelier-sage-rgb),0.14)] transition hover:-translate-y-0.5 hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)] motion-reduce:transform-none"
                >
                  Explore PDF tools
                </Link>
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                  No installation · Public tools need no account
                </span>
              </div>
            </div>

            <div className={styles.heroTrust} aria-label="Lumeo trust principles">
              <p className="aura-text-label text-[var(--atelier-sage-300)]">
                Local-first by default
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
            </div>
          </header>

          <div className={`${styles.toolStage} mt-8 sm:mt-9`}>
            <PdfToolLauncher />
          </div>

          <ContinueWorking tiles={tiles} />

          <section
            className="mt-12 rounded-[18px] border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-5 py-6 sm:mt-14 sm:px-7 sm:py-7"
            aria-labelledby="workspace-heading"
          >
            <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div>
                <p className="aura-text-label text-[var(--text-premium)]">
                  PDF Workspace
                </p>
                <h2
                  id="workspace-heading"
                  className="mt-1.5 font-serif text-[1.7rem] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]"
                >
                  Less tool-hopping. More continuous work.
                </h2>
              </div>
              <div>
                <p className="text-sm leading-6 text-[var(--text-secondary)] sm:text-[15px]">
                  The directory remains the discovery layer. Lumeo is evolving
                  toward a persistent workspace where compatible document tasks
                  can stay connected after you open a PDF, while standalone tool
                  pages continue to work as they do today.
                </p>
                <Link
                  href="/pdf-tools"
                  className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[var(--atelier-sage-300)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.18)]"
                >
                  View all tools
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </section>

          <section
            className="mt-10 border-y border-[var(--border-hairline)] py-10 sm:mt-12 sm:py-11"
            aria-labelledby="privacy-heading"
          >
            <div className="grid gap-7 lg:grid-cols-[0.8fr_1.3fr] lg:items-start">
              <div>
                <p className="aura-text-label text-[var(--atelier-sage-300)]">
                  Privacy & local-first
                </p>
                <h2
                  id="privacy-heading"
                  className="mt-2 font-serif text-[1.85rem] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]"
                >
                  Your PDFs stay yours.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
                  Lumeo keeps file handling visible and describes browser
                  requirements before supported workflows begin.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {privacyItems.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-[15px] border border-[var(--border-hairline)] bg-[var(--surface-base)] p-4"
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
