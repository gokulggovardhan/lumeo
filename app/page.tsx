import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Lumeo PDF Workspace - Premium Private PDF Tools",
  description:
    "Merge, split, compress, convert, and prepare PDF files with a clean, privacy-first PDF workspace for everyday documents.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Lumeo PDF Workspace - Premium Private PDF Tools",
    description:
      "Merge, split, compress, convert, and prepare PDF files with a clean, privacy-first PDF workspace for everyday documents.",
    url: "https://lumeo.in",
    siteName: "Lumeo PDF Workspace",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumeo PDF Workspace - Premium Private PDF Tools",
    description:
      "Merge, split, compress, convert, and prepare PDF files with a clean, privacy-first PDF workspace for everyday documents.",
  },
};

const primaryTools = [
  {
    title: "Merge PDF",
    href: "/pdf/merge",
    description: "Combine multiple PDF files into one clean document.",
    icon: "M",
  },
  {
    title: "Split PDF",
    href: "/pdf/split",
    description: "Extract selected pages or prepare separate documents.",
    icon: "S",
  },
  {
    title: "Compress PDF",
    href: "/pdf/compress",
    description: "Reduce file size for email, forms, and sharing.",
    icon: "C",
  },
  {
    title: "JPG to PDF",
    href: "/pdf/jpg-to-pdf",
    description: "Turn photos, scans, and images into a clean PDF.",
    icon: "J",
  },
  {
    title: "PDF to JPG",
    href: "/pdf/pdf-to-jpg",
    description: "Export PDF pages as high-quality images.",
    icon: "P",
  },
];

const workflows = [
  {
    title: "Job Application PDF",
    tools: ["JPG to PDF", "Merge PDF", "Compress PDF", "Add Page Numbers"],
  },
  {
    title: "Government Document PDF",
    tools: ["JPG to PDF", "Compress PDF", "Rotate PDF", "Reorder Pages"],
  },
  {
    title: "Bank Statement PDF",
    tools: ["Compress PDF", "Split PDF", "Protect PDF"],
  },
  {
    title: "Invoice PDF",
    tools: ["Merge PDF", "Add Watermark", "Compress PDF"],
  },
  {
    title: "Study Notes PDF",
    tools: ["JPG to PDF", "Merge PDF", "Add Page Numbers"],
  },
  {
    title: "Office Report PDF",
    tools: ["Merge PDF", "Reorder Pages", "Watermark", "Compress PDF"],
  },
];

const comingNextTools = [
  "Rotate PDF",
  "Delete Pages",
  "Reorder Pages",
  "Add Page Numbers",
  "Add Watermark",
  "Protect PDF",
  "Unlock PDF",
  "Sign PDF",
  "OCR PDF",
  "Redact PDF",
];

const useCases = [
  "Resumes",
  "Forms",
  "Invoices",
  "Bank statements",
  "Scanned documents",
  "Office files",
];

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Lumeo",
    url: "https://lumeo.in",
    description:
      "Lumeo PDF Workspace is a premium online workspace for preparing everyday PDF documents.",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Lumeo PDF Workspace",
    url: "https://lumeo.in",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    description:
      "Merge, split, compress, convert, and prepare PDF files with a clean, privacy-first PDF workspace for everyday documents.",
    publisher: {
      "@type": "Organization",
      name: "Lumeo",
      url: "https://lumeo.in",
    },
  },
];

function ToolIcon({ label }: { label: string }) {
  return (
    <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FF7A3D]/20 bg-[#FF5A36]/10 text-sm font-black text-[#FFB07C] shadow-[0_0_32px_rgba(255,90,54,0.12)]">
      <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-transparent" />
      <span className="relative">{label}</span>
    </span>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#07070A] text-[#F8F1E6]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#07070A]/88 px-5 py-3.5 backdrop-blur-xl sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#FF7A3D]/25 bg-[#111017] text-sm font-black text-[#FFB07C] shadow-[0_0_28px_rgba(255,90,54,0.14)]">
              L
            </span>
            <span className="text-sm font-black tracking-tight sm:text-base">
              Lumeo PDF Workspace
            </span>
          </Link>

          <div className="hidden items-center gap-7 text-sm font-bold text-white/52 md:flex">
            <a href="#workflows" className="transition hover:text-white">
              Workflows
            </a>
            <a href="#tools" className="transition hover:text-white">
              Tools
            </a>
            <a href="#privacy" className="transition hover:text-white">
              Privacy
            </a>
          </div>

          <a
            href="#tools"
            className="rounded-full border border-[#FF7A3D]/22 bg-[#FF5A36]/10 px-4 py-2 text-xs font-black text-[#FFB07C] transition hover:border-[#FF7A3D]/42 hover:bg-[#FF5A36]/16"
          >
            Choose a tool
          </a>
        </div>
      </nav>

      <section className="relative overflow-hidden px-5 pb-16 pt-16 sm:px-8 sm:pt-20 lg:px-12 lg:pb-20 lg:pt-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(255,90,54,0.16),transparent_34%),radial-gradient(circle_at_78%_12%,rgba(180,130,255,0.12),transparent_32%),linear-gradient(rgba(255,255,255,0.028)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.022)_1px,transparent_1px)] bg-[size:auto,auto,44px_44px,44px_44px]" />

        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_0.92fr] lg:items-center">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-black text-white/54">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FF7A3D]" />
              Lumeo PDF Workspace
            </div>

            <h1 className="max-w-3xl text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.55rem]">
              PDF tools that feel calm, private, and premium.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/58">
              Merge, compress, convert, and prepare everyday documents with a
              clean PDF workspace built for resumes, forms, invoices, bank
              statements, and office files.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="#tools"
                className="rounded-full bg-[#FF5A36] px-7 py-3.5 text-center text-sm font-black text-white shadow-[0_18px_60px_rgba(255,90,54,0.22)] transition hover:bg-[#FF6E45]"
              >
                Choose a PDF tool
              </a>
              <a
                href="#privacy"
                className="rounded-full border border-white/12 px-7 py-3.5 text-center text-sm font-black text-white/70 transition hover:border-white/25 hover:text-white"
              >
                See privacy approach
              </a>
            </div>

            <div className="mt-8 max-w-xl rounded-2xl border border-[#FF7A3D]/18 bg-[#FF5A36]/8 p-4 text-sm font-semibold leading-6 text-[#FFD2B8]/78">
              Most tools are designed to run in your browser where possible.
            </div>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute -inset-6 rounded-[3rem] bg-[radial-gradient(circle_at_40%_20%,rgba(255,90,54,0.17),transparent_42%),radial-gradient(circle_at_80%_78%,rgba(180,130,255,0.13),transparent_40%)] blur-xl" />
            <div className="relative rounded-[2rem] border border-white/10 bg-[#101018]/88 p-4 shadow-2xl shadow-black/45 backdrop-blur-2xl sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-[0.22em] text-white/36">
                  Document desk
                </span>
                <span className="rounded-full border border-[#FF7A3D]/18 bg-[#FF5A36]/10 px-3 py-1 text-[10px] font-black text-[#FFB07C]">
                  Private by design
                </span>
              </div>

              <div className="grid gap-3">
                {primaryTools.slice(0, 3).map((tool, index) => (
                  <Link
                    key={tool.title}
                    href={tool.href}
                    className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4 transition hover:border-[#FF7A3D]/28 hover:bg-white/[0.065]"
                  >
                    <ToolIcon label={tool.icon} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-black">{tool.title}</h3>
                        <span className="text-xs font-black text-[#FFB07C]/70 transition group-hover:text-[#FFB07C]">
                          Open
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-white/44">
                        {tool.description}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-[#07070A]/72 p-4">
                <div className="mb-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-white/32">
                  <span>Workspace flow</span>
                  <span>PDF</span>
                </div>
                <div className="grid grid-cols-[0.8fr_1.15fr_0.7fr] gap-2">
                  <div className="h-11 rounded-xl bg-[#FF5A36]/14" />
                  <div className="h-11 rounded-xl bg-[#FF5A36]/28" />
                  <div className="h-11 rounded-xl bg-white/10" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="workflows"
        className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12"
      >
        <div className="mb-10 max-w-2xl">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#FFB07C]">
            Workflow-first
          </p>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            What are you preparing today?
          </h2>
          <p className="mt-4 text-base leading-7 text-white/50">
            Start from the document outcome, then choose the tools that fit the
            job.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workflows.map((workflow) => (
            <div
              key={workflow.title}
              className="rounded-2xl border border-white/10 bg-[#101018] p-5 transition hover:border-[#FF7A3D]/22 hover:bg-[#13131d]"
            >
              <h3 className="text-lg font-black">{workflow.title}</h3>
              <div className="mt-5 flex flex-wrap gap-2">
                {workflow.tools.map((tool) => (
                  <span
                    key={tool}
                    className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-bold text-white/56"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="tools" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12">
        <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#FFB07C]">
              Primary tools
            </p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
              Clean tools for everyday PDFs.
            </h2>
          </div>
          <Link
            href="/pdf"
            className="text-sm font-black text-[#FFB07C] transition hover:text-white"
          >
            View PDF hub
          </Link>
        </div>

        <div className="grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
          {primaryTools.map((tool) => (
            <Link
              key={tool.title}
              href={tool.href}
              className="group bg-[#0B0C0F] p-6 transition hover:bg-[#15151f]"
            >
              <ToolIcon label={tool.icon} />
              <h3 className="mt-6 text-lg font-black">{tool.title}</h3>
              <p className="mt-3 min-h-[4.5rem] text-sm leading-6 text-white/48">
                {tool.description}
              </p>
              <span className="mt-5 inline-flex text-xs font-black text-[#FFB07C]/72 transition group-hover:text-[#FFB07C]">
                Open tool
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12">
        <div className="rounded-3xl border border-white/10 bg-[#101018] p-6 sm:p-8">
          <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#FFB07C]">
                Coming next
              </p>
              <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
                More document controls are on the roadmap.
              </h2>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-black text-white/44">
              Planned tools
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {comingNextTools.map((tool) => (
              <div
                key={tool}
                className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3"
              >
                <p className="text-sm font-black text-white/70">{tool}</p>
                <p className="mt-1 text-xs font-bold text-white/32">
                  Coming next
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="privacy"
        className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.86fr_1.14fr] lg:px-12"
      >
        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#FFB07C]">
            Privacy-first
          </p>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            Built around privacy, clarity, and control.
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            "Your files stay private.",
            "No unnecessary sign-in.",
            "Most tools are designed to run in your browser where possible.",
            "If server processing is required later, files should be temporary and handled with clear deletion rules.",
          ].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-sm font-semibold leading-6 text-white/58"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12">
        <div className="mb-7">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#FFB07C]">
            Real documents
          </p>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            Made for everyday paperwork.
          </h2>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {useCases.map((useCase) => (
            <span
              key={useCase}
              className="rounded-full border border-white/10 bg-[#101018] px-5 py-2.5 text-sm font-bold text-white/58"
            >
              {useCase}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#101018] p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF7A3D]/60 to-transparent" />
          <h2 className="text-3xl font-black tracking-tight sm:text-5xl">
            Prepare your next PDF calmly.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-white/50">
            Pick the document workflow, open the right tool, and keep the
            workspace focused on the file you need to finish.
          </p>
          <a
            href="#tools"
            className="mt-8 inline-flex rounded-full bg-[#FF5A36] px-8 py-3.5 text-sm font-black text-white transition hover:bg-[#FF6E45]"
          >
            Choose a PDF tool
          </a>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm text-white/38 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-bold">© 2026 Lumeo. All rights reserved.</p>
            <p className="mt-1 italic">Developed by Govardhan Gudapakam</p>
          </div>
          <div className="flex flex-wrap gap-4 font-bold">
            <Link href="/about" className="transition hover:text-white">
              About
            </Link>
            <Link href="/privacy" className="transition hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-white">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
