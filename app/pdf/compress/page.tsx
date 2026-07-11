import type { Metadata } from "next";
import { PublicPageShell } from "@/components/PublicPdfChrome";
import { ToolSeoSection } from "@/components/pdf/PdfSeoContent";
import CompressPdfTool from "@/components/pdf/CompressPdfTool";

const compressFaqs = [
  {
    question: "Are my PDF files uploaded?",
    answer:
      "No. Supported compression processing takes place directly in your browser for this tool.",
  },
  {
    question: "Can every PDF be compressed significantly?",
    answer:
      "No. Results depend on the document. Text-only or already optimised PDFs may have limited savings.",
  },
  {
    question: "Will compression reduce quality?",
    answer:
      "Some profiles reduce page rendering detail, image quality, or colour information. Lumeo explains the compression plan before processing.",
  },
  {
    question: "What happens if the compressed file is larger?",
    answer:
      "Lumeo compares the actual result with the original and recommends keeping the original when compression does not provide a useful reduction.",
  },
];

export const metadata: Metadata = {
  title: {
    absolute: "Compress PDF Online Privately - Reduce PDF File Size",
  },
  description:
    "Compress PDF files privately with Lumeo PDF Workspace. Reduce document size using browser-first processing while keeping files on your device.",
  alternates: {
    canonical: "https://lumeo.in/pdf/compress",
  },
  openGraph: {
    title: "Compress PDF Online Privately - Lumeo PDF",
    description:
      "Reduce PDF file size in a premium browser-first workspace that keeps files on your device.",
    url: "https://lumeo.in/pdf/compress",
    siteName: "Lumeo PDF",
    type: "website",
    images: ["/og-image.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Compress PDF Online Privately - Lumeo PDF",
    description:
      "Compress PDF files privately in your browser with Lumeo PDF Workspace.",
    images: ["/og-image.svg"],
  },
};

export default function CompressPdfPage() {
  return (
    <>
      <PublicPageShell
        maxWidth="max-w-[1700px]"
        mainClassName="min-h-screen bg-[#0C1220] text-[#F0EAD6] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden"
        contentClassName="px-5 py-5 sm:px-8 lg:flex lg:w-[95vw] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:px-8 lg:py-2 2xl:px-10"
      >
        <section className="shrink-0">
          <h1 className="font-serif text-4xl leading-tight tracking-[-0.02em] text-[#F0EAD6] sm:text-5xl lg:text-[2.85rem]">
            Compress PDF
          </h1>
          <p className="mt-0.5 max-w-2xl text-base leading-5 text-[#F0EAD6]/58">
            Reduce PDF file size with a private browser-first compression workspace.
          </p>
        </section>

        <div className="mt-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
          <CompressPdfTool />
        </div>
      </PublicPageShell>
      <ToolSeoSection
        toolName="Compress PDF"
        toolUrl="https://lumeo.in/pdf/compress"
        appName="Lumeo Compress PDF"
        appDescription="A browser-first PDF compressor that rebuilds page appearance locally to reduce document size where practical."
        heading="Compress PDFs privately in your browser"
        copy="Lumeo Compress PDF helps reduce document size using local browser processing. Results depend on the PDF: image-heavy and scanned files may shrink meaningfully, while text-only or already optimised files may have limited savings."
        benefits={[
          {
            title: "Browser-first processing",
            description:
              "Supported compression happens on your device without a required server upload.",
          },
          {
            title: "Profile-based control",
            description:
              "Choose High quality, Balanced, or Smaller file before processing.",
          },
          {
            title: "Honest result check",
            description:
              "Lumeo measures the actual output and explains when the original is better.",
          },
        ]}
        steps={[
          "Choose a PDF from your device",
          "Review the local document profile",
          "Select a compression profile",
          "Compress and download the validated result",
        ]}
        faqs={compressFaqs}
        relatedLinks={[
          { href: "/pdf/merge", label: "Merge PDF files" },
          { href: "/pdf/split", label: "Split a PDF document" },
          { href: "/pdf", label: "Explore all Lumeo PDF tools" },
        ]}
      />
    </>
  );
}
