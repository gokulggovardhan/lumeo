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
    <PublicPageShell contentClassName="px-5 py-5 sm:px-8 lg:h-[calc(100dvh-57px)] lg:overflow-hidden lg:py-3">
      <section className="flex flex-col justify-center lg:min-h-[58px]">
        <div>
          <h1 className="font-serif text-3xl leading-tight tracking-[-0.02em] text-[#F0EAD6] sm:text-4xl">
            Merge PDF
          </h1>
          <p className="mt-0.5 max-w-2xl text-sm leading-5 text-[#F0EAD6]/55">
            Combine PDFs into one clean document.
          </p>
        </div>
      </section>

      <div className="mt-2 lg:h-[calc(100%-66px)] lg:overflow-hidden">
        <MergePdfTool />
      </div>
    </PublicPageShell>
  );
}
