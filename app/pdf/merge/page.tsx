import type { Metadata } from "next";
import MergePdfTool from "@/components/pdf/MergePdfTool";
import { PublicPageShell } from "@/components/PublicPdfChrome";

export const metadata: Metadata = {
  title: "Merge PDF Online - Combine PDF Files Privately | Lumeo PDF",
  description:
    "Merge PDF files securely in your browser. Combine documents without uploading files.",
  alternates: {
    canonical: "/pdf/merge",
  },
};

export default function MergePdfPage() {
  return (
    <PublicPageShell
      maxWidth="max-w-[1700px]"
      mainClassName="min-h-screen bg-[#0C1220] text-[#F0EAD6] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden"
      contentClassName="px-5 py-5 sm:px-8 lg:flex lg:w-[95vw] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:px-8 lg:py-2 2xl:px-10"
    >
      <section className="shrink-0">
        <div>
          <h1 className="font-serif text-4xl leading-tight tracking-[-0.02em] text-[#F0EAD6] sm:text-5xl lg:text-[2.85rem]">
            Merge PDF
          </h1>
          <p className="mt-0.5 max-w-2xl text-base leading-5 text-[#F0EAD6]/58">
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
