import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";

export const metadata: Metadata = {
  title: { absolute: "PDF Tools - Private Browser PDF Workspace | Lumeo PDF" },
  description:
    "Browse available Lumeo PDF tools by category. Choose a private browser-first workspace for merging, splitting, compressing, and converting PDFs.",
  alternates: { canonical: "/pdf-tools" },
  openGraph: {
    title: "PDF Tools - Lumeo PDF Workspace",
    description: "Browse available private browser-first PDF tools by category.",
    url: "https://lumeo.in/pdf-tools",
    siteName: "Lumeo PDF",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PDF Tools - Lumeo PDF Workspace",
    description: "Choose a private browser-first PDF workspace by category.",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Lumeo PDF Tools",
  url: "https://lumeo.in/pdf-tools",
  description: "A categorized directory of available Lumeo PDF tools.",
};

export default async function PdfToolsPage() {
  const catalog = await getPublicPdfCatalog();

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1160px]"
      contentClassName="px-5 pb-10 pt-7 sm:px-8 sm:pb-12 sm:pt-9"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--lumeo-paper-100)]"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <section className="lumeo-fade-up">
        <p className="aura-text-label text-[var(--lumeo-gold-300)]">
          PDF tools
        </p>
        <h1 className="mt-3 font-serif text-[var(--text-display-md)] leading-[var(--leading-display)] tracking-[var(--tracking-display)] text-[var(--lumeo-paper-50)]">
          Choose a tool for your document.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--lumeo-paper-400)] sm:text-base">
          Browse available Lumeo workspaces by category. Tools remain private by design and browser-first where supported.
        </p>
      </section>

      <div className="mt-8 space-y-8">
        {catalog.categories.map((category, categoryIndex) => (
          <section
            key={category.slug}
            className="lumeo-fade-up aura-directory-section rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-md)] sm:p-6"
            style={{ animationDelay: `${categoryIndex * 70}ms` }}
          >
            <div className="mb-5 border-b border-[var(--border-subtle)] pb-4">
              <h2 className="text-xl font-black tracking-[-0.02em] text-[var(--lumeo-paper-50)]">{category.name}</h2>
              {category.description ? (
                <p className="mt-2 text-sm leading-6 text-[var(--lumeo-paper-400)]">{category.description}</p>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {category.tools.map((tool) => (
                <Link
                  key={tool.route}
                  href={tool.route}
                  className="group rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-5 shadow-[var(--shadow-xs)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--border-premium)] hover:bg-[rgba(var(--lumeo-paper-rgb),0.075)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.18)] motion-reduce:transform-none"
                >
                  <span className="text-base font-black text-[var(--lumeo-paper-50)]">{tool.toolName}</span>
                  <span className="mt-2 block text-sm leading-6 text-[var(--lumeo-paper-400)]">{tool.shortDescription}</span>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[var(--lumeo-gold-300)]">
                    Open workspace
                    <span aria-hidden="true" className="transition group-hover:translate-x-0.5 motion-reduce:transform-none">→</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-8 rounded-[var(--radius-2xl)] border border-[rgba(var(--lumeo-seal-rgb),0.28)] bg-[rgba(var(--lumeo-seal-rgb),0.1)] p-5 text-sm leading-6 text-[var(--lumeo-paper-100)]">
        Private by design · Browser-only where possible · Clear handling
      </section>

      <div className="mt-10">
        <PublicFooter />
      </div>
    </PublicCatalogPageShell>
  );
}
