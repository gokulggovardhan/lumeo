import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "PDF Tools Hub - Lumeo PDF Workspace",
  description:
    "Choose a premium PDF workflow for merging, splitting, compressing, and converting everyday documents.",
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
    <main className="min-h-screen bg-[#07070A] px-5 py-8 text-[#F8F1E6] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
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

        <section className="py-16">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#FFB07C]">
            PDF tools
          </p>
          <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
            Choose a calm workspace for your document.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/54">
            Start with a focused PDF tool. Processing engines are coming next,
            and each workspace is being designed around privacy and control.
          </p>
        </section>

        <section className="grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
          {tools.map((tool) => (
            <Link
              key={tool.title}
              href={tool.href}
              className="group bg-[#0B0C0F] p-6 transition hover:bg-[#15151f]"
            >
              <span className="mb-6 flex h-10 w-10 items-center justify-center rounded-2xl border border-[#FF7A3D]/20 bg-[#FF5A36]/10 text-sm font-black text-[#FFB07C]">
                {tool.title.charAt(0)}
              </span>
              <h2 className="text-lg font-black">{tool.title}</h2>
              <p className="mt-3 min-h-[5rem] text-sm leading-6 text-white/48">
                {tool.description}
              </p>
              <span className="mt-5 inline-flex text-xs font-black text-[#FFB07C]/70 transition group-hover:text-[#FFB07C]">
                Open tool
              </span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
