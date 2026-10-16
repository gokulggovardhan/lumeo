import type { Metadata } from "next";
import { Suspense } from "react";
import PublicFooter from "@/components/PublicFooter";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { ToolsExplorer } from "@/components/tools/ToolsExplorer";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
import { resolveLumeoTools } from "@/lib/tools/resolve";
import { buildDiscoveryTiles } from "@/lib/tools/tiles";
import { withSeoOverride } from "@/lib/public-site/seo";

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf-tools", {
    title: { absolute: "All PDF Tools - Lumeo PDF" },
    description:
      "Search Lumeo's complete PDF tool directory by task, file type, or capability. Open focused browser-first tools directly.",
    alternates: { canonical: "/pdf-tools" },
    openGraph: {
      title: "All PDF Tools - Lumeo PDF",
      description:
        "Search and open Lumeo's complete browser-first PDF and document tool directory.",
      url: "https://lumeo.in/pdf-tools",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "All PDF Tools - Lumeo PDF",
      description:
        "Search and open Lumeo's complete PDF and document tool directory.",
    },
  });
}

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Lumeo PDF Tools",
  url: "https://lumeo.in/pdf-tools",
  description: "A searchable directory of available Lumeo PDF tools.",
};

async function PublicToolsExplorer() {
  const catalog = await getPublicPdfCatalog();
  return <ToolsExplorer tools={buildDiscoveryTiles(resolveLumeoTools(catalog.tools))} />;
}

export default function PdfToolsPage() {
  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1180px]"
      contentClassName="px-5 pb-10 pt-5 sm:px-8 sm:pb-12 sm:pt-7"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--lumeo-paper-100)]"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <section className="mb-4 max-w-3xl sm:mb-5">
        <p className="aura-text-label text-[var(--text-premium)]">
          PDF tools
        </p>
        <h1 className="mt-2 font-serif text-[clamp(1.85rem,4vw,2.65rem)] font-semibold leading-tight tracking-[-0.025em] text-[var(--text-primary)]">
          All PDF tools in one place.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
          Search by what you want to do, then open the focused tool directly.
        </p>
      </section>

      <Suspense
        fallback={<div role="status" aria-label="Loading PDF tools directory" className="min-h-[28rem] rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-base)]/30 p-5 text-sm text-[var(--text-muted)]">Loading PDF tools directory…</div>}
      >
        <PublicToolsExplorer />
      </Suspense>

      <div className="mt-8 [content-visibility:auto] [contain-intrinsic-size:auto_200px]">
        <PublicFooter />
      </div>
    </PublicCatalogPageShell>
  );
}
