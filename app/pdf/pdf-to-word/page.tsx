import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";

const PdfToWordTool = dynamic(() => import("@/components/pdf/PdfToWordTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/pdf-to-word", {
    title: { absolute: "PDF to Word Converter Online - Free & Private" },
    description: "Convert PDF documents to editable Word (.docx) files with Lumeo. Powered by free, self-hosted LibreOffice -- uploads are deleted immediately after conversion.",
    alternates: { canonical: "/pdf/pdf-to-word" },
    openGraph: {
      title: "PDF to Word Converter Online - Lumeo PDF",
      description: "Convert PDF documents to editable Word documents with accurate layout, fonts, and tables.",
      url: "https://lumeo.in/pdf/pdf-to-word",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "PDF to Word Converter Online - Lumeo PDF",
      description: "Convert PDF documents to editable Word files online with Lumeo, powered by free, self-hosted LibreOffice.",
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
      <L2ToolPageHeader
        title="PDF to Word"
        description="Convert PDF documents to editable Word files. Uploaded securely, converted on our server, deleted immediately after."
      />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-pdf-to-word-tool"><PdfToWordTool /></div>
      )}
    </PublicCatalogPageShell>
  );
}
