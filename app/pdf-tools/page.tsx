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
    title: { absolute: "All PDF Tools - Lumeo PDF Workspace" },
    description:
      "Browse the complete Lumeo PDF tool directory by task, format, or capability, with clear processing details before you begin.",
    alternates: { canonical: "/pdf-tools" },
    openGraph: {
      title: "All PDF Tools - Lumeo PDF Workspace",
      description: "Browse Lumeo's complete browser-first PDF and document tool directory.",
      url: "https://lumeo.in/pdf-tools",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "All PDF Tools - Lumeo PDF Workspace",
      description: "Search and filter Lumeo's complete PDF and document tool directory.",
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
        <p className="aura-text-label text-[var(--text-premium)]">All PDF tools</p>
        <h1 className="mt-3 font-serif font-medium text-[length:var(--text-heading-xl)] leading-[var(--leading-heading)] tracking-[var(--tracking-display)] text-[color:var(--text-primary)]">
          Find the right tool
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
          Search or filter the complete directory. Popular workflows stay easy to spot, while specialist tools remain one step away.
        </p>
      </section>

      <ToolsExplorer tools={discoveryTools} />

      <div className="mt-10">
        <PublicFooter />
      </div>
    </PublicCatalogPageShell>
  );
}
