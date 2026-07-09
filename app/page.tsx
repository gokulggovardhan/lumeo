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

const coreTools = [
  {
    title: "Merge PDF",
    href: "/pdf/merge",
    description: "Combine multiple PDF files into one document.",
    icon: "M",
  },
  {
    title: "Split PDF",
    href: "/pdf/split",
    description: "Extract pages or separate one PDF into smaller files.",
    icon: "S",
  },
  {
    title: "Compress PDF",
    href: "/pdf/compress",
    description: "Reduce PDF file size for sharing and uploads.",
    icon: "C",
  },
  {
    title: "JPG to PDF",
    href: "/pdf/jpg-to-pdf",
    description: "Convert images into a clean PDF document.",
    icon: "J",
  },
  {
    title: "PDF to JPG",
    href: "/pdf/pdf-to-jpg",
    description: "Export PDF pages as image files.",
    icon: "P",
  },
];

const privacyCards = [
  {
    title: "Browser-first where possible",
    description: "Most tools are designed to run in your browser where possible.",
  },
  {
    title: "No unnecessary sign-in",
    description: "Start with simple tools without creating an account.",
  },
  {
    title: "Clear file handling",
    description:
      "If server processing is required later, files should be temporary and handled with clear deletion rules.",
  },
];

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Lumeo",
    url: "https://lumeo.in",
    description:
      "Lumeo PDF Workspace is a clean online workspace for everyday PDF documents.",
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
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#FF7A3D]/25 bg-[#111017] text-sm font-black text-[#FFB07C] shadow-[0_0_28px_rgba(255,90,54,0.14)]">
              L
            </span>
            <span className="truncate text-sm font-black tracking-tight sm:text-base">
              Lumeo PDF Workspace
            </span>
          </Link>

          <div className="hidden items-center gap-7 text-sm font-bold text-white/52 md:flex">
            <a href="#tools" className="transition hover:text-white">
              Tools
            </a>
            <a href="#privacy" className="transition hover:text-white">
              Privacy
            </a>
          </div>

          <a
            href="#tools"
            className="shrink-0 rounded-full border border-[#FF7A3D]/22 bg-[#FF5A36]/10 px-4 py-2 text-xs font-black text-[#FFB07C] transition hover:border-[#FF7A3D]/42 hover:bg-[#FF5A36]/16"
          >
            Choose a tool
          </a>
        </div>
      </nav>

      <section className="relative overflow-hidden px-5 pb-16 pt-16 sm:px-8 sm:pt-20 lg:px-12 lg:pb-24 lg:pt-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(255,90,54,0.16),transparent_34%),radial-gradient(circle_at_78%_12%,rgba(180,130,255,0.10),transparent_32%),linear-gradient(rgba(255,255,255,0.028)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.022)_1px,transparent_1px)] bg-[size:auto,auto,44px_44px,44px_44px]" />

        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_0.88fr] lg:items-center">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-black text-white/54">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FF7A3D]" />
              Lumeo PDF Workspace
            </div>

            <h1 className="max-w-3xl text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.65rem]">
              Simple, private PDF tools.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/58">
              Merge, split, compress, and convert PDF files with a clean
              workspace designed for everyday documents.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="#tools"
                className="rounded-full bg-[#FF5A36] px-7 py-3.5 text-center text-sm font-black text-white shadow-[0_18px_60px_rgba(255,90,54,0.22)] transition hover:bg-[#FF6E45]"
              >
                Choose a tool
              </a>
              <a
                href="#privacy"
                className="rounded-full border border-white/12 px-7 py-3.5 text-center text-sm font-black text-white/70 transition hover:border-white/25 hover:text-white"
              >
                How privacy works
              </a>
            </div>

            <div className="mt-8 max-w-xl rounded-2xl border border-[#FF7A3D]/18 bg-[#FF5A36]/8 p-4 text-sm font-semibold leading-6 text-[#FFD2B8]/78">
              Designed to be private, simple, and fast.
            </div>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute -inset-6 rounded-[3rem] bg-[radial-gradient(circle_at_42%_18%,rgba(255,90,54,0.17),transparent_42%),radial-gradient(circle_at_80%_78%,rgba(180,130,255,0.11),transparent_40%)] blur-xl" />
            <div className="relative rounded-[2rem] border border-white/10 bg-[#101018]/88 p-4 shadow-2xl shadow-black/45 backdrop-blur-2xl sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-[0.22em] text-white/36">
                  PDF workspace
                </span>
                <span className="rounded-full border border-[#FF7A3D]/18 bg-[#FF5A36]/10 px-3 py-1 text-[10px] font-black text-[#FFB07C]">
                  Private by design
                </span>
              </div>

              <div className="grid gap-3">
                {coreTools.slice(0, 3).map((tool) => (
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
                  <span>Clean document flow</span>
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

      <section id="tools" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12">
        <div className="mb-10 max-w-2xl">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#FFB07C]">
            Core tools
          </p>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            Start with the PDF task you need.
          </h2>
        </div>

        <div className="grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
          {coreTools.map((tool) => (
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

      <section
        id="privacy"
        className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12"
      >
        <div className="mb-10 max-w-2xl">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#FFB07C]">
            Privacy
          </p>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            A simpler approach to everyday files.
          </h2>
        </div>

        <div className="grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 md:grid-cols-3">
          {privacyCards.map((card) => (
            <div key={card.title} className="bg-[#0B0C0F] p-6">
              <span className="mb-6 block h-1 w-10 rounded-full bg-[#FF7A3D]/70" />
              <h3 className="text-lg font-black">{card.title}</h3>
              <p className="mt-3 text-sm leading-6 text-white/50">
                {card.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#101018] p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF7A3D]/60 to-transparent" />
          <h2 className="text-3xl font-black tracking-tight sm:text-5xl">
            Choose a PDF tool and start clean.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-white/50">
            Lumeo keeps the public workspace focused on simple document tasks,
            clear privacy expectations, and a calm interface.
          </p>
          <a
            href="#tools"
            className="mt-8 inline-flex rounded-full bg-[#FF5A36] px-8 py-3.5 text-sm font-black text-white transition hover:bg-[#FF6E45]"
          >
            Choose a tool
          </a>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm text-white/42 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-black text-white/58">Lumeo PDF Workspace</p>
            <p className="mt-1 italic">Built by Govardhan Gudapakam</p>
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
