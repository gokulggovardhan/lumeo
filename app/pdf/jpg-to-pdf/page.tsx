import type { Metadata } from "next";
import { PdfToolPlaceholder } from "@/components/pdf/PdfToolPlaceholder";
import { getPdfTool } from "@/components/pdf/PdfToolRegistry";

export const metadata: Metadata = {
  title: "JPG to PDF Online - Lumeo PDF Workspace",
  description:
    "Turn photos, scans, and images into a clean PDF document with Lumeo PDF Workspace.",
  alternates: {
    canonical: "/pdf/jpg-to-pdf",
  },
};

export default function JpgToPdfPage() {
  return <PdfToolPlaceholder tool={getPdfTool("jpg-to-pdf")} />;
}
