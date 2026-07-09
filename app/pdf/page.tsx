import type { Metadata } from "next";
import { PublicPageShell } from "@/components/PublicPdfChrome";
import { PdfToolLauncher } from "@/components/pdf/PdfToolLauncher";

export const metadata: Metadata = {
  title: "PDF Tools Hub - Lumeo PDF Workspace",
  description:
    "Choose a private PDF workflow for merging, splitting, compressing, and converting everyday documents.",
  alternates: {
    canonical: "/pdf",
  },
};

export default function PdfHubPage() {
  return (
    <PublicPageShell
      maxWidth="max-w-[1700px]"
      mainClassName="min-h-screen bg-[#0C1220] text-[#F0EAD6] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden"
      contentClassName="px-5 py-6 sm:px-8 lg:flex lg:w-[95vw] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:px-8 lg:py-5 2xl:px-10"
    >
      <PdfToolLauncher />
    </PublicPageShell>
  );
}
