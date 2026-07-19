import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2DirectoryToolCard, L2TrustRail } from "@/components/ui/Aura";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
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
        <h1 className="mt-3 font-serif font-semibold text-[var(--text-heading-xl)] leading-[var(--leading-heading)] tracking-[var(--tracking-display)] text-[var(--text-primary)]">
          PDF tools for calm document work.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
          Browse available Lumeo workspaces by category. Tools remain private by design and browser-first where supported.
        </p>
      </section>

      <div className="mt-7 space-y-7">
        {catalog.categories.map((category, categoryIndex) => (
          <section
            key={category.slug}
            className="lumeo-fade-up aura-directory-section"
            style={{ animationDelay: `${categoryIndex * 70}ms` }}
          >
            <div className="mb-3 border-l border-[rgba(var(--champagne-rgb),0.42)] pl-4">
              <h2 className="font-serif font-semibold text-xl tracking-[-0.02em] text-[var(--text-primary)]">{category.name}</h2>
              {category.description ? (
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{category.description}</p>
              ) : null}
            </div>
            <div className="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3">
              {category.tools.map((tool) => (
                <L2DirectoryToolCard key={tool.route} tool={tool} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <L2TrustRail className="mt-7" items={["Catalog-driven tools", "Browser-first where supported", "No fake usage counts"]} />

      <div className="mt-8">
        <PublicFooter />
      </div>
    </PublicCatalogPageShell>
  );
}
