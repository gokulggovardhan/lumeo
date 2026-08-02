import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

const HeaderFooterTool = dynamic(() => import("@/components/pdf/HeaderFooterTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo Header & Footer",
  description: "Add a header and footer to a PDF, privately in your browser.",
  path: "/pdf/header-footer",
  featureList: ["Left/center/right alignment", "Dynamic placeholders", "First-page-different", "Custom page range", "No file upload"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "Header & Footer", path: "/pdf/header-footer" },
]);

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/header-footer", {
    title: { absolute: "Add a Header & Footer to a PDF Online Privately" },
    description: "Add a header and footer to a PDF privately in your browser. No uploads, nothing leaves your device.",
    alternates: { canonical: "/pdf/header-footer" },
    openGraph: {
      title: "Add a Header & Footer to a PDF Online Privately - Lumeo PDF",
      description: "Add a header and footer to your PDF in a calm browser-first workspace.",
      url: "https://lumeo.in/pdf/header-footer",
      siteName: "Lumeo PDF",
      type: "website",
      images: ["https://lumeo.in/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: "Add a Header & Footer to a PDF Online Privately - Lumeo PDF",
      description: "Add a header and footer to a PDF directly in your browser.",
      images: ["https://lumeo.in/twitter-image"],
    },
  });
}

export default async function HeaderFooterPage() {
  const toolState = await getToolBlockedState("header-footer");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader title="Header & Footer" description="Add a header and footer to a PDF." />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool"><HeaderFooterTool /></div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </PublicCatalogPageShell>
  );
}
