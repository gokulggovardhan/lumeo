import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo Merge PDF",
  description: "Combine multiple PDF files into one document privately in your browser, with page reordering and output sizing controls.",
  path: "/pdf/merge",
  featureList: ["Merge multiple PDFs", "Reorder before merging", "Smart output sizing", "No file upload"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "Merge PDF", path: "/pdf/merge" },
]);

// Defers pdf-lib (and pdfjs-dist for the preview) until this page is
// actually visited and hydrates client-side, instead of shipping them in
// every route that happens to reference this page. The tool's own logic is
// untouched -- only when its JS loads changes.
const MergePdfTool = dynamic(() => import("@/components/pdf/MergePdfTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/merge", {
    title: { absolute: "Merge PDF Online Privately - Browser PDF Merger" },
    description: "Merge PDF files privately in your browser with Lumeo PDF Workspace. Reorder documents, control output sizing, and combine PDFs without uploading files.",
    alternates: { canonical: "/pdf/merge" },
    openGraph: {
      title: "Merge PDF Online Privately - Lumeo PDF",
      description: "Combine PDF files in a calm browser-first workspace where supported documents stay on your device.",
      url: "https://lumeo.in/pdf/merge",
      siteName: "Lumeo PDF",
      type: "website",
      images: ["https://lumeo.in/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: "Merge PDF Online Privately - Lumeo PDF",
      description: "Combine and reorder PDF files directly in your browser with no server upload for supported processing.",
      images: ["https://lumeo.in/twitter-image"],
    },
  });
}

export default async function MergePdfPage() {
  const toolState = await getToolBlockedState("merge");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      {toolState.blocked ? (
        <>
          <L2ToolPageHeader
            title="Merge PDF"
            description="Combine PDFs into one clean document."
          />
          <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
        </>
      ) : (
        // MergePdfTool renders its own sticky Aura OS v2 workspace header
        // (title + description) -- no page-level header here, or the two
        // would stack redundantly above the tool.
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-merge-tool"><MergePdfTool /></div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </PublicCatalogPageShell>
  );
}
