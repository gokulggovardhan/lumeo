import type { Metadata } from "next";
import { ToolPlaceholder } from "@/components/PublicPdfChrome";

export const metadata: Metadata = {
  title: "PDF to JPG Online - Lumeo PDF Workspace",
  description:
    "Export PDF pages as high-quality images with Lumeo PDF Workspace.",
  alternates: {
    canonical: "/pdf/pdf-to-jpg",
  },
};

export default function PdfToJpgPage() {
  return (
    <ToolPlaceholder
      title="PDF to JPG"
      description="Export PDF pages as high-quality images."
      accepted="a PDF file"
    />
  );
}
