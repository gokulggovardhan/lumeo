import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

const WatermarkTool = dynamic(() => import("@/components/pdf/WatermarkTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo Watermark PDF",
  description: "Add a text or image watermark to a PDF, privately in your browser.",
  path: "/pdf/watermark",
  featureList: ["Text watermark", "Image watermark", "Tiled or single placement", "Custom page range", "No file upload"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "Watermark PDF", path: "/pdf/watermark" },
]);

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/watermark", {
    title: { absolute: "Watermark PDF Online Privately - Text & Image Watermarks" },
    description: "Add a text or image watermark to a PDF privately in your browser. No uploads, nothing leaves your device.",
    alternates: { canonical: "/pdf/watermark" },
    openGraph: {
      title: "Watermark PDF Online Privately - Lumeo PDF",
      description: "Stamp a text or image watermark onto any page, in a calm browser-first workspace.",
      url: "https://lumeo.in/pdf/watermark",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Watermark PDF Online Privately - Lumeo PDF",
      description: "Add a text or image watermark to a PDF directly in your browser.",
    },
  });
}

export default async function WatermarkPdfPage() {
  const toolState = await getToolBlockedState("watermark");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader title="Watermark PDF" description="Add a text or image watermark to a PDF." />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool"><WatermarkTool /></div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </PublicCatalogPageShell>
  );
}
