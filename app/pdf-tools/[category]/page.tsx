import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicFooter from "@/components/PublicFooter";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { ToolCategoryDetail } from "@/components/tools/ToolCategoryDetail";
import { lumeoTools } from "@/lib/tools/catalog";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
import { resolveLumeoTools } from "@/lib/tools/resolve";
import { withSeoOverride } from "@/lib/public-site/seo";

type PageParams = { category: string };

export function generateStaticParams() {
  return lumeoTools.map((tool) => ({ category: tool.key }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { category } = await params;
  const tool = lumeoTools.find((item) => item.key === category);
  if (!tool) return {};

  return withSeoOverride(`/pdf-tools/${category}`, {
    title: { absolute: `${tool.name} - ${tool.plain} | Lumeo PDF` },
    description: tool.tag,
    alternates: { canonical: `/pdf-tools/${category}` },
    openGraph: {
      title: `${tool.name} - Lumeo PDF Workspace`,
      description: tool.tag,
      url: `https://lumeo.in/pdf-tools/${category}`,
      siteName: "Lumeo PDF",
      type: "website",
    },
  });
}

export default async function ToolCategoryPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { category } = await params;
  const catalog = await getPublicPdfCatalog();
  const tools = resolveLumeoTools(catalog.tools);
  const tool = tools.find((item) => item.key === category);

  if (!tool) notFound();

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[900px]"
      contentClassName="px-5 pb-10 pt-7 sm:px-8 sm:pb-12 sm:pt-9"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--lumeo-paper-100)]"
    >
      <ToolCategoryDetail tool={tool} />

      <div className="mt-12">
        <PublicFooter />
      </div>
    </PublicCatalogPageShell>
  );
}
