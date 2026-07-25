import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";

const ExtractTextTool = dynamic(() => import("@/components/pdf/ExtractTextTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/extract-text", {
    title: { absolute: "Extract Text from PDF Online Privately - Lumeo PDF" },
    description: "Pull selectable text out of a PDF privately in your browser. Read it, search it, copy it, or download it as .txt.",
    alternates: { canonical: "/pdf/extract-text" },
    openGraph: {
      title: "Extract Text from PDF Online Privately - Lumeo PDF",
      description: "Read, search, and export PDF text in a calm browser-first workspace.",
      url: "https://lumeo.in/pdf/extract-text",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Extract Text from PDF Online Privately - Lumeo PDF",
      description: "Extract PDF text directly on your device using Lumeo PDF Workspace.",
    },
  });
}

export default async function ExtractTextPage() {
  const toolState = await getToolBlockedState("extract-text");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="Extract Text"
        description="Pull selectable text out of a PDF and read, search, or export it."
      />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool"><ExtractTextTool /></div>
      )}
    </PublicCatalogPageShell>
  );
}
