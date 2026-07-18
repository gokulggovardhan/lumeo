import type { Metadata } from "next";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import PdfToJpgTool from "@/components/pdf/PdfToJpgTool";
import { L2ToolPageHeader } from "@/components/pdf/workspace/ToolWorkspace";

export const metadata: Metadata = {
  title: {
    absolute: "PDF to JPG Converter Online | Lumeo PDF",
  },
  description:
    "Export PDF pages as JPG images privately in your browser with Lumeo PDF Workspace. Choose pages, resolution, and quality without uploading files.",
  alternates: {
    canonical: "/pdf/pdf-to-jpg",
  },
  openGraph: {
    title: "PDF to JPG Converter Online | Lumeo PDF",
    description:
      "Turn PDF pages into JPG images in a calm browser-first workspace where files stay on your device.",
    url: "https://lumeo.in/pdf/pdf-to-jpg",
    siteName: "Lumeo PDF",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PDF to JPG Converter Online | Lumeo PDF",
    description:
      "Convert PDF pages to JPG images directly in your browser with no server upload.",
  },
};

export default function PdfToJpgPage() {
  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="PDF to JPG"
        description="Export PDF pages as image files."
      />

      <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-pdf-to-jpg-tool"><PdfToJpgTool /></div>
    </PublicCatalogPageShell>
  );
}
