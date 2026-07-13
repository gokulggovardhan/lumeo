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
      mainClassName="min-h-dvh bg-[#0C1220] text-[#F0EAD6]"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <section className="lumeo-fade-up">
        <p className="text-[0.63rem] font-bold uppercase tracking-[0.2em] text-[#CBA052]">
          PDF tools
        </p>
        <h1 className="mt-3 text-[2.45rem] font-bold leading-[1.05] tracking-[-0.04em] text-[#F0EAD6] sm:text-[3.35rem]">
          Choose a tool for your document.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[#F0EAD6]/62 sm:text-base">
          Browse available Lumeo workspaces by category. Tools remain private by design and browser-first where supported.
        </p>
      </section>

      <div className="mt-8 space-y-8">
        {catalog.categories.map((category, categoryIndex) => (
          <section
            key={category.slug}
            className="lumeo-fade-up rounded-[24px] border border-[#E8DFC8]/8 bg-[#111A2B]/92 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.28)] sm:p-6"
            style={{ animationDelay: `${categoryIndex * 70}ms` }}
          >
            <div className="mb-5 border-b border-[#E8DFC8]/8 pb-4">
              <h2 className="text-xl font-bold tracking-[-0.02em] text-[#F0EAD6]">{category.name}</h2>
              {category.description ? (
                <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/54">{category.description}</p>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {category.tools.map((tool) => (
                <Link
                  key={tool.route}
                  href={tool.route}
                  className="group rounded-[20px] border border-[#E8DFC8]/8 bg-[#0C1220]/52 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[#CBA052]/28 hover:bg-[#142034] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45 motion-reduce:transform-none"
                >
                  <span className="text-base font-bold text-[#F0EAD6]">{tool.toolName}</span>
                  <span className="mt-2 block text-sm leading-6 text-[#F0EAD6]/58">{tool.shortDescription}</span>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#CBA052]">
                    Open workspace
                    <span aria-hidden="true" className="transition group-hover:translate-x-0.5 motion-reduce:transform-none">→</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-8 rounded-[22px] border border-[#1E6B4A]/28 bg-[#1E6B4A]/10 p-5 text-sm leading-6 text-[#DDF5E9]">
        Private by design · Browser-only where possible · Clear handling
      </section>

      <div className="mt-10">
        <PublicFooter />
      </div>
    </PublicCatalogPageShell>
  );
}
