import type { Metadata } from "next";
import { PdfToolPlaceholder } from "@/components/pdf/PdfToolPlaceholder";
import { getPdfTool } from "@/components/pdf/PdfToolRegistry";

export const metadata: Metadata = {
  title: "PDF to JPG Converter Online | Lumeo PDF",
  description:
    "Export PDF pages as high-quality images with Lumeo PDF Workspace.",
  alternates: {
    canonical: "/pdf/pdf-to-jpg",
  },
};

export default function PdfToJpgPage() {
  return <PdfToolPlaceholder tool={getPdfTool("pdf-to-jpg")} />;
}
