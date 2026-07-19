import type { Metadata } from "next";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import SplitPdfTool from "@/components/pdf/SplitPdfTool";
import { L2ToolPageHeader } from "@/components/pdf/workspace/ToolWorkspace";
import { withSeoOverride } from "@/lib/public-site/seo";

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/split", {
    title: { absolute: "Split PDF Online Privately - Extract or Remove Pages" },
    description: "Split PDF files privately in your browser. Extract pages, remove pages, create ranges, or separate every page without uploading documents.",
    alternates: { canonical: "/pdf/split" },
    openGraph: {
      title: "Split PDF Online Privately - Lumeo PDF",
      description: "Extract, remove, and separate PDF pages in a calm browser-first workspace.",
      url: "https://lumeo.in/pdf/split",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Split PDF Online Privately - Lumeo PDF",
      description: "Split and extract PDF pages directly on your device using Lumeo PDF Workspace.",
    },
  });
}

export default function SplitPdfPage() {
  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="Split PDF"
        description="Extract pages or separate one PDF into smaller files."
      />

      <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-split-tool"><SplitPdfTool /></div>
    </PublicCatalogPageShell>
  );
}
