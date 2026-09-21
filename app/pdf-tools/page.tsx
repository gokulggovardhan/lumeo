import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { ToolsExplorer } from "@/components/tools/ToolsExplorer";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
import { resolveLumeoTools } from "@/lib/tools/resolve";
import { buildDiscoveryTiles } from "@/lib/tools/tiles";
import { withSeoOverride } from "@/lib/public-site/seo";

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf-tools", {
    title: { absolute: "PDF Tools - Choose Your PDF Action | Lumeo PDF" },
    description:
      "Choose a PDF action directly and see clear processing details before opening a Lumeo tool.",
    alternates: { canonical: "/pdf-tools" },
    openGraph: {
      title: "PDF Tools - Lumeo PDF Workspace",
      description: "Browse Lumeo's browser-first PDF tools and clear processing details.",
      url: "https://lumeo.in/pdf-tools",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "PDF Tools - Lumeo PDF Workspace",
      description: "Lumeo's browser-first PDF tools with clear processing details.",
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
  const discoveryTools = buildDiscoveryTiles(tools);

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
      <section className="lumeo-fade-up mb-6 max-w-3xl sm:mb-8">
        <p className="aura-text-label text-[var(--text-premium)]">PDF tools</p>
        <h1 className="mt-3 font-serif font-medium text-[length:var(--text-heading-xl)] leading-[var(--leading-heading)] tracking-[var(--tracking-display)] text-[color:var(--text-primary)]">
          What do you need to do?
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
          Choose an action directly. Every tool shows how it processes files before you begin.
        </p>
      </section>

      <ToolsExplorer tools={discoveryTools} />

      <div className="mt-10">
        <PublicFooter />
      </div>
    </PublicCatalogPageShell>
  );
}
