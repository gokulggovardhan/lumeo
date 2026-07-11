import type { Metadata } from "next";
import { PdfToolPlaceholder } from "@/components/pdf/PdfToolPlaceholder";
import { getPdfTool } from "@/components/pdf/PdfToolRegistry";

export const metadata: Metadata = {
  title: {
    absolute: "Compress PDF Online - Reduce PDF Size | Lumeo PDF",
  },
  description:
    "Compress PDF is a planned browser-first Lumeo PDF Workspace tool for reducing document size with clear privacy-first handling.",
  alternates: {
    canonical: "/pdf/compress",
  },
  openGraph: {
    title: "Compress PDF Online - Reduce PDF Size | Lumeo PDF",
    description:
      "A planned browser-first PDF compression workspace for careful document size reduction.",
    url: "https://lumeo.in/pdf/compress",
    siteName: "Lumeo PDF",
    type: "website",
    images: ["/og-image.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Compress PDF Online - Reduce PDF Size | Lumeo PDF",
    description:
      "A planned browser-first PDF compression workspace for careful document size reduction.",
    images: ["/og-image.svg"],
  },
};

export default function CompressPdfPage() {
  return <PdfToolPlaceholder tool={getPdfTool("compress")} />;
}
