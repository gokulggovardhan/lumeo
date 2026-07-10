import type { Metadata } from "next";
import { PublicPageShell } from "@/components/PublicPdfChrome";
import SplitPdfTool from "@/components/pdf/SplitPdfTool";

export const metadata: Metadata = {
  title: "Split PDF Online - Extract PDF Pages Privately | Lumeo PDF",
  description:
    "Split PDF files, extract pages, remove pages, and create smaller PDFs privately in your browser.",
  alternates: {
    canonical: "/pdf/split",
  },
};

export default function SplitPdfPage() {
  return (
    <PublicPageShell
      maxWidth="max-w-[1700px]"
      mainClassName="min-h-screen bg-[#0C1220] text-[#F0EAD6] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden"
      contentClassName="px-5 py-5 sm:px-8 lg:flex lg:w-[95vw] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:px-8 lg:py-2 2xl:px-10"
    >
      <section className="shrink-0">
        <h1 className="font-serif text-4xl leading-tight tracking-[-0.02em] text-[#F0EAD6] sm:text-5xl lg:text-[2.85rem]">
          Split PDF
        </h1>
        <p className="mt-0.5 max-w-2xl text-base leading-5 text-[#F0EAD6]/58">
          Extract pages or separate one PDF into smaller files.
        </p>
      </section>

      <div className="mt-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
        <SplitPdfTool />
      </div>
    </PublicPageShell>
  );
}
