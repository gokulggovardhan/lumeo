import type { Metadata } from "next";
import { PdfToolPlaceholder } from "@/components/pdf/PdfToolPlaceholder";
import { getPdfTool } from "@/components/pdf/PdfToolRegistry";

export const metadata: Metadata = {
  title: "Compress PDF Online - Reduce PDF Size | Lumeo PDF",
  description:
    "Reduce PDF file size for email, forms, and sharing with Lumeo PDF Workspace.",
  alternates: {
    canonical: "/pdf/compress",
  },
};

export default function CompressPdfPage() {
  return <PdfToolPlaceholder tool={getPdfTool("compress")} />;
}
