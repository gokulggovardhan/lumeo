import type { Metadata } from "next";
import { ToolPlaceholder } from "@/components/PublicPdfChrome";

export const metadata: Metadata = {
  title: "Split PDF Online - Lumeo PDF Workspace",
  description:
    "Extract selected pages or prepare separate documents from one PDF with Lumeo PDF Workspace.",
  alternates: {
    canonical: "/pdf/split",
  },
};

export default function SplitPdfPage() {
  return (
    <ToolPlaceholder
      title="Split PDF"
      description="Extract selected pages or prepare separate documents from one PDF."
      accepted="a PDF file"
    />
  );
}
