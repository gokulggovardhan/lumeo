// app/page.tsx

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";
import { PublicNav } from "@/components/PublicPdfChrome";
import { AuraBadge } from "@/components/ui/Aura";
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

function MergeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h7l5 5v11a1 1 0 01-1 1H7a1 1 0 01-1-1V5a1 1 0 011-1z" />
      <path d="M14 4v5h5" />
      <path d="M9 15l3 3 5-5" stroke="var(--text-accent)" />
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h6v7H6z" />
      <path d="M12 13h6v7h-6z" />
      <path d="M12 4v16" strokeDasharray="3 3" opacity="0.5" />
    </svg>
  );
}

function CompressIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v4M16 3v4M4 11h16" />
      <rect x="4" y="6" width="16" height="15" rx="2" />
      <path d="M9 16l3-3 3 3" stroke="var(--text-accent)" />
    </svg>
  );
}

function RotateIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 109-9" />
      <path d="M3 5v7h7" />
    </svg>
  );
}

function ExtractIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" strokeDasharray="2 3" opacity="0.6" />
    </svg>
  );
}

function WatermarkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 15l2.5-3 2 2L16 10" stroke="var(--text-accent)" />
    </svg>
  );
}

function OpenToolArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

type ToolCardData = {
  name: string;
  description: string;
  icon: () => ReactNode;
  href?: string;
};

const liveTools: ToolCardData[] = [
  { name: "Merge", description: "Combine any number of PDFs into one, in the order you choose.", icon: MergeIcon, href: "/pdf/merge" },
  { name: "Split", description: "Pull specific pages or ranges out into their own documents.", icon: SplitIcon, href: "/pdf/split" },
  { name: "Compress", description: "Shrink file size for sending, without visibly losing quality.", icon: CompressIcon, href: "/pdf/compress" },
];

const comingSoonTools: ToolCardData[] = [
  { name: "Rotate", description: "Fix sideways or upside-down pages before sending a document on.", icon: RotateIcon },
  { name: "Extract pages", description: "Save a subset of pages as a new file, without touching the original.", icon: ExtractIcon },
  { name: "Watermark", description: "Stamp a text or logo watermark across every page at once.", icon: WatermarkIcon },
];

function ToolCard({ tool, index }: { tool: ToolCardData; index: number }) {
  const Icon = tool.icon;
  const content = (
    <>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(var(--atelier-sage-rgb),0.16)] text-[var(--atelier-sage-300)] transition duration-300 [transition-timing-function:cubic-bezier(.34,1.4,.64,1)] group-hover:scale-110 group-hover:-rotate-3 group-hover:bg-[rgba(var(--atelier-sage-rgb),0.26)]">
        <Icon />
      </div>
      <h3 className="mt-5 font-serif text-lg text-[var(--text-primary)]">{tool.name}</h3>
      <p className="mt-2 min-h-10 text-sm leading-6 text-[var(--text-secondary)]">{tool.description}</p>
      <div className="flex flex-wrap gap-2">
        <AuraBadge tone="neutral">Browser-only</AuraBadge>
        {tool.href ? (
          <>
            <AuraBadge tone="success">Private</AuraBadge>
            <AuraBadge tone="warning">Free</AuraBadge>
          </>
        ) : (
          <AuraBadge tone="unavailable" className="border-dashed opacity-70">Coming soon</AuraBadge>
        )}
      </div>
      {tool.href ? (
        <span className="mt-4 inline-flex translate-x-[-6px] items-center gap-1.5 text-sm font-bold text-[var(--atelier-sage-300)] opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:opacity-100">
          Open tool <OpenToolArrow />
        </span>
      ) : null}
    </>
  );

  const cardClassName =
    "aura-luminous-card group relative flex min-w-0 flex-col overflow-hidden rounded-[18px] p-6 transition duration-300 [transition-timing-function:cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1.5 hover:shadow-[0_20px_48px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.18)]";

  return (
    <ScrollReveal index={index}>
      {tool.href ? (
        <Link href={tool.href} aria-label={`Open ${tool.name}`} className={cardClassName}>
          {content}
        </Link>
      ) : (
        <div className={cardClassName} aria-disabled="true">
          {content}
        </div>
      )}
    </ScrollReveal>
  );
}

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
        <div className="mx-auto w-full max-w-[1160px] px-5 pb-16 pt-10 sm:px-8 sm:pt-14 lg:pt-16">
          <header className="lumeo-fade-up mx-auto max-w-[40rem] text-center">
            <p className="aura-text-label inline-flex items-center gap-2 text-[var(--text-accent)]">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--text-accent)]" />
              Runs entirely in your browser
            </p>
            <h1
              id="tool-heading"
              className="mt-4 font-serif text-[clamp(2rem,4.2vw,2.75rem)] leading-[1.12] tracking-[-0.015em] text-[var(--text-primary)]"
            >
              Every PDF tool, right <em className="not-italic text-[var(--atelier-sage-300)]">where you need it.</em>
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-7 text-[var(--text-secondary)]">
              No uploads, no accounts, no waiting on a server. Pick a tool below and start — your files never leave your device.
            </p>
          </header>

          <nav aria-label="Available PDF tools" className="mt-10 sm:mt-12">
            <ul className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {[...liveTools, ...comingSoonTools].map((tool, index) => (
                <li key={tool.name} className="min-w-0">
                  <ToolCard tool={tool} index={index} />
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-12 flex flex-wrap justify-center gap-6 border-y border-[var(--border-hairline)] py-7 sm:gap-10">
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
              <h2 className="mt-3 font-serif text-[1.9rem] text-[var(--text-primary)]">Built to be trusted, not just fast</h2>
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
            <h2 className="font-serif text-2xl text-[var(--text-primary)] sm:text-[1.7rem]">Your next PDF task, sorted in seconds.</h2>
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
