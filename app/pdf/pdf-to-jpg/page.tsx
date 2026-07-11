import type { Metadata } from "next";
import { PdfToolPlaceholder } from "@/components/pdf/PdfToolPlaceholder";
import { getPdfTool } from "@/components/pdf/PdfToolRegistry";

export const metadata: Metadata = {
  title: {
    absolute: "PDF to JPG Converter Online | Lumeo PDF",
  },
  description:
    "PDF to JPG is a planned browser-first Lumeo PDF Workspace tool for converting PDF pages into image files.",
  alternates: {
    canonical: "/pdf/pdf-to-jpg",
  },
  openGraph: {
    title: "PDF to JPG Converter Online | Lumeo PDF",
    description:
      "A planned browser-first workspace for converting PDF pages into image files.",
    url: "https://lumeo.in/pdf/pdf-to-jpg",
    siteName: "Lumeo PDF",
    type: "website",
    images: ["/og-image.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "PDF to JPG Converter Online | Lumeo PDF",
    description:
      "A planned browser-first workspace for converting PDF pages into image files.",
    images: ["/og-image.svg"],
  },
};

export default function PdfToJpgPage() {
  return <PdfToolPlaceholder tool={getPdfTool("pdf-to-jpg")} />;
}
