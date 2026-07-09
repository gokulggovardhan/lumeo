import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { LumeoSealMark } from "@/components/PublicPdfChrome";

export const metadata: Metadata = {
  title: "Lumeo PDF Workspace - Simple, Private PDF Tools",
  description:
    "Merge, split, compress, convert, and prepare PDF files with a clean, privacy-first PDF workspace for everyday documents.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Lumeo PDF Workspace - Simple, Private PDF Tools",
    description:
      "Merge, split, compress, convert, and prepare PDF files with a clean, privacy-first PDF workspace for everyday documents.",
    url: "https://lumeo.in",
    siteName: "Lumeo PDF Workspace",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumeo PDF Workspace - Simple, Private PDF Tools",
    description:
      "Merge, split, compress, convert, and prepare PDF files with a clean, privacy-first PDF workspace for everyday documents.",
  },
};

type ToolKind = "merge" | "split" | "compress" | "jpgToPdf" | "pdfToJpg";
type PrivacyKind = "browser" | "account" | "handling";

const coreTools: Array<{
  title: string;
  href: string;
  description: string;
  kind: ToolKind;
}> = [
  {
    title: "Merge PDF",
    href: "/pdf/merge",
    description: "Combine multiple PDF files into one document.",
    kind: "merge",
  },
  {
    title: "Split PDF",
    href: "/pdf/split",
    description: "Extract pages or separate one PDF into smaller files.",
    kind: "split",
  },
  {
    title: "Compress PDF",
    href: "/pdf/compress",
    description: "Reduce PDF file size for sharing and uploads.",
    kind: "compress",
  },
  {
    title: "JPG to PDF",
    href: "/pdf/jpg-to-pdf",
    description: "Convert images into a clean PDF document.",
    kind: "jpgToPdf",
  },
  {
    title: "PDF to JPG",
    href: "/pdf/pdf-to-jpg",
    description: "Export PDF pages as image files.",
    kind: "pdfToJpg",
  },
];

const privacyCards: Array<{
  title: string;
  description: string;
  kind: PrivacyKind;
}> = [
  {
    title: "Browser-first where possible",
    description: "Most tools are designed to run in your browser where possible.",
    kind: "browser",
  },
  {
    title: "No unnecessary sign-in",
    description: "Start with simple tools without creating an account.",
    kind: "account",
  },
  {
    title: "Clear file handling",
    description:
      "If server processing is required later, files should be temporary and handled with clear deletion rules.",
    kind: "handling",
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

function ToolIcon({ kind }: { kind: ToolKind }) {
  const iconClass = "h-6 w-6";

  const paths: Record<ToolKind, ReactNode> = {
    merge: (
      <>
        <path d="M6 5.5h6.5l2 2V15H6V5.5Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M10 9.5h7.5l1.5 1.5v7.5H10v-9Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M4.5 18.5h3M16.5 5.5h3M17.5 5.5v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      </>
    ),
    split: (
      <>
        <path d="M8 4.8h8v14.4H8V4.8Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 6.5v11" stroke="currentColor" strokeDasharray="2 2" strokeLinecap="round" strokeWidth="1.5" />
        <path d="M6 12H3.5m0 0 2-2m-2 2 2 2M18 12h2.5m0 0-2-2m2 2-2 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </>
    ),
    compress: (
      <>
        <path d="M7 4.75h8.5L18 7.25v12H7V4.75Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M15 4.9v3h3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        <path d="M9.4 9.4 12 12l2.6-2.6M9.4 14.6 12 12l2.6 2.6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.55" />
      </>
    ),
    jpgToPdf: (
      <>
        <path d="M4.8 6.5h8.2v7.2H4.8V6.5Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="m5.7 13 2.2-2.35 1.35 1.35 1.15-1.2 1.8 2.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.45" />
        <path d="M15 10.3h4.2v7.2H11v-2.1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </>
    ),
    pdfToJpg: (
      <>
        <path d="M5.8 4.75h8.5l2.5 2.5v6.5h-11V4.75Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M14.2 4.9v3h3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        <path d="M10.8 15.3h8.4v4H10.8v-4Z" stroke="currentColor" strokeWidth="1.7" />
      </>
    ),
  };

  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#1E6B4A]/20 bg-[#1E6B4A]/10 text-[#1E6B4A] transition duration-300 group-hover:border-[#1E6B4A]/35 group-hover:bg-[#1E6B4A]/14">
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none">
        {paths[kind]}
      </svg>
    </span>
  );
}

function PrivacyIcon({ kind }: { kind: PrivacyKind }) {
  const iconClass = "h-5 w-5";
  const icon =
    kind === "browser" ? (
      <rect x="4.5" y="6" width="15" height="11.5" rx="2" stroke="currentColor" strokeWidth="1.7" />
    ) : kind === "account" ? (
      <path d="m7.5 12.2 3 3 6-6.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    ) : (
      <path d="M7 4.8h7.5L17 7.3v11.9H7V4.8Z" stroke="currentColor" strokeWidth="1.7" />
    );

  return (
    <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-[#C9A84C]/25 bg-[#C9A84C]/10 text-[#C9A84C]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none">
        {icon}
      </svg>
    </span>
  );
}

function HeroDocumentVisual() {
  return (
    <div className="relative min-h-[410px] overflow-hidden rounded-xl border border-[#E8DFC8]/14 bg-[#1A2840] p-5 shadow-2xl shadow-black/30">
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(#F0EAD6_1px,transparent_1px),linear-gradient(90deg,#F0EAD6_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative flex items-center justify-between">
        <span className="rounded-full border border-[#C9A84C]/28 bg-[#C9A84C]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#C9A84C]">
          Document desk
        </span>
        <span className="rounded-full border border-[#E8DFC8]/14 bg-[#0C1220]/45 px-3 py-1 text-[10px] font-bold text-[#F0EAD6]/52">
          Ready when tools launch
        </span>
      </div>

      <div className="relative mx-auto mt-10 h-[300px] max-w-[390px]">
        <div className="notary-float absolute left-3 top-9 h-52 w-36 rotate-[-6deg] rounded-lg border border-[#E8DFC8] bg-[#F0EAD6] p-4 text-[#1C1710] shadow-2xl shadow-black/30">
          <div className="mb-4 flex items-center justify-between">
            <span className="rounded-full bg-[#1E6B4A]/10 px-2 py-1 text-[9px] font-bold text-[#1E6B4A]">
              PDF
            </span>
            <span className="h-2 w-2 rounded-full bg-[#C9A84C]" />
          </div>
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-[#1C1710]/22" />
            <div className="h-2 w-4/5 rounded-full bg-[#1C1710]/16" />
            <div className="h-2 w-2/3 rounded-full bg-[#1C1710]/12" />
          </div>
          <div className="mt-9 h-16 rounded-md bg-[#1E6B4A]/10" />
        </div>

        <div className="notary-float-center absolute left-1/2 top-0 h-64 w-44 -translate-x-1/2 rounded-lg border border-[#E8DFC8] bg-[#F0EAD6] p-5 text-[#1C1710] shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
          <div className="mb-5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#1E6B4A]">
              Lumeo
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#C9A84C]/45 bg-[#C9A84C]/12 text-[#C9A84C]">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                <path d="m8.5 12.2 2.5 2.5 4.8-5.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
              </svg>
            </span>
          </div>
          <div className="space-y-2">
            <div className="h-2.5 rounded-full bg-[#1C1710]/22" />
            <div className="h-2.5 w-5/6 rounded-full bg-[#1C1710]/14" />
            <div className="h-2.5 w-2/3 rounded-full bg-[#1C1710]/10" />
          </div>
          <div className="mt-8 grid grid-cols-2 gap-2">
            <div className="h-16 rounded-md bg-[#1E6B4A]/12" />
            <div className="h-16 rounded-md bg-[#C9A84C]/14" />
          </div>
        </div>

        <div className="notary-float-delayed absolute right-2 top-20 h-48 w-36 rotate-[5deg] rounded-lg border border-[#E8DFC8] bg-[#E8DFC8] p-4 text-[#1C1710] shadow-2xl shadow-black/25">
          <div className="mb-4 h-20 rounded-md bg-[#1C1710]/10" />
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-[#1C1710]/22" />
            <div className="h-2 w-3/4 rounded-full bg-[#1C1710]/14" />
          </div>
        </div>

        <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-2 rounded-full border border-[#E8DFC8]/14 bg-[#0C1220]/82 px-3 py-2 text-xs font-bold text-[#F0EAD6]/58 shadow-2xl shadow-black/30">
          <span className="rounded-full bg-[#1E6B4A]/28 px-3 py-1 text-[#F0EAD6]">
            Merge
          </span>
          <span className="rounded-full bg-[#E8DFC8]/8 px-3 py-1">Split</span>
          <span className="rounded-full bg-[#E8DFC8]/8 px-3 py-1">Convert</span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#0C1220] text-[#F0EAD6]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <style>{`
        @keyframes notaryFloat {
          0%, 100% { transform: translateY(0) rotate(var(--notary-rotate, 0deg)); }
          50% { transform: translateY(-8px) rotate(var(--notary-rotate, 0deg)); }
        }

        @keyframes notaryFloatCenter {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-10px); }
        }

        .notary-float { --notary-rotate: -6deg; animation: notaryFloat 7s ease-in-out infinite; }
        .notary-float-delayed { --notary-rotate: 5deg; animation: notaryFloat 8s ease-in-out infinite 0.4s; }
        .notary-float-center { animation: notaryFloatCenter 8.5s ease-in-out infinite 0.2s; }
      `}</style>

      <nav className="sticky top-0 z-50 border-b border-[#E8DFC8]/12 bg-[#0C1220]/92 px-5 py-4 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <LumeoSealMark />
            <span className="truncate text-sm font-semibold tracking-tight">
              Lumeo PDF Workspace
            </span>
          </Link>

          <div className="hidden items-center gap-7 text-sm font-medium text-[#F0EAD6]/50 md:flex">
            <a href="#tools" className="transition hover:text-[#F0EAD6]">
              Tools
            </a>
            <a href="#privacy" className="transition hover:text-[#F0EAD6]">
              Privacy
            </a>
          </div>

          <a
            href="#tools"
            className="shrink-0 rounded-full bg-[#1E6B4A] px-4 py-2 text-xs font-semibold text-[#F0EAD6] transition hover:bg-[#257B56]"
          >
            Choose a tool
          </a>
        </div>
      </nav>

      <section className="relative px-5 pb-16 pt-16 sm:px-8 sm:pt-20 lg:pb-24 lg:pt-24">
        <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(#F0EAD6_1px,transparent_1px),linear-gradient(90deg,#F0EAD6_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="relative z-10 mx-auto grid max-w-[1100px] gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-[#C9A84C]/28 bg-[#C9A84C]/8 px-4 py-2 text-xs font-semibold text-[#C9A84C]">
              <LumeoSealMark />
              Private by design
            </div>

            <h1 className="max-w-3xl font-serif text-5xl leading-[1.02] tracking-[-0.03em] sm:text-6xl lg:text-[4.6rem]">
              Simple, private PDF tools.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#F0EAD6]/58">
              Merge, split, compress, and convert PDF files with a clean
              workspace designed for everyday documents.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="#tools"
                className="rounded-full bg-[#1E6B4A] px-7 py-3.5 text-center text-sm font-semibold text-[#F0EAD6] shadow-[0_18px_50px_rgba(30,107,74,0.22)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#257B56]"
              >
                Choose a tool
              </a>
              <a
                href="#privacy"
                className="rounded-full border border-[#E8DFC8]/16 px-7 py-3.5 text-center text-sm font-semibold text-[#F0EAD6]/70 transition duration-300 hover:-translate-y-0.5 hover:border-[#E8DFC8]/32 hover:text-[#F0EAD6]"
              >
                How privacy works
              </a>
            </div>

            <div className="mt-8 max-w-xl rounded-xl border border-[#E8DFC8]/14 bg-[#1A2840] p-4 text-sm font-medium leading-6 text-[#F0EAD6]/62">
              Designed to be private, simple, and fast.
            </div>
          </div>

          <HeroDocumentVisual />
        </div>
      </section>

      <section id="tools" className="mx-auto max-w-[1100px] px-5 py-16 sm:px-8">
        <div className="mb-10 max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-[#C9A84C]">
            Core tools
          </p>
          <h2 className="font-serif text-4xl tracking-[-0.02em] sm:text-5xl">
            Essential PDF tools.
          </h2>
          <p className="mt-4 text-base leading-7 text-[#F0EAD6]/50">
            Choose a tool to prepare, organize, or convert your PDF files.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {coreTools.map((tool) => (
            <Link
              key={tool.title}
              href={tool.href}
              className="group rounded-xl border border-[#E8DFC8] bg-[#F0EAD6] p-5 text-[#1C1710] shadow-2xl shadow-black/20 transition duration-300 hover:-translate-y-1 hover:border-[#C9A84C] hover:bg-[#F5EFDD]"
            >
              <ToolIcon kind={tool.kind} />
              <h3 className="mt-6 text-lg font-bold">{tool.title}</h3>
              <p className="mt-3 min-h-[4rem] text-sm leading-6 text-[#1C1710]/65">
                {tool.description}
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#1E6B4A] transition">
                Open tool
                <span className="transition duration-300 group-hover:translate-x-1">
                  -&gt;
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section id="privacy" className="mx-auto max-w-[1100px] px-5 py-16 sm:px-8">
        <div className="mb-10 max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-[#C9A84C]">
            Privacy
          </p>
          <h2 className="font-serif text-4xl tracking-[-0.02em] sm:text-5xl">
            A careful desk for everyday files.
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {privacyCards.map((card) => (
            <div
              key={card.title}
              className="rounded-xl border border-[#E8DFC8]/14 bg-[#1A2840] p-6 shadow-2xl shadow-black/15 transition duration-300 hover:border-[#C9A84C]/30"
            >
              <PrivacyIcon kind={card.kind} />
              <h3 className="text-lg font-semibold">{card.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#F0EAD6]/50">
                {card.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-5 py-16 sm:px-8">
        <div className="rounded-xl border border-[#E8DFC8]/14 bg-[#F0EAD6] p-10 text-center text-[#1C1710] shadow-2xl shadow-black/25 sm:p-16">
          <div className="mx-auto mb-6 flex justify-center">
            <LumeoSealMark />
          </div>
          <h2 className="font-serif text-4xl tracking-[-0.02em] sm:text-5xl">
            Start with one PDF task.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-[#1C1710]/65">
            Choose a tool and continue when the engine is ready.
          </p>
          <a
            href="#tools"
            className="mt-8 inline-flex rounded-full bg-[#1E6B4A] px-8 py-3.5 text-sm font-semibold text-[#F0EAD6] transition duration-300 hover:-translate-y-0.5 hover:bg-[#257B56]"
          >
            Choose a tool
          </a>
        </div>
      </section>

      <footer className="border-t border-[#E8DFC8]/12 px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-5 text-sm text-[#F0EAD6]/42 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold text-[#F0EAD6]/68">
              Lumeo PDF Workspace
            </p>
            <p className="mt-1">Built by Govardhan Gudapakam</p>
          </div>
          <div className="flex flex-wrap gap-4 font-semibold">
            <Link href="/about" className="transition hover:text-[#F0EAD6]">
              About
            </Link>
            <Link href="/privacy" className="transition hover:text-[#F0EAD6]">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-[#F0EAD6]">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
