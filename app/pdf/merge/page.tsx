import type { Metadata } from "next";
import MergePdfTool from "@/components/pdf/MergePdfTool";
import { PublicPageShell } from "@/components/PublicPdfChrome";

export const metadata: Metadata = {
  title: "Merge PDF Online - Lumeo PDF Workspace",
  description:
    "Combine multiple PDF files into one clean document with Lumeo PDF Workspace.",
  alternates: {
    canonical: "/pdf/merge",
  },
};

export default function MergePdfPage() {
  return (
    <PublicPageShell
      mainClassName="min-h-screen bg-[#0C1220] text-[#F0EAD6] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden"
      contentClassName="px-5 py-5 sm:px-8 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:py-2"
    >
      <section className="shrink-0">
        <div>
          <h1 className="font-serif text-3xl leading-tight tracking-[-0.02em] text-[#F0EAD6] sm:text-4xl">
            Merge PDF
          </h1>
          <p className="mt-0.5 max-w-2xl text-sm leading-5 text-[#F0EAD6]/55">
            Combine PDFs into one clean document.
          </p>
        </div>
      </section>

      <div className="mt-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
        <MergePdfTool />
      </div>
    </PublicPageShell>
  );
}
