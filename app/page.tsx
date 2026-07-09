import type { Metadata } from "next";
import type { ReactNode } from "react";
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

function LumeoMark() {
  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#FF7A3D]/25 bg-[#111017] shadow-[0_0_28px_rgba(255,90,54,0.14)]">
      <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#FF7A3D]/22 via-transparent to-white/5" />
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="relative h-5 w-5 text-[#FFB07C]"
        fill="none"
      >
        <path
          d="M7 5v14h9"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
        <path d="M14 9.25 18.25 12 14 14.75V9.25Z" fill="currentColor" />
      </svg>
    </span>
  );
}

function IconFrame({ children }: { children: ReactNode }) {
  return (
    <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-[#FF7A3D]/20 bg-[#FF5A36]/10 text-[#FFB07C] shadow-[0_0_32px_rgba(255,90,54,0.12)] transition duration-300 group-hover:-translate-y-0.5 group-hover:border-[#FF7A3D]/40 group-hover:bg-[#FF5A36]/16 group-hover:shadow-[0_0_42px_rgba(255,90,54,0.22)]">
      <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-transparent" />
      <span className="relative">{children}</span>
    </span>
  );
}

function ToolIcon({ kind }: { kind: ToolKind }) {
  const iconClass = "h-6 w-6";

  if (kind === "merge") {
    return (
      <IconFrame>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none">
          <path d="M6 5.5h6.5l2 2V15H6V5.5Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M10 9.5h7.5l1.5 1.5v7.5H10v-9Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M4.5 18.5h3M16.5 5.5h3M17.5 5.5v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      </IconFrame>
    );
  }

  if (kind === "split") {
    return (
      <IconFrame>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none">
          <path d="M8 4.8h8v14.4H8V4.8Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 6.5v11" stroke="currentColor" strokeDasharray="2 2" strokeLinecap="round" strokeWidth="1.5" />
          <path d="M6 12H3.5m0 0 2-2m-2 2 2 2M18 12h2.5m0 0-2-2m2 2-2 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      </IconFrame>
    );
  }

  if (kind === "compress") {
    return (
      <IconFrame>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none">
          <path d="M7 4.75h8.5L18 7.25v12H7V4.75Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M15 4.9v3h3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M9 12h2.25M15 12h-2.25M12 9.25v2.5M12 14.25v-2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
          <path d="M9.6 9.6 12 12l2.4-2.4M9.6 14.4 12 12l2.4 2.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.45" />
        </svg>
      </IconFrame>
    );
  }

  if (kind === "jpgToPdf") {
    return (
      <IconFrame>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none">
          <path d="M4.8 6.5h8.2v7.2H4.8V6.5Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="m5.7 13 2.2-2.35 1.35 1.35 1.15-1.2 1.8 2.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.45" />
          <path d="M15 10.3h4.2v7.2H11v-2.1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M13.7 13.9h3.1M13.7 16h2.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.45" />
        </svg>
      </IconFrame>
    );
  }

  return (
    <IconFrame>
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none">
        <path d="M5.8 4.75h8.5l2.5 2.5v6.5h-11V4.75Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M14.2 4.9v3h3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        <path d="M8.2 10.1h5.5M8.2 12.1h3.7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.45" />
        <path d="M10.8 15.3h8.4v4H10.8v-4Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="m11.7 18.8 1.55-1.55 1.05 1.05.9-.95 1.45 1.45" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" />
      </svg>
    </IconFrame>
  );
}

function PrivacyIcon({ kind }: { kind: PrivacyKind }) {
  const iconClass = "h-5 w-5";

  return (
    <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] text-[#FFB07C]">
      {kind === "browser" && (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none">
          <rect x="4.5" y="6" width="15" height="11.5" rx="2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M4.8 9.5h14.4M9.5 20h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      )}
      {kind === "account" && (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none">
          <path d="M12 4.5a7 7 0 1 0 7 7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
          <path d="m15.5 5.5 1.75 1.75L20.5 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M8.8 15.2c.7-1.25 1.75-1.85 3.2-1.85s2.5.6 3.2 1.85M12 11.6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeLinecap="round" strokeWidth="1.45" />
        </svg>
      )}
      {kind === "handling" && (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none">
          <path d="M7 4.8h7.5L17 7.3v11.9H7V4.8Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M14.4 5v3h3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M9.5 12h5M9.5 15h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.55" />
        </svg>
      )}
    </span>
  );
}

function HeroDocumentVisual() {
  return (
    <div className="relative min-h-[430px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#101018]/88 p-5 shadow-2xl shadow-black/45 backdrop-blur-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_20%,rgba(255,90,54,0.20),transparent_34%),radial-gradient(circle_at_78%_80%,rgba(180,130,255,0.13),transparent_34%)]" />
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:32px_32px]" />

      <div className="relative flex items-center justify-between">
        <span className="rounded-full border border-[#FF7A3D]/18 bg-[#FF5A36]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#FFB07C]">
          PDF
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-[10px] font-black text-white/48">
          Ready when tools launch
        </span>
      </div>

      <div className="relative mx-auto mt-10 h-[305px] max-w-[410px]">
        <div className="lumeo-float absolute left-3 top-10 h-52 w-36 rotate-[-8deg] rounded-3xl border border-white/12 bg-[#F8F1E6] p-4 text-[#141017] shadow-2xl shadow-black/35">
          <div className="mb-4 flex items-center justify-between">
            <span className="rounded-full bg-[#FF5A36]/14 px-2 py-1 text-[9px] font-black text-[#C6451F]">
              PDF
            </span>
            <span className="h-2 w-2 rounded-full bg-[#FF5A36]" />
          </div>
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-[#141017]/22" />
            <div className="h-2 w-4/5 rounded-full bg-[#141017]/16" />
            <div className="h-2 w-2/3 rounded-full bg-[#141017]/12" />
          </div>
          <div className="mt-9 h-16 rounded-2xl bg-[#FF5A36]/12" />
        </div>

        <div className="lumeo-float-slow absolute left-1/2 top-2 h-64 w-44 -translate-x-1/2 rounded-[2rem] border border-[#FF7A3D]/22 bg-[#17151d] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
          <div className="mb-5 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[#FFB07C]">
              Lumeo
            </span>
            <span className="h-8 w-8 rounded-2xl border border-[#FF7A3D]/22 bg-[#FF5A36]/14" />
          </div>
          <div className="space-y-2">
            <div className="h-2.5 rounded-full bg-white/22" />
            <div className="h-2.5 w-5/6 rounded-full bg-white/14" />
            <div className="h-2.5 w-2/3 rounded-full bg-white/10" />
          </div>
          <div className="mt-8 grid grid-cols-2 gap-2">
            <div className="h-16 rounded-2xl bg-[#FF5A36]/16" />
            <div className="h-16 rounded-2xl bg-white/8" />
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="lumeo-shimmer h-full w-2/3 rounded-full bg-[#FF7A3D]/70" />
          </div>
        </div>

        <div className="lumeo-float-delayed absolute right-2 top-20 h-48 w-36 rotate-[7deg] rounded-3xl border border-white/12 bg-[#F8F1E6]/92 p-4 text-[#141017] shadow-2xl shadow-black/30">
          <div className="mb-4 h-20 rounded-2xl bg-[#141017]/10" />
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-[#141017]/22" />
            <div className="h-2 w-3/4 rounded-full bg-[#141017]/14" />
          </div>
        </div>

        <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-2 rounded-full border border-white/10 bg-[#07070A]/76 px-3 py-2 text-xs font-black text-white/58 shadow-2xl shadow-black/35 backdrop-blur-xl">
          <span className="rounded-full bg-[#FF5A36]/18 px-3 py-1 text-[#FFB07C]">
            Merge
          </span>
          <span className="rounded-full bg-white/[0.055] px-3 py-1">Split</span>
          <span className="rounded-full bg-white/[0.055] px-3 py-1">Convert</span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#07070A] text-[#F8F1E6]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <style>{`
        @keyframes lumeoGradientDrift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.82; }
          50% { transform: translate3d(2%, -2%, 0) scale(1.05); opacity: 1; }
        }

        @keyframes lumeoFloat {
          0%, 100% { transform: translateY(0) rotate(var(--lumeo-rotate, 0deg)); }
          50% { transform: translateY(-10px) rotate(var(--lumeo-rotate, 0deg)); }
        }

        @keyframes lumeoFloatCenter {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-12px); }
        }

        @keyframes lumeoShimmer {
          0%, 100% { transform: translateX(-10%); opacity: 0.68; }
          50% { transform: translateX(18%); opacity: 1; }
        }

        .lumeo-bg-drift { animation: lumeoGradientDrift 12s ease-in-out infinite; }
        .lumeo-float { --lumeo-rotate: -8deg; animation: lumeoFloat 6.5s ease-in-out infinite; }
        .lumeo-float-delayed { --lumeo-rotate: 7deg; animation: lumeoFloat 7.8s ease-in-out infinite 0.6s; }
        .lumeo-float-slow { animation: lumeoFloatCenter 8s ease-in-out infinite 0.2s; }
        .lumeo-shimmer { animation: lumeoShimmer 5.4s ease-in-out infinite; }
      `}</style>

      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#07070A]/88 px-5 py-3.5 backdrop-blur-xl sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <LumeoMark />
            <span className="truncate text-sm font-semibold tracking-tight sm:text-base">
              Lumeo PDF Workspace
            </span>
          </Link>

          <div className="hidden items-center gap-7 text-sm font-medium text-white/52 md:flex">
            <a href="#tools" className="transition hover:text-white">
              Tools
            </a>
            <a href="#privacy" className="transition hover:text-white">
              Privacy
            </a>
          </div>

          <a
            href="#tools"
            className="shrink-0 rounded-full border border-[#FF7A3D]/22 bg-[#FF5A36]/10 px-4 py-2 text-xs font-semibold text-[#FFB07C] transition hover:border-[#FF7A3D]/42 hover:bg-[#FF5A36]/16"
          >
            Choose a tool
          </a>
        </div>
      </nav>

      <section className="relative overflow-hidden px-5 pb-16 pt-16 sm:px-8 sm:pt-20 lg:px-12 lg:pb-24 lg:pt-24">
        <div className="lumeo-bg-drift pointer-events-none absolute inset-[-8%] bg-[radial-gradient(circle_at_30%_0%,rgba(255,90,54,0.18),transparent_34%),radial-gradient(circle_at_78%_12%,rgba(180,130,255,0.12),transparent_32%),radial-gradient(circle_at_55%_82%,rgba(255,122,61,0.10),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.026)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:44px_44px]" />

        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_0.92fr] lg:items-center">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-white/54">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FF7A3D]" />
              Lumeo PDF Workspace
            </div>

            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[4.55rem]">
              Simple, private PDF tools.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/58">
              Merge, split, compress, and convert PDF files with a clean
              workspace designed for everyday documents.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="#tools"
                className="rounded-full bg-[#FF5A36] px-7 py-3.5 text-center text-sm font-semibold text-white shadow-[0_18px_60px_rgba(255,90,54,0.22)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#FF6E45]"
              >
                Choose a tool
              </a>
              <a
                href="#privacy"
                className="rounded-full border border-white/12 px-7 py-3.5 text-center text-sm font-semibold text-white/70 transition duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:text-white"
              >
                How privacy works
              </a>
            </div>

            <div className="mt-8 max-w-xl rounded-2xl border border-[#FF7A3D]/18 bg-[#FF5A36]/8 p-4 text-sm font-medium leading-6 text-[#FFD2B8]/78">
              Designed to be private, simple, and fast.
            </div>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute -inset-6 rounded-[3rem] bg-[radial-gradient(circle_at_42%_18%,rgba(255,90,54,0.18),transparent_42%),radial-gradient(circle_at_80%_78%,rgba(180,130,255,0.12),transparent_40%)] blur-xl" />
            <HeroDocumentVisual />
          </div>
        </div>
      </section>

      <section id="tools" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12">
        <div className="mb-10 max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#FFB07C]">
            Core tools
          </p>
          <h2 className="text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
            Essential PDF tools.
          </h2>
          <p className="mt-4 text-base leading-7 text-white/50">
            Choose a tool to prepare, organize, or convert your PDF files.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {coreTools.map((tool) => (
            <Link
              key={tool.title}
              href={tool.href}
              className="group rounded-3xl border border-white/10 bg-[#0B0C0F]/88 p-6 shadow-2xl shadow-black/20 transition duration-300 hover:-translate-y-1 hover:border-[#FF7A3D]/32 hover:bg-[#12121b] hover:shadow-[0_24px_80px_rgba(255,90,54,0.10)]"
            >
              <ToolIcon kind={tool.kind} />
              <h3 className="mt-6 text-lg font-semibold">{tool.title}</h3>
              <p className="mt-3 min-h-[4rem] text-sm leading-6 text-white/48">
                {tool.description}
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[#FFB07C]/72 transition group-hover:text-[#FFB07C]">
                Open tool
                <span className="transition duration-300 group-hover:translate-x-1">
                  -&gt;
                </span>
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
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#FFB07C]">
            Privacy
          </p>
          <h2 className="text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
            A simpler approach to everyday files.
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {privacyCards.map((card) => (
            <div
              key={card.title}
              className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/15 backdrop-blur transition duration-300 hover:border-[#FF7A3D]/24 hover:bg-white/[0.052]"
            >
              <PrivacyIcon kind={card.kind} />
              <h3 className="text-lg font-semibold">{card.title}</h3>
              <p className="mt-3 text-sm leading-6 text-white/50">
                {card.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#101018] p-10 text-center shadow-2xl shadow-black/25 sm:p-16">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF7A3D]/60 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,90,54,0.12),transparent_42%)]" />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-[-0.025em] sm:text-5xl">
              Start with one PDF task.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-white/50">
              Choose a tool and continue when the engine is ready.
            </p>
            <a
              href="#tools"
              className="mt-8 inline-flex rounded-full bg-[#FF5A36] px-8 py-3.5 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-[#FF6E45]"
            >
              Choose a tool
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm text-white/42 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold text-white/58">Lumeo PDF Workspace</p>
            <p className="mt-1 italic">Built by Govardhan Gudapakam</p>
          </div>
          <div className="flex flex-wrap gap-4 font-semibold">
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
