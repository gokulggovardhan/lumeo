import type { Metadata } from "next";
import { PdfToolPlaceholder } from "@/components/pdf/PdfToolPlaceholder";
import { getPdfTool } from "@/components/pdf/PdfToolRegistry";

export const metadata: Metadata = {
  title: "Split PDF Online - Lumeo PDF Workspace",
  description:
    "Extract selected pages or prepare separate documents from one PDF with Lumeo PDF Workspace.",
  alternates: {
    canonical: "/pdf/split",
  },
};

export default function SplitPdfPage() {
  return <PdfToolPlaceholder tool={getPdfTool("split")} />;
}
