import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { ToolsExplorer } from "@/components/tools/ToolsExplorer";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
import { resolveLumeoTools } from "@/lib/tools/resolve";
import { withSeoOverride } from "@/lib/public-site/seo";

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf-tools", {
    title: { absolute: "PDF Tools - Private Browser PDF Workspace | Lumeo PDF" },
    description:
      "Browse Lumeo's available PDF tools — merging, splitting, compressing, and converting, handled privately in your browser.",
    alternates: { canonical: "/pdf-tools" },
    openGraph: {
      title: "PDF Tools - Lumeo PDF Workspace",
      description: "Browse Lumeo's available private, browser-first PDF tools.",
      url: "https://lumeo.in/pdf-tools",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "PDF Tools - Lumeo PDF Workspace",
      description: "Lumeo's available private, browser-first PDF tools.",
    },
  });
}

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Lumeo PDF Tools",
  url: "https://lumeo.in/pdf-tools",
  description: "A directory of available Lumeo PDF tools.",
};

export default async function PdfToolsPage() {
  const catalog = await getPublicPdfCatalog();
  const tools = resolveLumeoTools(catalog.tools);

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
          The PDF tools that matter. <em className="not-italic text-[var(--atelier-sage-300)]">They run entirely in your browser.</em>
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
          Each tool below groups related tasks in one place. More arrive as they&rsquo;re ready.
        </p>
      </section>

      <ToolsExplorer tools={tools} />

      <div className="mt-10">
        <PublicFooter />
      </div>
    </PublicCatalogPageShell>
  );
}
