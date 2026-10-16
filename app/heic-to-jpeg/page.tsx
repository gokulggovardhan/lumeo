import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";
import { ToolSeoContent } from "@/components/pdf/ToolSeoContent";

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo HEIC to JPEG",
  description:
    "Convert iPhone HEIC and HEIF photos to high-quality JPEG directly in your browser.",
  path: "/heic-to-jpeg",
  featureList: [
    "Batch HEIC and HEIF conversion",
    "High-quality JPEG output",
    "Companion-file inspection",
    "No photo upload",
  ],
});

const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "HEIC to JPEG", path: "/heic-to-jpeg" },
]);

const HeicToJpegTool = dynamic(() => import("@/components/heic/HeicToJpegTool"), { loading: () => <ToolWorkspaceLoading /> });
export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/heic-to-jpeg", {
    title: { absolute: "HEIC to JPEG Converter Online | Lumeo PDF" },
    description: "Convert iPhone HEIC photos to high-quality JPEG directly in your browser. Batch conversion with companion-file inspection and no photo uploads.",
    alternates: { canonical: "/heic-to-jpeg" },
    openGraph: { title: "HEIC to JPEG | Lumeo", description: "Smart iPhone photo conversion, processed locally in your browser.", url: "https://lumeo.in/heic-to-jpeg" },
  });
}
export default async function HeicToJpegPage() {
  const state = await getToolBlockedState("heic-to-jpeg");

  return (
    <PublicCatalogPageShell maxWidth="max-w-[1240px]">
      <L2ToolPageHeader
        categoryLabel="IMAGE TOOLS"
        title="HEIC to JPEG"
        description="Convert iPhone HEIC photos to high-quality JPEG directly in your browser."
      />
      {state.blocked ? (
        <ToolMaintenanceNotice status={state.status} message={state.message} />
      ) : (
        <HeicToJpegTool />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <ToolSeoContent route="/heic-to-jpeg" />
    </PublicCatalogPageShell>
  );
}
