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
    <PublicPageShell>
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-[#C9A84C]">
            PDF workspace
          </p>
          <h1 className="font-serif text-3xl tracking-[-0.02em] text-[#F0EAD6] sm:text-5xl">
            Merge PDF
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#F0EAD6]/55">
            Combine multiple PDF files into one clean document.
          </p>
        </div>
        <div className="rounded-full border border-[#E8DFC8]/12 bg-[#1A2840]/72 px-4 py-2 text-xs font-semibold text-[#F0EAD6]/52">
          Browser-first document console
        </div>
      </section>

      <div className="mt-4">
        <MergePdfTool />
      </div>
    </PublicPageShell>
  );
}
