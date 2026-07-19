import type { Metadata } from "next";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import CompressPdfTool from "@/components/pdf/CompressPdfTool";
import { L2ToolPageHeader } from "@/components/pdf/workspace/ToolWorkspace";
import { withSeoOverride } from "@/lib/public-site/seo";

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/compress", {
    title: { absolute: "Compress PDF Online Privately - Reduce PDF File Size" },
    description: "Compress PDF files privately with Lumeo PDF Workspace. Reduce document size using browser-first processing while keeping files on your device.",
    alternates: { canonical: "/pdf/compress" },
    openGraph: {
      title: "Compress PDF Online Privately - Lumeo PDF",
      description: "Reduce PDF file size in a calm browser-first workspace that keeps files on your device.",
      url: "https://lumeo.in/pdf/compress",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Compress PDF Online Privately - Lumeo PDF",
      description: "Compress PDF files privately in your browser with Lumeo PDF Workspace.",
    },
  });
}

export default function CompressPdfPage() {
  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="Compress PDF"
        description="Reduce PDF file size privately in your browser."
      />

      <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-compress-tool"><CompressPdfTool /></div>
    </PublicCatalogPageShell>
  );
}
