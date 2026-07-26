import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo Text Extract",
  description: "Pull selectable text out of a PDF and export it as TXT, JSON, or CSV, privately in your browser.",
  path: "/pdf/extract-text",
  featureList: ["Per-page text panels", "Search across all pages", "Page-range extraction", "Export as TXT, JSON, or CSV"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "Text Extract", path: "/pdf/extract-text" },
]);

const ExtractTextTool = dynamic(() => import("@/components/pdf/ExtractTextTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/extract-text", {
    title: { absolute: "Text Extract Online Privately - Lumeo PDF" },
    description: "Pull selectable text out of a PDF privately in your browser. Search it, extract a page range, and export as TXT, JSON, or CSV.",
    alternates: { canonical: "/pdf/extract-text" },
    openGraph: {
      title: "Text Extract Online Privately - Lumeo PDF",
      description: "Read, search, and export PDF text in a calm browser-first workspace.",
      url: "https://lumeo.in/pdf/extract-text",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Text Extract Online Privately - Lumeo PDF",
      description: "Extract PDF text directly on your device using Lumeo PDF Workspace.",
    },
  });
}

export default async function ExtractTextPage() {
  const toolState = await getToolBlockedState("extract-text");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="Text Extract"
        description="Pull selectable text out of a PDF, narrow to a page range, and export as TXT, JSON, or CSV."
      />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool"><ExtractTextTool /></div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </PublicCatalogPageShell>
  );
}
