import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo PDF to Word",
  description: "Reconstruct PDF pages into an editable Word (DOCX) file locally in the browser.",
  path: "/pdf/pdf-to-word",
  featureList: ["Editable text reconstruction", "Preserves page geometry and graphics", "Browser-only local processing"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "PDF to Word", path: "/pdf/pdf-to-word" },
]);

const PdfToWordTool = dynamic(() => import("@/components/pdf/PdfToWordTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/pdf-to-word", {
    title: { absolute: "PDF to Word Converter Online - Free & Private" },
    description: "Convert PDF documents to editable Word (.docx) files locally in your browser with Lumeo. Files stay on your device during conversion.",
    alternates: { canonical: "/pdf/pdf-to-word" },
    openGraph: {
      title: "PDF to Word Converter Online - Lumeo PDF",
      description: "Convert PDF documents to editable Word documents with local text and layout reconstruction.",
      url: "https://lumeo.in/pdf/pdf-to-word",
      siteName: "Lumeo PDF",
      type: "website",
      images: ["https://lumeo.in/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: "PDF to Word Converter Online - Lumeo PDF",
      description: "Convert PDF documents to editable Word files locally in your browser with Lumeo.",
      images: ["https://lumeo.in/twitter-image"],
    },
  });
}

export default async function PdfToWordPage() {
  const toolState = await getToolBlockedState("pdf-to-word");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader categoryLabel="CONVERT"
        title="PDF to Word"
        description="Convert PDF documents to editable Word files locally in your browser. Your PDF stays on your device."
      />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-pdf-to-word-tool"><PdfToWordTool /></div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </PublicCatalogPageShell>
  );
}
