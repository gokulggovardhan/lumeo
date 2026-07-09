import type { Metadata } from "next";
import { ToolPlaceholder } from "@/components/PublicPdfChrome";

export const metadata: Metadata = {
  title: "Compress PDF Online - Lumeo PDF Workspace",
  description:
    "Reduce PDF file size for email, forms, and sharing with Lumeo PDF Workspace.",
  alternates: {
    canonical: "/pdf/compress",
  },
};

export default function CompressPdfPage() {
  return (
    <ToolPlaceholder
      title="Compress PDF"
      description="Reduce PDF file size for email, forms, and sharing."
      accepted="a PDF file"
    />
  );
}
