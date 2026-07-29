import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo Page Re-Order",
  description: "Reorder, rotate, duplicate, or remove PDF pages privately in your browser.",
  path: "/pdf/organize",
  featureList: ["Drag to reorder pages", "Rotate pages", "Duplicate or delete pages", "Bulk select and act on many pages"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "Page Re-Order", path: "/pdf/organize" },
]);

const OrganizePdfTool = dynamic(() => import("@/components/pdf/OrganizePdfTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/organize", {
    title: { absolute: "Organize PDF Online Privately - Reorder, Rotate, Duplicate Pages" },
    description: "Reorder, rotate, duplicate, or delete PDF pages privately in your browser. No uploads, nothing leaves your device.",
    alternates: { canonical: "/pdf/organize" },
    openGraph: {
      title: "Organize PDF Online Privately - Lumeo PDF",
      description: "Drag to reorder, rotate, duplicate, and delete pages in a calm browser-first workspace.",
      url: "https://lumeo.in/pdf/organize",
      siteName: "Lumeo PDF",
      type: "website",
      images: ["https://lumeo.in/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: "Organize PDF Online Privately - Lumeo PDF",
      description: "Organize PDF pages directly on your device using Lumeo PDF Workspace.",
      images: ["https://lumeo.in/twitter-image"],
    },
  });
}

export default async function OrganizePdfPage() {
  // "reorder" (not "organize") -- this is the tool's real catalog action
  // slug in lib/tools/catalog.ts, and the admin console's pdf_tools row
  // for this page uses the same slug, so one admin toggle controls both
  // the page-level maintenance check and the catalog-level live/dead tile.
  const toolState = await getToolBlockedState("reorder");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="Organize PDF"
        description="Reorder, rotate, duplicate, or remove pages in one document."
      />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool"><OrganizePdfTool /></div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </PublicCatalogPageShell>
  );
}
