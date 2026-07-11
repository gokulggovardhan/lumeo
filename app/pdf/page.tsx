import type { Metadata } from "next";
import { PublicPageShell } from "@/components/PublicPdfChrome";
import { PdfHubSeoContent } from "@/components/pdf/PdfSeoContent";
import { PdfToolLauncher } from "@/components/pdf/PdfToolLauncher";

export const metadata: Metadata = {
  title: {
    absolute: "Private PDF Tools Online - Lumeo PDF Workspace",
  },
  description:
    "Use private browser-first PDF tools to merge, split, compress, and convert documents. Lumeo processes supported files directly on your device.",
  alternates: {
    canonical: "/pdf",
  },
  openGraph: {
    title: "Private PDF Tools Online - Lumeo PDF Workspace",
    description:
      "Professional browser-first PDF tools designed for privacy, speed, and premium document handling.",
    url: "https://lumeo.in/pdf",
    siteName: "Lumeo PDF",
    type: "website",
    images: ["/og-image.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Private PDF Tools Online - Lumeo PDF Workspace",
    description:
      "Professional browser-first PDF tools designed for privacy, speed, and premium document handling.",
    images: ["/og-image.svg"],
  },
};

export default function PdfHubPage() {
  return (
    <>
      <PublicPageShell
        maxWidth="max-w-[1700px]"
        mainClassName="min-h-screen bg-[#0C1220] text-[#F0EAD6] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden"
        contentClassName="px-5 py-6 sm:px-8 lg:flex lg:w-[95vw] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:px-8 lg:py-5 2xl:px-10"
      >
        <PdfToolLauncher />
      </PublicPageShell>
      <PdfHubSeoContent />
    </>
  );
}
