import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";
import { BrandLockup } from "@/components/PublicPdfChrome";
import { PdfToolLauncher } from "@/components/pdf/PdfToolLauncher";

export const metadata: Metadata = {
  title: {
    absolute: "Lumeo PDF - Private Browser PDF Tools | Merge, Split & Convert PDFs",
  },
  description:
    "Merge, split, compress, and convert PDFs privately with Lumeo PDF Workspace. Fast browser-first PDF tools where your files stay on your device.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Lumeo PDF - Private Browser PDF Tools",
    description:
      "A premium browser-first PDF workspace for private document merging, splitting, compression, and conversion.",
    url: "https://lumeo.in",
    siteName: "Lumeo PDF",
    type: "website",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Lumeo PDF Workspace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumeo PDF Workspace",
    description: "Private PDF tools that run in your browser.",
    images: ["/og-image.svg"],
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
      "A premium browser-first PDF workspace for private document merging, splitting, compression, and conversion.",
    featureList: ["Merge PDF", "Split PDF", "Compress PDF", "Convert PDF"],
    publisher: {
      "@type": "Organization",
      name: "Lumeo PDF",
      url: "https://lumeo.in",
    },
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0C1220] text-[#F0EAD6]">
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

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(#F0EAD6_1px,transparent_1px),linear-gradient(90deg,#F0EAD6_1px,transparent_1px)] [background-size:48px_48px]" />

        <div className="relative mx-auto max-w-[1360px] px-5 pb-12 pt-7 sm:px-8 sm:pt-9">
          <header className="mb-6 flex flex-col gap-4 border-b border-[#E8DFC8]/10 pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A84C]">
                Lumeo PDF Workspace
              </p>
              <h1 className="mt-2 font-serif text-3xl leading-tight tracking-[-0.025em] text-[#F0EAD6] sm:text-4xl lg:text-[2.8rem]">
                Choose a PDF tool.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#F0EAD6]/52 sm:text-base">
                Merge, split, and compress documents directly in your browser.
              </p>
            </div>
          </header>

          <PdfToolLauncher showHeading={false} />
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
