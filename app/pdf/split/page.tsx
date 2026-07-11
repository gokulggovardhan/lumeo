import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/components/PublicPdfChrome";
import SplitPdfTool from "@/components/pdf/SplitPdfTool";

export const metadata: Metadata = {
  title: {
    absolute: "Split PDF Online Privately - Extract or Remove Pages",
  },
  description:
    "Split PDF files privately in your browser. Extract pages, remove pages, create ranges, or separate every page without uploading documents.",
  alternates: {
    canonical: "/pdf/split",
  },
  openGraph: {
    title: "Split PDF Online Privately - Lumeo PDF",
    description:
      "Extract, remove, and separate PDF pages in a premium browser-first workspace.",
    url: "https://lumeo.in/pdf/split",
    siteName: "Lumeo PDF",
    type: "website",
    images: ["/og-image.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Split PDF Online Privately - Lumeo PDF",
    description:
      "Split and extract PDF pages directly on your device using Lumeo PDF Workspace.",
    images: ["/og-image.svg"],
  },
};

export default function SplitPdfPage() {
  return (
    <PublicPageShell
      maxWidth="max-w-[1700px]"
      mainClassName="min-h-screen bg-[#0C1220] text-[#F0EAD6] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden"
      contentClassName="px-5 py-5 sm:px-8 lg:flex lg:w-[95vw] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:px-8 lg:py-2 2xl:px-10"
    >
      <section className="shrink-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
          <h1 className="font-serif text-4xl leading-tight tracking-[-0.02em] text-[#F0EAD6] sm:text-5xl lg:text-[2.85rem]">
            Split PDF
          </h1>
          <p className="mt-0.5 max-w-2xl text-base leading-5 text-[#F0EAD6]/58">
            Extract pages or separate one PDF into smaller files.
          </p>
          </div>
          <Link href="/guides" className="text-xs font-semibold text-[#F0EAD6]/48 transition hover:text-[#F0EAD6]">
            Need help? Read the PDF guides.
          </Link>
        </div>
      </section>

      <div className="mt-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
        <SplitPdfTool />
      </div>
    </PublicPageShell>
  );
}
