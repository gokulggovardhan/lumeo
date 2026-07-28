import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

const CropPdfTool = dynamic(() => import("@/components/pdf/CropPdfTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo Crop PDF",
  description: "Crop PDF pages to a custom rectangle, privately in your browser.",
  path: "/pdf/crop",
  featureList: ["Drag to select crop area", "Aspect ratio presets", "Crop all, current, or selected pages", "No file upload"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "Crop PDF", path: "/pdf/crop" },
]);

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/crop", {
    title: { absolute: "Crop PDF Online Privately - Trim Page Margins" },
    description: "Crop a PDF's pages to a custom rectangle privately in your browser. No uploads, nothing leaves your device.",
    alternates: { canonical: "/pdf/crop" },
    openGraph: {
      title: "Crop PDF Online Privately - Lumeo PDF",
      description: "Drag to select the crop area and trim page margins, in a calm browser-first workspace.",
      url: "https://lumeo.in/pdf/crop",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Crop PDF Online Privately - Lumeo PDF",
      description: "Crop a PDF's pages directly in your browser.",
    },
  });
}

export default async function CropPdfPage() {
  const toolState = await getToolBlockedState("crop");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader title="Crop PDF" description="Trim a PDF's pages to a custom rectangle." />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool"><CropPdfTool /></div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </PublicCatalogPageShell>
  );
}
