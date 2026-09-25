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

function ShieldIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 text-[var(--atelier-sage-300)]"
    >
      <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" />
      <path d="m9.5 12 1.7 1.7 3.6-3.9" />
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
      "Current public document workflows are designed to process supported files in your browser instead of sending them away for conversion.",
  },
  {
    title: "Processing is explained up front",
    description:
      "Each workspace tells you how it handles files before you begin, including browser capability requirements where they matter.",
  },
  {
    title: "No unnecessary document storage",
    description:
      "The current public tools do not require a Lumeo account or cloud document library to complete everyday tasks.",
  },
];

const categoryItems = [
  {
    title: "Organize",
    description: "Merge, split, reorder, rotate, duplicate, and remove pages.",
  },
  {
    title: "Edit",
    description: "Edit content, crop pages, add watermarks, numbers, headers, and footers.",
  },
  {
    title: "Convert",
    description: "Move between PDF, Word, images, and HTML.",
  },
  {
    title: "Sign & Fill",
    description: "Sign and initial documents now, with form workflows fitting here later.",
  },
  {
    title: "Optimize",
    description: "Reduce PDF size with clear quality controls.",
  },
  {
    title: "Recognize",
    description: "Extract selectable text now; OCR belongs here when it arrives.",
  },
  {
    title: "Secure",
    description: "A clear home for protection, unlocking, and permanent redaction as those tools ship.",
  },
  {
    title: "Image Tools",
    description: "HEIC to JPEG and other image utilities outside the core PDF workflow.",
  },
];

const qualityItems = [
  {
    title: "Focused",
    description: "Common actions are obvious without turning the homepage into a wall of utilities.",
  },
  {
    title: "Cross-platform",
    description: "Open Lumeo in a supported modern browser without installing a desktop application.",
  },
  {
    title: "Clean exports",
    description: "Each tool is built around a clear result, review step, and downloadable output.",
  },
  {
    title: "Accessible by default",
    description: "Keyboard, focus, responsive layout, and reduced-motion behavior stay part of the product contract.",
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
        <div className="mx-auto w-full max-w-[1160px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12 lg:pt-14">
          <header className="lumeo-fade-up mx-auto max-w-[46rem] text-center">
            <p className="aura-text-label inline-flex items-center gap-2 text-[var(--text-accent)]">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-[var(--text-accent)]"
              />
              Private, browser-first document workspace
            </p>
            <h1 className="mt-4 font-serif text-[clamp(2.45rem,6vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-[var(--text-primary)]">
              Your PDFs stay yours.
            </h1>
            <p className="mx-auto mt-5 max-w-[41rem] text-[15px] leading-7 text-[var(--text-secondary)] sm:text-lg">
              Merge, edit, sign, compress, and convert documents in a focused
              workspace. Current supported workflows process files in your
              browser, with handling explained before you begin.
            </p>
            <Link
              href="/pdf-tools"
              className="mt-7 inline-flex min-h-12 items-center justify-center rounded-[var(--radius-md)] bg-[var(--action-primary)] px-6 text-sm font-bold text-[var(--text-on-accent)] shadow-[0_12px_28px_rgba(var(--atelier-sage-rgb),0.16)] transition hover:-translate-y-0.5 hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)] motion-reduce:transform-none"
            >
              Explore PDF tools
            </Link>
          </header>

          <div className="mx-auto mt-9 flex max-w-[50rem] flex-wrap justify-center gap-x-6 gap-y-3 border-y border-[var(--border-hairline)] py-4 sm:mt-10 sm:gap-x-10">
            {trustRail.map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
              >
                <CheckIcon />
                {item}
              </div>
            ))}
          </div>

          <div className="mt-16 sm:mt-20">
            <PdfToolLauncher />
          </div>

          <ContinueWorking tiles={tiles} />

          <section className="mt-20 border-y border-[var(--border-hairline)] py-16 sm:mt-24 sm:py-20">
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1.4fr] lg:items-start">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-[rgba(var(--atelier-sage-rgb),0.24)] bg-[rgba(var(--atelier-sage-rgb),0.1)]">
                  <ShieldIcon />
                </div>
                <p className="aura-text-label mt-5 text-[var(--atelier-sage-300)]">
                  Privacy & trust
                </p>
                <h2 className="mt-2 max-w-md font-serif text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
                  Private by design, clear by default
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
                  Privacy is useful only when the product explains what is
                  actually happening. Lumeo keeps those processing details
                  visible instead of hiding them in marketing copy.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {privacyItems.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-5"
                  >
                    <h3 className="font-serif text-[1.06rem] font-semibold text-[var(--text-primary)]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-[13px] leading-5 text-[var(--text-secondary)]">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-16 sm:mt-20" aria-labelledby="categories-heading">
            <div className="max-w-2xl">
              <p className="aura-text-label text-[var(--atelier-sage-300)]">
                Tool categories
              </p>
              <h2
                id="categories-heading"
                className="mt-2 font-serif text-[1.9rem] font-semibold tracking-[-0.02em] text-[var(--text-primary)]"
              >
                A structure that stays simple as Lumeo grows
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
                Plain-language groups make the current tools easy to scan and
                leave clear homes for higher-value workflows later.
              </p>
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {categoryItems.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[16px] border border-[var(--border-hairline)] bg-[var(--surface-base)] p-5"
                >
                  <h3 className="font-serif text-base font-semibold text-[var(--text-primary)]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-5 text-[var(--text-muted)]">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-16 sm:mt-20" aria-labelledby="quality-heading">
            <div className="text-center">
              <p className="aura-text-label text-[var(--text-muted)]">
                Product quality
              </p>
              <h2
                id="quality-heading"
                className="mt-2 font-serif text-[1.75rem] font-semibold text-[var(--text-primary)]"
              >
                Built to feel like one workspace
              </h2>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {qualityItems.map((item) => (
                <div key={item.title} className="text-center">
                  <h3 className="font-serif text-base font-semibold text-[var(--text-primary)]">
                    {item.title}
                  </h3>
                  <p className="mx-auto mt-2 max-w-[17rem] text-[13px] leading-5 text-[var(--text-muted)]">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="my-16 rounded-[22px] border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-6 py-10 text-center sm:my-20 sm:px-10 sm:py-12">
            <h2 className="font-serif text-2xl font-semibold text-[var(--text-primary)] sm:text-[1.8rem]">
              Need something more specific?
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
              The complete directory keeps specialist tools available without
              crowding the homepage.
            </p>
            <Link
              href="/pdf-tools"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-selected)] bg-[var(--surface-selected)] px-5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--atelier-sage-300)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)]"
            >
              View all tools
            </Link>
          </section>
        </div>
      </section>

      <div className="relative z-10">
        <PublicFooter />
      </div>
    </main>
  );
}
