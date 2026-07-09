import type { Metadata } from "next";
import { ToolPlaceholder } from "@/components/PublicPdfChrome";

export const metadata: Metadata = {
  title: "JPG to PDF Online - Lumeo PDF Workspace",
  description:
    "Turn photos, scans, and images into a clean PDF document with Lumeo PDF Workspace.",
  alternates: {
    canonical: "/pdf/jpg-to-pdf",
  },
};

export default function JpgToPdfPage() {
  return (
    <ToolPlaceholder
      title="JPG to PDF"
      description="Turn photos, scans, and images into a clean PDF document."
      accepted="JPG and image files"
    />
  );
}
