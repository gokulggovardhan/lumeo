import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/components/PublicPdfChrome";
import CompressPdfTool from "@/components/pdf/CompressPdfTool";

export const metadata: Metadata = {
  title: {
    absolute: "Compress PDF Online Privately - Reduce PDF File Size",
  },
  description:
    "Compress PDF files privately with Lumeo PDF Workspace. Reduce document size using browser-first processing while keeping files on your device.",
  alternates: {
    canonical: "https://lumeo.in/pdf/compress",
  },
  openGraph: {
    title: "Compress PDF Online Privately - Lumeo PDF",
    description:
      "Reduce PDF file size in a premium browser-first workspace that keeps files on your device.",
    url: "https://lumeo.in/pdf/compress",
    siteName: "Lumeo PDF",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Compress PDF Online Privately - Lumeo PDF",
    description:
      "Compress PDF files privately in your browser with Lumeo PDF Workspace.",
  },
};

export default function CompressPdfPage() {
  return (
    <PublicPageShell
      maxWidth="max-w-[1700px]"
      mainClassName="min-h-screen bg-[#0C1220] text-[#F0EAD6] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden"
      contentClassName="px-5 py-5 sm:px-8 lg:flex lg:w-[95vw] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:px-8 lg:py-2 2xl:px-10"
    >
      <section className="shrink-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
          <h1 className="font-serif text-4xl leading-tight tracking-[-0.02em] text-[#F0EAD6] sm:text-5xl lg:text-[2.85rem]">
            Compress PDF
          </h1>
          <p className="mt-0.5 max-w-2xl text-base leading-5 text-[#F0EAD6]/58">
            Reduce PDF file size privately in your browser.
          </p>
          </div>
          <Link href="/guides" className="text-xs font-semibold text-[#F0EAD6]/48 transition hover:text-[#F0EAD6]">
            Need help? Read the PDF guides.
          </Link>
        </div>
      </section>

      <div className="mt-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
        <CompressPdfTool />
      </div>
    </PublicPageShell>
  );
}
