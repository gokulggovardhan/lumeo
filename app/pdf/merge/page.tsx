import type { Metadata } from "next";
import Link from "next/link";
import MergePdfTool from "@/components/pdf/MergePdfTool";

export const metadata: Metadata = {
  title: "Merge PDF Online – Lumeo PDF Workspace",
  description:
    "Combine multiple PDF files into one clean document with Lumeo PDF Workspace.",
  alternates: {
    canonical: "/pdf/merge",
  },
};

export default function MergePdfPage() {
  return (
    <main className="min-h-screen bg-[#07070A] px-5 py-8 text-[#F8F1E6] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-4xl">
        <nav className="flex items-center justify-between border-b border-white/10 pb-5">
          <Link href="/" className="text-sm font-black text-white">
            Lumeo PDF Workspace
          </Link>
          <Link
            href="/"
            className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/60 transition hover:text-white"
          >
            Back to Lumeo PDF
          </Link>
        </nav>

        <section className="py-14">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#FFB07C]">
            PDF workspace
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
            Merge PDF
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/54">
            Combine multiple PDF files into one clean document.
          </p>
        </section>

        <MergePdfTool />
      </div>
    </main>
  );
}
