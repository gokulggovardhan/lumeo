import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { ToolsExplorer } from "@/components/tools/ToolsExplorer";
import { withSeoOverride } from "@/lib/public-site/seo";

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf-tools", {
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
  });
}

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Lumeo PDF Tools",
  url: "https://lumeo.in/pdf-tools",
  description: "A categorized directory of available Lumeo PDF tools.",
};

export default function PdfToolsPage() {
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
      <section className="lumeo-fade-up mb-7 max-w-2xl">
        <p className="aura-text-label text-[var(--lumeo-gold-300)]">PDF tools</p>
        <h1 className="mt-3 font-serif font-medium text-[var(--text-heading-xl)] leading-[var(--leading-heading)] tracking-[var(--tracking-display)] text-[var(--text-primary)]">
          Everything a PDF needs. <em className="not-italic text-[var(--atelier-sage-300)]">Most of it never leaves your browser.</em>
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
          Every tool below groups the tasks people actually need — no hunting through a hundred one-off links.
        </p>
      </section>

      <ToolsExplorer />

      <div className="mt-10">
        <PublicFooter />
      </div>
    </PublicCatalogPageShell>
  );
}
