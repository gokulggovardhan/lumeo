import type { Metadata } from "next";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import JpgToPdfTool from "@/components/pdf/JpgToPdfTool";
import { L2ToolPageHeader } from "@/components/pdf/workspace/ToolWorkspace";

export const metadata: Metadata = {
  title: {
    absolute: "JPG to PDF Converter Online | Lumeo PDF",
  },
  description:
    "Convert JPG and PNG images into a polished PDF privately in your browser with Lumeo PDF Workspace. Reorder images, choose a page size, and combine them without uploading files.",
  alternates: {
    canonical: "/pdf/jpg-to-pdf",
  },
  openGraph: {
    title: "JPG to PDF Converter Online | Lumeo PDF",
    description:
      "Turn images into a polished PDF in a calm browser-first workspace where supported files stay on your device.",
    url: "https://lumeo.in/pdf/jpg-to-pdf",
    siteName: "Lumeo PDF",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "JPG to PDF Converter Online | Lumeo PDF",
    description:
      "Convert and reorder images into one PDF directly in your browser with no server upload for supported processing.",
  },
};

export default function JpgToPdfPage() {
  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="JPG to PDF"
        description="Convert images into a clean PDF document."
      />

      <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-jpg-to-pdf-tool"><JpgToPdfTool /></div>
    </PublicCatalogPageShell>
  );
}
