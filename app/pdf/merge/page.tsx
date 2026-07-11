import type { Metadata } from "next";
import MergePdfTool from "@/components/pdf/MergePdfTool";
import { PublicPageShell } from "@/components/PublicPdfChrome";
import {
  mergeFaqs,
  ToolSeoSection,
} from "@/components/pdf/PdfSeoContent";

export const metadata: Metadata = {
  title: {
    absolute: "Merge PDF Online Privately - Browser PDF Merger",
  },
  description:
    "Merge PDF files privately in your browser with Lumeo PDF Workspace. Reorder documents, control output sizing, and combine PDFs without uploading files.",
  alternates: {
    canonical: "/pdf/merge",
  },
  openGraph: {
    title: "Merge PDF Online Privately - Lumeo PDF",
    description:
      "Combine PDF files in a premium browser-first workspace where supported documents stay on your device.",
    url: "https://lumeo.in/pdf/merge",
    siteName: "Lumeo PDF",
    type: "website",
    images: ["/og-image.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Merge PDF Online Privately - Lumeo PDF",
    description:
      "Combine and reorder PDF files directly in your browser with no server upload for supported processing.",
    images: ["/og-image.svg"],
  },
};

export default function MergePdfPage() {
  return (
    <>
      <PublicPageShell
        maxWidth="max-w-[1700px]"
        mainClassName="min-h-screen bg-[#0C1220] text-[#F0EAD6] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden"
        contentClassName="px-5 py-5 sm:px-8 lg:flex lg:w-[95vw] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:px-8 lg:py-2 2xl:px-10"
      >
        <section className="shrink-0">
          <div>
            <h1 className="font-serif text-4xl leading-tight tracking-[-0.02em] text-[#F0EAD6] sm:text-5xl lg:text-[2.85rem]">
              Merge PDF
            </h1>
            <p className="mt-0.5 max-w-2xl text-base leading-5 text-[#F0EAD6]/58">
              Combine PDFs into one clean document.
            </p>
          </div>
        </section>

        <div className="mt-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
          <MergePdfTool />
        </div>
      </PublicPageShell>
      <ToolSeoSection
        toolName="Merge PDF"
        toolUrl="https://lumeo.in/pdf/merge"
        appName="Lumeo Merge PDF"
        appDescription="A browser-first PDF merger that combines and reorders PDF documents while keeping supported processing on the user's device."
        heading="Professional PDF merging, without giving up privacy"
        copy="Lumeo Merge PDF combines document control with browser-first privacy. Arrange files, review page details, choose an output style, and create a polished PDF without sending supported documents to a remote processing server."
        benefits={[
          {
            title: "Private by design",
            description:
              "Supported PDF processing takes place directly in your browser, helping your files stay on your device.",
          },
          {
            title: "Professional output control",
            description:
              "Choose smart A4 sizing, match the first PDF, or preserve original document dimensions.",
          },
          {
            title: "Built for document-heavy work",
            description:
              "Review file size, page count, page type, ordering, and document warnings before merging.",
          },
        ]}
        steps={[
          "Choose PDF files from your device",
          "Arrange and review the documents",
          "Select output preferences",
          "Create and download the merged PDF",
        ]}
        faqs={mergeFaqs}
        relatedLinks={[
          { href: "/pdf/split", label: "Split a PDF into selected pages" },
          { href: "/pdf", label: "Explore all Lumeo PDF tools" },
          { href: "/pdf/compress", label: "Prepare a smaller PDF file" },
        ]}
      />
    </>
  );
}
