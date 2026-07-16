import type { Metadata } from "next";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import MergePdfTool from "@/components/pdf/MergePdfTool";
import { L2ToolPageHeader } from "@/components/pdf/workspace/ToolWorkspace";

export const metadata: Metadata = {
  title: { absolute: "Merge PDF Online Privately - Browser PDF Merger" },
  description: "Merge PDF files privately in your browser with Lumeo PDF Workspace. Reorder documents, control output sizing, and combine PDFs without uploading files.",
  alternates: { canonical: "/pdf/merge" },
  openGraph: {
    title: "Merge PDF Online Privately - Lumeo PDF",
    description: "Combine PDF files in a calm browser-first workspace where supported documents stay on your device.",
    url: "https://lumeo.in/pdf/merge",
    siteName: "Lumeo PDF",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Merge PDF Online Privately - Lumeo PDF",
    description: "Combine and reorder PDF files directly in your browser with no server upload for supported processing.",
  },
};

export default function MergePdfPage() {
  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="Merge PDF"
        description="Combine PDFs into one clean document."
      />

      <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-merge-tool"><MergePdfTool /></div>
    </PublicCatalogPageShell>
  );
}
