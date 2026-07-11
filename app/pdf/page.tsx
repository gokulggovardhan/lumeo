import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import { PublicPageShell } from "@/components/PublicPdfChrome";
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
        maxWidth="max-w-[1360px]"
        mainClassName="min-h-screen bg-[#0C1220] text-[#F0EAD6]"
        contentClassName="px-5 py-7 sm:px-8 sm:py-9 lg:py-10"
      >
        <PdfToolLauncher />
      </PublicPageShell>
      <PublicFooter />
    </>
  );
}
