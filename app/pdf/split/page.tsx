import type { Metadata } from "next";
import { PublicPageShell } from "@/components/PublicPdfChrome";
import {
  splitFaqs,
  ToolSeoSection,
} from "@/components/pdf/PdfSeoContent";
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
    <>
      <PublicPageShell
        maxWidth="max-w-[1700px]"
        mainClassName="min-h-screen bg-[#0C1220] text-[#F0EAD6] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden"
        contentClassName="px-5 py-5 sm:px-8 lg:flex lg:w-[95vw] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:px-8 lg:py-2 2xl:px-10"
      >
        <section className="shrink-0">
          <h1 className="font-serif text-4xl leading-tight tracking-[-0.02em] text-[#F0EAD6] sm:text-5xl lg:text-[2.85rem]">
            Split PDF
          </h1>
          <p className="mt-0.5 max-w-2xl text-base leading-5 text-[#F0EAD6]/58">
            Extract pages or separate one PDF into smaller files.
          </p>
        </section>

        <div className="mt-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
          <SplitPdfTool />
        </div>
      </PublicPageShell>
      <ToolSeoSection
        toolName="Split PDF"
        toolUrl="https://lumeo.in/pdf/split"
        appName="Lumeo Split PDF"
        appDescription="A browser-first PDF splitter for extracting, removing, and separating PDF pages on the user's device."
        heading="Precise PDF splitting in a private browser workspace"
        copy="Lumeo Split PDF helps you extract, remove, and separate pages while keeping supported processing inside your browser. Choose a split method, define pages or ranges, and download the result as a PDF or ZIP."
        benefits={[
          {
            title: "Flexible split methods",
            description:
              "Extract selected pages, remove pages, split by ranges, separate every page, or create equal chunks.",
          },
          {
            title: "Fast page selection",
            description:
              "Use page chips, presets, and range shortcuts such as odd, even, all, and end.",
          },
          {
            title: "Browser-first privacy",
            description:
              "Supported document processing stays on your device during the split workflow.",
          },
        ]}
        steps={[
          "Choose a PDF from your device",
          "Select the split method",
          "Choose pages or define ranges",
          "Create and download the result",
        ]}
        faqs={splitFaqs}
        relatedLinks={[
          { href: "/pdf/merge", label: "Merge multiple PDF documents" },
          { href: "/pdf", label: "Explore all Lumeo PDF tools" },
          { href: "/pdf/compress", label: "Prepare a smaller PDF file" },
        ]}
      />
    </>
  );
}
