// app/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";
import { BrandLockup } from "@/components/PublicPdfChrome";
import { PdfToolLauncher } from "@/components/pdf/PdfToolLauncher";

export const metadata: Metadata = {
  title: {
    absolute: "Lumeo PDF - Merge, Split & Compress PDFs Privately in Your Browser",
  },
  description:
    "Merge, split, and compress PDFs for free. Lumeo runs in your browser — files are processed locally and never stored on our servers.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Lumeo PDF - Private Browser PDF Tools",
    description:
      "Merge, split, and compress PDFs for free. Files are processed in your browser, not on a server.",
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
    publisher: {
      "@type": "Organization",
      name: "Lumeo PDF",
      url: "https://lumeo.in",
    },
  },
];

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-x-hidden bg-[#0C1220] text-[#F0EAD6]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <nav className="sticky top-0 z-50 border-b border-[#E8DFC8]/10 bg-[#0C1220]/94 px-5 py-3 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-4">
          <Link href="/" aria-label="Lumeo PDF home">
            <BrandLockup markSize="h-9 w-9 sm:h-10 sm:w-10" />
          </Link>

          <div className="flex items-center gap-2 text-xs font-semibold text-[#F0EAD6]/58 sm:gap-5 sm:text-sm">
            <Link
              href="/pdf"
              className="rounded-full px-3 py-2 transition hover:bg-[#F0EAD6]/[0.04] hover:text-[#F0EAD6]"
            >
              Tools
            </Link>
            <Link
              href="/guides"
              className="hidden rounded-full px-3 py-2 transition hover:bg-[#F0EAD6]/[0.04] hover:text-[#F0EAD6] sm:inline-flex"
            >
              Guides
            </Link>
            <Link
              href="/privacy"
              className="rounded-full px-3 py-2 transition hover:bg-[#F0EAD6]/[0.04] hover:text-[#F0EAD6]"
            >
              Privacy
            </Link>
          </div>
        </div>
      </nav>

      <div className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:linear-gradient(#F0EAD6_1px,transparent_1px),linear-gradient(90deg,#F0EAD6_1px,transparent_1px)] [background-size:52px_52px]" />
      <div className="pointer-events-none absolute -left-48 top-16 h-[34rem] w-[34rem] rounded-full bg-[#1E6B4A]/[0.07] blur-[110px]" />
      <div className="pointer-events-none absolute -right-48 bottom-24 h-[30rem] w-[30rem] rounded-full bg-[#C9A84C]/[0.045] blur-[120px]" />

      <section className="relative z-10 flex flex-1 items-center">
        <div className="mx-auto grid w-full max-w-[1360px] gap-9 px-5 py-10 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-12 lg:py-8">
          <header className="max-w-xl">
            <p className="inline-flex rounded-full border border-[#C9A84C]/20 bg-[#C9A84C]/[0.055] px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[#C9A84C]">
              Private document workspace
            </p>
            <h1 className="mt-6 font-serif text-5xl leading-[0.98] tracking-[-0.035em] text-[#F0EAD6] sm:text-6xl lg:text-[4.25rem]">
              PDF work,
              <br />
              thoughtfully refined.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-[#F0EAD6]/54 sm:text-lg">
              A calm, private workspace for everyday PDF tasks. Work directly
              in your browser with clear controls, careful processing and no
              unnecessary complexity.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/pdf/merge"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#1E6B4A] px-6 text-sm font-bold text-[#F0EAD6] transition hover:bg-[#257D58] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]/55 motion-reduce:transition-none"
              >
                Start with Merge PDF
              </Link>
              <Link
                href="/pdf"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#E8DFC8]/14 px-6 text-sm font-bold text-[#F0EAD6]/68 transition hover:border-[#C9A84C]/30 hover:text-[#F0EAD6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]/55 motion-reduce:transition-none"
              >
                Explore all tools
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[#F0EAD6]/48" aria-label="Workspace trust">
              {["Browser-only", "No account", "Clear handling"].map((item) => (
                <li key={item} className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#1E6B4A]" />
                  {item}
                </li>
              ))}
            </ul>
          </header>

          <PdfToolLauncher showHeading={false} />
        </div>
      </section>

      <div className="relative z-10">
        <PublicFooter />
      </div>
    </main>
  );
}
