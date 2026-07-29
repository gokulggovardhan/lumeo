import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo Split PDF",
  description: "Extract pages, remove pages, or split a PDF into smaller files privately in your browser.",
  path: "/pdf/split",
  featureList: ["Extract selected pages", "Split by page ranges", "Split every page", "No file upload"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "Split PDF", path: "/pdf/split" },
]);

const SplitPdfTool = dynamic(() => import("@/components/pdf/SplitPdfTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/split", {
    title: { absolute: "Split PDF Online Privately - Extract or Remove Pages" },
    description: "Split PDF files privately in your browser. Extract pages, remove pages, create ranges, or separate every page without uploading documents.",
    alternates: { canonical: "/pdf/split" },
    openGraph: {
      title: "Split PDF Online Privately - Lumeo PDF",
      description: "Extract, remove, and separate PDF pages in a calm browser-first workspace.",
      url: "https://lumeo.in/pdf/split",
      siteName: "Lumeo PDF",
      type: "website",
      images: ["https://lumeo.in/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: "Split PDF Online Privately - Lumeo PDF",
      description: "Split and extract PDF pages directly on your device using Lumeo PDF Workspace.",
      images: ["https://lumeo.in/twitter-image"],
    },
  });
}

export default async function SplitPdfPage() {
  const toolState = await getToolBlockedState("split");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="Split PDF"
        description="Extract pages or separate one PDF into smaller files."
      />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-split-tool"><SplitPdfTool /></div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </PublicCatalogPageShell>
  );
}
