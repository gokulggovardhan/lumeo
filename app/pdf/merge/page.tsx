import type { Metadata } from "next";
import { PublicPageShell } from "@/components/PublicPdfChrome";
import MergePdfTool from "@/components/pdf/MergePdfTool";

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
    <PublicPageShell
      maxWidth="max-w-[1080px]"
      mainClassName="min-h-dvh bg-[#0C1220] text-[#F0EAD6]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <header className="lumeo-fade-up mb-6">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#CBA052]">
          PDF tool
        </p>
        <h1 className="mt-2.5 text-[2.35rem] font-bold tracking-[-0.04em] text-[#F0EAD6] sm:text-[3rem]">
          Merge PDF
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#F0EAD6]/60 sm:text-base">
          Combine PDFs into one clean document.
        </p>
      </header>

      <div className="lumeo-fade-up lumeo-fade-up-delay-1"><MergePdfTool /></div>
    </PublicPageShell>
  );
}
