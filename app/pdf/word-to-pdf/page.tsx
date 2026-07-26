import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo Word to PDF",
  description: "Convert Word documents (DOCX, DOC) to PDF using free, self-hosted LibreOffice.",
  path: "/pdf/word-to-pdf",
  featureList: ["Preserves layout and fonts", "Handles tables and images", "Cleared immediately after conversion"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "Word to PDF", path: "/pdf/word-to-pdf" },
]);

const WordToPdfTool = dynamic(() => import("@/components/pdf/WordToPdfTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/word-to-pdf", {
    title: { absolute: "Word to PDF Converter Online - Free & Private" },
    description: "Convert Word documents (.docx, .doc) to PDF online with Lumeo. Powered by free, self-hosted LibreOffice -- uploads are deleted immediately after conversion.",
    alternates: { canonical: "/pdf/word-to-pdf" },
    openGraph: {
      title: "Word to PDF Converter Online - Lumeo PDF",
      description: "Convert Word documents to PDF with accurate layout, fonts, and tables.",
      url: "https://lumeo.in/pdf/word-to-pdf",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Word to PDF Converter Online - Lumeo PDF",
      description: "Convert Word documents to PDF online with Lumeo, powered by free, self-hosted LibreOffice.",
    },
  });
}

export default async function WordToPdfPage() {
  const toolState = await getToolBlockedState("word-to-pdf");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="Word to PDF"
        description="Convert Word documents to PDF. Uploaded securely, converted on our server, deleted immediately after."
      />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-word-to-pdf-tool"><WordToPdfTool /></div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </PublicCatalogPageShell>
  );
}
