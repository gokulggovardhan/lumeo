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
      description:
        "Browse Lumeo's complete browser-first PDF and document tool directory.",
      url: "https://lumeo.in/pdf-tools",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "All PDF Tools - Lumeo PDF Workspace",
      description:
        "Search and filter Lumeo's complete PDF and document tool directory.",
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
      contentClassName="px-5 pb-10 pt-5 sm:px-8 sm:pb-12 sm:pt-6"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--lumeo-paper-100)]"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <header className="lumeo-fade-up mb-5 max-w-3xl">
        <h1 className="font-serif text-[clamp(2rem,4vw,2.85rem)] font-semibold leading-[1.05] tracking-[var(--tracking-display)] text-[color:var(--text-primary)]">
          All PDF Tools
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
          Choose a tool or continue working in your PDF Workspace.
        </p>
      </header>

      <ToolsExplorer tools={discoveryTools} />

      <section
        className="mt-9 border-t border-[var(--border-hairline)] pt-7"
        aria-labelledby="directory-workspace-heading"
      >
        <div className="grid gap-3 sm:grid-cols-[0.75fr_1.25fr] sm:items-start">
          <h2
            id="directory-workspace-heading"
            className="font-serif text-lg font-semibold text-[var(--text-primary)]"
          >
            One PDF, connected work
          </h2>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            This directory remains the discovery layer. Compatible workflows
            are progressively connecting into the Lumeo PDF Workspace so the
            same document can move between tasks without unnecessary reopening.
            Standalone tool pages remain available.
          </p>
        </div>
      </section>

      <div className="mt-9">
        <PublicFooter />
      </div>
    </PublicCatalogPageShell>
  );
}
