import type { Metadata } from "next";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import CompressPdfTool from "@/components/pdf/CompressPdfTool";

export const metadata: Metadata = {
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
};

export default function CompressPdfPage() {
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
          Compress PDF
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
          Reduce PDF file size privately in your browser.
        </p>
      </header>

      <div className="lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-compress-tool"><CompressPdfTool /></div>
    </PublicCatalogPageShell>
  );
}
