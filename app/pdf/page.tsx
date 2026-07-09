import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/components/PublicPdfChrome";

export const metadata: Metadata = {
  title: "PDF Tools Hub - Lumeo PDF Workspace",
  description:
    "Choose a private PDF workflow for merging, splitting, compressing, and converting everyday documents.",
  alternates: {
    canonical: "/pdf",
  },
};

const tools = [
  {
    title: "Merge PDF",
    href: "/pdf/merge",
    description: "Combine multiple PDF files into one clean document.",
  },
  {
    title: "Split PDF",
    href: "/pdf/split",
    description: "Extract selected pages or prepare separate documents.",
  },
  {
    title: "Compress PDF",
    href: "/pdf/compress",
    description: "Reduce PDF file size for email, forms, and sharing.",
  },
  {
    title: "JPG to PDF",
    href: "/pdf/jpg-to-pdf",
    description: "Turn photos, scans, and images into a clean PDF document.",
  },
  {
    title: "PDF to JPG",
    href: "/pdf/pdf-to-jpg",
    description: "Export PDF pages as high-quality images.",
  },
];

export default function PdfHubPage() {
  return (
    <PublicPageShell
      mainClassName="min-h-screen bg-[#0C1220] text-[#F0EAD6] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden"
      contentClassName="px-5 py-8 sm:px-8 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:justify-center lg:overflow-hidden lg:py-6"
    >
      <section>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-[#C9A84C]">
          PDF tools
        </p>
        <h1 className="max-w-3xl font-serif text-4xl tracking-[-0.02em] sm:text-6xl">
          Choose a careful workspace for your document.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[#F0EAD6]/55">
          Start with a focused PDF tool. Each workspace is designed around
          privacy, clarity, and control.
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {tools.map((tool) => (
          <Link
            key={tool.title}
            href={tool.href}
            className="group rounded-xl border border-[#E8DFC8] bg-[#F0EAD6] p-5 text-[#1C1710] shadow-2xl shadow-black/20 transition duration-300 hover:-translate-y-1 hover:border-[#C9A84C] hover:bg-[#F5EFDD]"
          >
            <span className="mb-6 flex h-10 w-10 items-center justify-center rounded-full border border-[#1E6B4A]/20 bg-[#1E6B4A]/10 text-sm font-bold text-[#1E6B4A]">
              PDF
            </span>
            <h2 className="text-lg font-bold">{tool.title}</h2>
            <p className="mt-3 min-h-[5rem] text-sm leading-6 text-[#1C1710]/65">
              {tool.description}
            </p>
            <span className="mt-5 inline-flex text-xs font-bold text-[#1E6B4A]">
              Open tool
            </span>
          </Link>
        ))}
      </section>
    </PublicPageShell>
  );
}
