import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import PdfToWordTool from "@/components/pdf/PdfToWordTool";
import WordToPdfTool from "@/components/pdf/WordToPdfTool";
import runtimeRelease from "@/config/office-runtime-release.json";
import { getToolBlockedState } from "@/lib/tools/tool-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lumeo conversion production smoke",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ConversionProductionSmokePage() {
  const requestHeaders = await headers();
  if (
    requestHeaders.get("x-lumeo-conversion-smoke") !== runtimeRelease.releaseId
  ) {
    notFound();
  }

  const [wordState, pdfState] = await Promise.all([
    getToolBlockedState("word-to-pdf"),
    getToolBlockedState("pdf-to-word"),
  ]);

  // This validation surface exists only while both public tools are still
  // blocked. Once go-live happens, it automatically disappears.
  if (!wordState.blocked || !pdfState.blocked) {
    notFound();
  }

  return (
    <main className="mx-auto grid max-w-[1240px] gap-10 px-3 py-8 sm:px-6">
      <section data-testid="word-production-smoke" className="min-w-0">
        <h1 className="sr-only">Word to PDF production validation</h1>
        <WordToPdfTool />
      </section>

      <section data-testid="pdf-production-smoke" className="min-w-0">
        <h2 className="sr-only">PDF to Word production validation</h2>
        <PdfToWordTool />
      </section>
    </main>
  );
}
