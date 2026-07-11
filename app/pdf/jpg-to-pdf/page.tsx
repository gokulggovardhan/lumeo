import type { Metadata } from "next";
import { PdfToolPlaceholder } from "@/components/pdf/PdfToolPlaceholder";
import { getPdfTool } from "@/components/pdf/PdfToolRegistry";

export const metadata: Metadata = {
  title: {
    absolute: "JPG to PDF Converter Online | Lumeo PDF",
  },
  description:
    "JPG to PDF is a planned browser-first Lumeo PDF Workspace tool for turning images into polished PDF documents.",
  alternates: {
    canonical: "/pdf/jpg-to-pdf",
  },
  openGraph: {
    title: "JPG to PDF Converter Online | Lumeo PDF",
    description:
      "A planned browser-first workspace for converting images into polished PDF documents.",
    url: "https://lumeo.in/pdf/jpg-to-pdf",
    siteName: "Lumeo PDF",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "JPG to PDF Converter Online | Lumeo PDF",
    description:
      "A planned browser-first workspace for converting images into polished PDF documents.",
  },
};

export default function JpgToPdfPage() {
  return <PdfToolPlaceholder tool={getPdfTool("jpg-to-pdf")} />;
}
