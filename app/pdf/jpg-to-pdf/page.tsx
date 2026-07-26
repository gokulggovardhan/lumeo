import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo JPG to PDF",
  description: "Convert JPG, PNG, and WEBP images into a PDF document privately in your browser.",
  path: "/pdf/jpg-to-pdf",
  featureList: ["Combine multiple images", "Reorder images", "Page size and orientation control", "No file upload"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "JPG to PDF", path: "/pdf/jpg-to-pdf" },
]);

const JpgToPdfTool = dynamic(() => import("@/components/pdf/JpgToPdfTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/jpg-to-pdf", {
    title: {
      absolute: "JPG to PDF Converter Online | Lumeo PDF",
    },
    description:
      "Convert JPG and PNG images into a polished PDF privately in your browser with Lumeo PDF Workspace. Reorder images, choose a page size, and combine them without uploading files.",
    alternates: {
      canonical: "/pdf/jpg-to-pdf",
    },
    openGraph: {
      title: "JPG to PDF Converter Online | Lumeo PDF",
      description:
        "Turn images into a polished PDF in a calm browser-first workspace where supported files stay on your device.",
      url: "https://lumeo.in/pdf/jpg-to-pdf",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "JPG to PDF Converter Online | Lumeo PDF",
      description:
        "Convert and reorder images into one PDF directly in your browser with no server upload for supported processing.",
    },
  });
}

export default async function JpgToPdfPage() {
  const toolState = await getToolBlockedState("jpg-to-pdf");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="JPG to PDF"
        description="Convert images into a clean PDF document."
      />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-jpg-to-pdf-tool"><JpgToPdfTool /></div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </PublicCatalogPageShell>
  );
}
