import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo HTML to PDF",
  description: "Turn HTML and CSS into a downloadable PDF, entirely in your browser.",
  path: "/pdf/html-to-pdf",
  featureList: ["Live preview as you type", "Page size and orientation control", "Margin presets", "No file upload"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "HTML to PDF", path: "/pdf/html-to-pdf" },
]);

const HtmlToPdfTool = dynamic(() => import("@/components/pdf/HtmlToPdfTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/html-to-pdf", {
    title: { absolute: "HTML to PDF Online Privately - Lumeo PDF" },
    description: "Turn HTML and CSS into a downloadable PDF, entirely in your browser. No uploads, nothing leaves your device.",
    alternates: { canonical: "/pdf/html-to-pdf" },
    openGraph: {
      title: "HTML to PDF Online Privately - Lumeo PDF",
      description: "Type or paste HTML/CSS, preview it live, and generate a PDF in a calm browser-first workspace.",
      url: "https://lumeo.in/pdf/html-to-pdf",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "HTML to PDF Online Privately - Lumeo PDF",
      description: "Generate PDFs from HTML/CSS directly on your device using Lumeo PDF Workspace.",
    },
  });
}

export default async function HtmlToPdfPage() {
  const toolState = await getToolBlockedState("html-to-pdf");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="HTML to PDF"
        description="Turn HTML and CSS into a downloadable PDF."
      />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool"><HtmlToPdfTool /></div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </PublicCatalogPageShell>
  );
}
