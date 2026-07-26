import type { Metadata } from "next";
import Link from "next/link";
import {
  InfoPageSection,
  InfoPageShell,
  InfoStructuredData,
} from "@/components/InfoPage";
import {
  compressFaqs,
  extractTextFaqs,
  htmlToPdfFaqs,
  jpgToPdfFaqs,
  mergeFaqs,
  organizeFaqs,
  pdfToJpgFaqs,
  pdfToWordFaqs,
  privacyFaqs,
  signFaqs,
  splitFaqs,
  wordToPdfFaqs,
} from "@/components/pdf/toolFaqs";
import { withSeoOverride } from "@/lib/public-site/seo";

const allFaqs = [
  ...mergeFaqs,
  ...splitFaqs,
  ...compressFaqs,
  ...organizeFaqs,
  ...jpgToPdfFaqs,
  ...pdfToJpgFaqs,
  ...extractTextFaqs,
  ...htmlToPdfFaqs,
  ...signFaqs,
  ...wordToPdfFaqs,
  ...pdfToWordFaqs,
  ...privacyFaqs,
];

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/guides", {
    title: {
      absolute: "Lumeo PDF Guides",
    },
    description:
      "Concise guides for every Lumeo PDF tool — Compose, Distill, Capture, Render, Seal, and Convert — plus how to choose the right one.",
    alternates: {
      canonical: "/guides",
    },
    openGraph: {
      title: "Lumeo PDF Guides",
      description:
        "A refined help handbook for using Lumeo PDF Workspace tools.",
      url: "https://lumeo.in/guides",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Lumeo PDF Guides",
      description: "Concise help for private browser-first PDF tools.",
    },
  });
}

function ToolGuide({
  title,
  href,
  use,
  workflow,
  limitation,
}: {
  title: string;
  href: string;
  use: string;
  workflow: string;
  limitation: string;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-5 shadow-[inset_0_1px_0_rgba(255,253,247,0.06)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-serif font-semibold text-2xl text-[var(--text-primary)]">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{use}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Workflow: {workflow}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Limitation: {limitation}
          </p>
        </div>
        <Link
          href={href}
          className="shrink-0 rounded-full bg-[rgba(var(--lumeo-paper-rgb),0.075)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[rgba(var(--lumeo-gold-rgb),0.12)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.2)]"
        >
          Open tool
        </Link>
      </div>
    </div>
  );
}

function FaqGroup({ title, items }: { title: string; items: typeof allFaqs }) {
  return (
    <section className="pt-2">
      <h3 className="font-serif font-semibold text-2xl text-[var(--text-primary)]">{title}</h3>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <details key={item.question} className="group rounded-[var(--radius-xl)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-4 shadow-[inset_0_1px_0_rgba(255,253,247,0.06)]">
            <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--text-primary)] marker:hidden">
              <span className="flex items-center justify-between gap-4">
                {item.question}
                <span className="text-[var(--text-accent)] transition group-open:rotate-45">
                  +
                </span>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

export default function GuidesPage() {
  return (
    <InfoPageShell
      eyebrow="Guides"
      title="Lumeo PDF Guides"
      description="A concise handbook for choosing and using Lumeo PDF Workspace tools."
      actions={[
        { label: "Open PDF tools", href: "/pdf-tools" },
        { label: "Start with Compose", href: "/pdf/merge" },
      ]}
    >
      <InfoStructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: "https://lumeo.in/",
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Guides",
              item: "https://lumeo.in/guides",
            },
          ],
        }}
      />
      <InfoStructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Lumeo PDF Guides",
          url: "https://lumeo.in/guides",
          description:
            "Concise guidance for using Lumeo PDF Workspace tools.",
        }}
      />
      <InfoStructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: allFaqs.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.answer,
            },
          })),
        }}
      />

      <InfoPageSection title="Choosing the right tool">
        <p>
          Use Compose when separate documents need to become one file, one
          file needs selected pages or smaller ranges, or pages need
          reordering, rotating, or removing. Use Distill when a file is too
          large for sharing or uploading. Use Capture to turn photos or scans
          into a PDF, and Render to export PDF pages as images or pull
          selectable text out. Use Seal to sign or initial a document, and
          Convert to move between PDF and Office formats or turn HTML into a
          PDF.
        </p>
      </InfoPageSection>

      <InfoPageSection title="Current PDF tools">
        <ToolGuide
          title="Compose — Merge PDF"
          href="/pdf/merge"
          use="Combine multiple documents into one polished PDF."
          workflow="Add PDFs, arrange them, choose output style, merge, download."
          limitation="Very large or damaged PDFs may need a smaller batch."
        />
        <ToolGuide
          title="Compose — Split PDF"
          href="/pdf/split"
          use="Extract pages, remove pages, or create smaller PDFs from one file."
          workflow="Add one PDF, choose a split method, select pages or ranges, download."
          limitation="Password-protected or damaged PDFs may not open in the browser."
        />
        <ToolGuide
          title="Compose — Page Re-Order"
          href="/pdf/organize"
          use="Reorder, rotate, duplicate, or remove pages within one document."
          workflow="Add one PDF, drag pages to reorder, rotate or bulk-select, download."
          limitation="Password-protected or damaged PDFs may not open in the browser."
        />
        <ToolGuide
          title="Distill — Compress PDF"
          href="/pdf/compress"
          use="Reduce file size for sharing, forms, and upload limits."
          workflow="Add one PDF, choose a compression profile, compress, review the result."
          limitation="Compression rebuilds pages as images, so review the output before replacing the original."
        />
        <ToolGuide
          title="Capture — JPG to PDF"
          href="/pdf/jpg-to-pdf"
          use="Turn photos or scanned images into a clean PDF document."
          workflow="Add JPG or PNG images, arrange them, choose a page size, combine, download."
          limitation="Very large batches of high-resolution images may need a smaller batch."
        />
        <ToolGuide
          title="Render — PDF to JPG"
          href="/pdf/pdf-to-jpg"
          use="Export PDF pages as sharp image files."
          workflow="Add one PDF, choose the pages and quality, export, download."
          limitation="Scanned pages without selectable text export as images only."
        />
        <ToolGuide
          title="Render — Text Extract"
          href="/pdf/extract-text"
          use="Pull selectable text out of a PDF to read, search, or export it."
          workflow="Add one PDF, search or set a page range, choose TXT, JSON, or CSV, export."
          limitation="Scanned pages without an existing text layer have nothing to extract."
        />
        <ToolGuide
          title="Seal — Sign PDF"
          href="/pdf/sign"
          use="Draw or type a signature and place it on any page."
          workflow="Add one PDF, create a signature, drag and resize it into place, download."
          limitation="Legally binding e-signature workflows with audit trails are not provided."
        />
        <ToolGuide
          title="Convert — Word to PDF"
          href="/pdf/word-to-pdf"
          use="Convert Word documents to PDF using free, self-hosted LibreOffice."
          workflow="Upload a DOCX or DOC file, convert, download the PDF."
          limitation="Server-side conversion, so the file is uploaded temporarily and cleared right after."
        />
        <ToolGuide
          title="Convert — PDF to Word"
          href="/pdf/pdf-to-word"
          use="Convert PDF pages into an editable Word file."
          workflow="Upload one PDF, convert, download the DOCX."
          limitation="Complex layouts, tables, or scanned pages may not convert cleanly."
        />
        <ToolGuide
          title="Convert — HTML to PDF"
          href="/pdf/html-to-pdf"
          use="Turn HTML and CSS into a downloadable PDF."
          workflow="Paste or type HTML/CSS, preview live, set page size and margins, generate, download."
          limitation="Forced CSS page-break rules are not guaranteed to be honored."
        />
      </InfoPageSection>

      <InfoPageSection title="Browser-first privacy">
        <p>
          Lumeo PDF tools are designed to process supported files directly in
          your browser where possible. That keeps everyday document work simple,
          fast, and private without unnecessary sign-in.
        </p>
      </InfoPageSection>

      <FaqGroup title="Compose — Merge PDF questions" items={mergeFaqs} />
      <FaqGroup title="Compose — Split PDF questions" items={splitFaqs} />
      <FaqGroup title="Compose — Page Re-Order questions" items={organizeFaqs} />
      <FaqGroup title="Distill — Compress PDF questions" items={compressFaqs} />
      <FaqGroup title="Capture — JPG to PDF questions" items={jpgToPdfFaqs} />
      <FaqGroup title="Render — PDF to JPG questions" items={pdfToJpgFaqs} />
      <FaqGroup title="Render — Text Extract questions" items={extractTextFaqs} />
      <FaqGroup title="Seal — Sign PDF questions" items={signFaqs} />
      <FaqGroup title="Convert — Word to PDF questions" items={wordToPdfFaqs} />
      <FaqGroup title="Convert — PDF to Word questions" items={pdfToWordFaqs} />
      <FaqGroup title="Convert — HTML to PDF questions" items={htmlToPdfFaqs} />
      <FaqGroup title="Privacy questions" items={privacyFaqs} />
    </InfoPageShell>
  );
}
