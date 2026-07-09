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
      <section className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
        <div>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[#C9A84C]">
            PDF workspace
          </p>
          <h1 className="font-serif text-4xl tracking-[-0.02em] text-[#F0EAD6] sm:text-6xl">
            Merge PDF
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#F0EAD6]/55">
            Combine multiple PDF files into one clean document.
          </p>
        </div>
        <div className="rounded-xl border border-[#E8DFC8]/12 bg-[#1A2840]/72 p-5 text-sm leading-6 text-[#F0EAD6]/52">
          A browser-first document console for arranging files, choosing an
          output style, and creating a single polished PDF.
        </div>
      </section>

      <div className="mt-10">
        <MergePdfTool />
      </div>
    </PublicPageShell>
  );
}
