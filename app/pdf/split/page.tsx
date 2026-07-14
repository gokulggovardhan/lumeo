import type { Metadata } from "next";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import SplitPdfTool from "@/components/pdf/SplitPdfTool";

export const metadata: Metadata = {
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
};

export default function SplitPdfPage() {
  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1080px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <header className="lumeo-fade-up mb-6">
        <p className="aura-text-label text-[var(--text-accent)]">
          PDF tool
        </p>
        <h1 className="mt-2.5 font-serif text-[2.35rem] tracking-[-0.04em] text-[var(--text-primary)] sm:text-[3rem]">
          Split PDF
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
          Extract pages or separate one PDF into smaller files.
        </p>
      </header>

      <div className="lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-split-tool"><SplitPdfTool /></div>
    </PublicCatalogPageShell>
  );
}
