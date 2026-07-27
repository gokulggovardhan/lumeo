import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

const EditPdfTool = dynamic(() => import("@/components/pdf/EditPdfTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo Edit PDF",
  description: "Add text, freehand drawing, shapes, and whiteout boxes to a PDF, privately in your browser.",
  path: "/pdf/edit",
  featureList: ["Click-to-type text", "Freehand ink", "Shapes and highlight", "Whiteout boxes", "No file upload"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "Edit PDF", path: "/pdf/edit" },
]);

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/edit", {
    title: { absolute: "Edit PDF Online Privately - Text, Draw, Shapes & Whiteout" },
    description: "Add text, freehand drawing, shapes, and whiteout boxes to a PDF privately in your browser. No uploads, nothing leaves your device.",
    alternates: { canonical: "/pdf/edit" },
    openGraph: {
      title: "Edit PDF Online Privately - Lumeo PDF",
      description: "Type, draw, and mark up a PDF in a calm browser-first workspace.",
      url: "https://lumeo.in/pdf/edit",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Edit PDF Online Privately - Lumeo PDF",
      description: "Add text, drawing, shapes, and whiteout boxes to a PDF directly in your browser.",
    },
  });
}

export default async function EditPdfPage() {
  const toolState = await getToolBlockedState("edit");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader title="Edit PDF" description="Add text, drawing, shapes, and whiteout boxes to a PDF." />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool"><EditPdfTool /></div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </PublicCatalogPageShell>
  );
}
