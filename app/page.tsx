// app/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";
import { PublicNav } from "@/components/PublicPdfChrome";
import { PdfToolLauncher } from "@/components/pdf/PdfToolLauncher";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

export const metadata: Metadata = {
  title: {
    absolute:
      "Lumeo PDF - Merge, Split & Compress PDFs Privately in Your Browser",
  },
  description:
    "Merge, split, and compress PDFs privately in your browser. Lumeo is a calm, professional document workspace with no account required.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Lumeo PDF - Private Browser PDF Tools",
    description:
      "Merge, split, and compress PDFs in a private browser-first workspace.",
    url: "https://lumeo.in",
    siteName: "Lumeo PDF",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumeo PDF Workspace",
    description: "Private PDF tools that run in your browser.",
  },
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Lumeo PDF",
    alternateName: ["Lumeo", "Lumeo PDF Workspace", "lumeo.in"],
    url: "https://lumeo.in",
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Lumeo PDF Workspace",
    url: "https://lumeo.in",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any modern browser",
    description:
      "A browser-first PDF workspace for private document merging, splitting, and compression.",
    featureList: ["Merge PDF", "Split PDF", "Compress PDF"],
  },
];

function TrustCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px] text-[var(--atelier-sage-300)]">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function TrustShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px] text-[var(--atelier-sage-300)]">
      <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" />
    </svg>
  );
}

function TrustUserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px] text-[var(--atelier-sage-300)]">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

function TrustClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px] text-[var(--atelier-sage-300)]">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
    </svg>
  );
}

const trustItems = [
  { icon: TrustShieldIcon, label: "Zero server uploads" },
  { icon: TrustUserIcon, label: "No account needed" },
  { icon: TrustCheckIcon, label: "Free, always" },
  { icon: TrustClearIcon, label: "Cleared after download" },
];

const whyItems = [
  {
    icon: TrustShieldIcon,
    title: "Nothing leaves your device",
    description: "Every merge, split, and compression happens locally in your browser.",
  },
  {
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px] text-[var(--atelier-sage-300)]">
        <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
      </svg>
    ),
    title: "No account, no friction",
    description: "Open a tool and start working. No sign-up, no waiting.",
  },
  {
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px] text-[var(--atelier-sage-300)]">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
    title: "Fast, on any device",
    description: "Optimized to feel instant — on desktop, Android, and iPhone alike.",
  },
];

export default function Home() {
  return (
    <main id="main-content" className="lumeo-page-enter aura-home relative flex min-h-dvh flex-col overflow-x-hidden text-[var(--lumeo-paper-100)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="lumeo-ambient absolute -left-44 -top-52 h-[30rem] w-[30rem] rounded-full bg-[rgba(var(--atelier-sage-rgb),0.055)] blur-[60px] md:blur-[150px]" />
        <div className="lumeo-ambient absolute -right-44 top-[-5rem] h-[28rem] w-[28rem] rounded-full bg-[rgba(var(--atelier-brass-rgb),0.05)] blur-[60px] md:blur-[150px] [animation-delay:-4s]" />
        <div className="absolute bottom-[-16rem] left-[42%] h-[26rem] w-[26rem] rounded-full bg-[rgba(var(--atelier-sage-rgb),0.045)] blur-[60px] md:blur-[145px]" />
      </div>

      <PublicNav />

      <section className="relative z-10 flex-1">
        <div className="mx-auto w-full max-w-[1160px] px-5 pb-16 pt-4 sm:px-8 sm:pt-5 lg:pt-5">
          <header className="lumeo-fade-up mx-auto max-w-[40rem] text-center">
            <p className="aura-text-label inline-flex items-center gap-2 text-[var(--text-accent)]">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--text-accent)]" />
              Runs entirely in your browser
            </p>
            <h1
              id="tool-heading"
              className="mt-2.5 font-serif font-semibold text-[clamp(1.75rem,3.6vw,2.5rem)] leading-[1.1] tracking-[-0.015em] text-[var(--text-primary)]"
            >
              Every PDF tool, right <em className="not-italic text-[var(--atelier-sage-300)]">where you need it.</em>
            </h1>
          </header>

          <div className="mt-4 sm:mt-5">
            <PdfToolLauncher showHeading={false} />
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-6 border-y border-[var(--border-hairline)] py-4 sm:gap-10">
            {trustItems.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <item.icon />
                {item.label}
              </div>
            ))}
          </div>

          <section className="pt-16">
            <div className="mx-auto mb-10 max-w-[35rem] text-center">
              <p className="aura-text-label text-[var(--atelier-sage-300)]">Why Lumeo</p>
              <h2 className="mt-3 font-serif font-semibold text-[1.9rem] text-[var(--text-primary)]">Built to be trusted, not just fast</h2>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {whyItems.map((item, index) => (
                <ScrollReveal key={item.title} index={index} className="text-center">
                  <div className="mx-auto flex h-[54px] w-[54px] items-center justify-center rounded-2xl border border-[rgba(132,175,154,0.2)] bg-[rgba(var(--atelier-sage-rgb),0.13)]">
                    <item.icon />
                  </div>
                  <h3 className="mt-5 font-serif text-base text-[var(--text-primary)]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.description}</p>
                </ScrollReveal>
              ))}
            </div>
          </section>

          <div className="my-16 rounded-[22px] border border-[var(--border-hairline)] bg-[linear-gradient(135deg,var(--surface-raised),var(--surface-base))] p-10 text-center sm:p-12">
            <h2 className="font-serif font-semibold text-2xl text-[var(--text-primary)] sm:text-[1.7rem]">Your next PDF task, sorted in seconds.</h2>
            <p className="mx-auto mt-3 max-w-md text-[var(--text-secondary)]">No downloads to install, no forms to fill out. Just drop a file in.</p>
            <Link
              href="/pdf-tools"
              className="mt-7 inline-flex items-center justify-center rounded-xl border border-[rgba(var(--atelier-sage-rgb),0.5)] bg-[linear-gradient(180deg,var(--action-primary-hover),var(--action-primary-active))] px-8 py-3.5 text-sm font-bold text-[var(--text-on-accent)] shadow-[0_12px_28px_rgba(var(--atelier-sage-rgb),0.18)] transition hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)]"
            >
              Open Lumeo
            </Link>
          </div>
        </div>
      </section>

      <div className="relative z-10">
        <PublicFooter />
      </div>
    </main>
  );
}
