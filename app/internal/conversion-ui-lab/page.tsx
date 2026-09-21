import { notFound } from "next/navigation";

import PdfToWordTool from "@/components/pdf/PdfToWordTool";
import WordToPdfTool from "@/components/pdf/WordToPdfTool";

export default function BrowserConversionUiLabPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className="mx-auto grid max-w-[1240px] gap-10 px-3 py-8 sm:px-6">
      <section data-testid="word-public-ui" className="min-w-0">
        <h1 className="sr-only">Word to PDF UI validation</h1>
        <WordToPdfTool />
      </section>

      <section data-testid="pdf-public-ui" className="min-w-0">
        <h2 className="sr-only">PDF to Word UI validation</h2>
        <PdfToWordTool />
      </section>
    </main>
  );
}
