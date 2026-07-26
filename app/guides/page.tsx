import type { Metadata } from "next";
import Link from "next/link";
import {
  InfoPageSection,
  InfoPageShell,
  InfoStructuredData,
} from "@/components/InfoPage";
import { mergeFaqs, splitFaqs } from "@/components/pdf/PdfSeoContent";
import { withSeoOverride } from "@/lib/public-site/seo";

const compressFaqs = [
  {
    question: "Are my PDF files uploaded?",
    answer:
      "No. Supported compression processing takes place directly in your browser for this tool.",
  },
  {
    question: "Can every PDF be compressed significantly?",
    answer:
      "No. Results depend on the document. Text-only or already optimised PDFs may have limited savings.",
  },
  {
    question: "Will compression reduce quality?",
    answer:
      "Compression can reduce page rendering detail. Review the downloaded result before replacing the original.",
  },
  {
    question: "What happens if the compressed file is larger?",
    answer:
      "Lumeo compares the actual result with the original and recommends keeping the original when compression does not provide a useful reduction.",
  },
];

const privacyFaqs = [
  {
    question: "What does browser-first mean?",
    answer:
      "Browser-first means supported PDF work happens on your device in the browser instead of requiring a server upload.",
  },
  {
    question: "Do I need an account for PDF tools?",
    answer:
      "No. The public PDF workspaces are designed for simple document tasks without unnecessary sign-in.",
  },
];

const organizeFaqs = [
  {
    question: "What's the difference between Split and Page Re-Order?",
    answer:
      "Split produces separate files from one PDF. Page Re-Order changes the order, rotation, or count of pages inside a single PDF and gives back one file.",
  },
  {
    question: "Can I undo a reorder or delete before exporting?",
    answer:
      "Yes. Changes only apply to the working copy in your browser tab — reload the page to start over before you download.",
  },
  {
    question: "Does duplicating a page keep its rotation?",
    answer:
      "Yes. A duplicated page carries over any rotation already applied to the original.",
  },
];

const extractTextFaqs = [
  {
    question: "Does Text Extract work on scanned PDFs?",
    answer:
      "Only if the PDF already has selectable text. Scanned pages without an OCR layer have no extractable text — a searchable-scan tool is planned separately.",
  },
  {
    question: "Which export formats are supported?",
    answer:
      "TXT, JSON, and CSV — one page range or the full document, with per-page or copy-all options in the workspace itself.",
  },
  {
    question: "Can I extract only some pages?",
    answer:
      "Yes. Enter a page range (e.g. 1-3,5) and only those pages are pulled into the preview and export.",
  },
];

const htmlToPdfFaqs = [
  {
    question: "Can I paste a full HTML document?",
    answer:
      "Yes. Paste a complete document or a fragment — styles are applied either way, and the result is sanitized before rendering.",
  },
  {
    question: "Does it support CSS page breaks?",
    answer:
      "Page size, orientation, and margins are configurable, but forced CSS page-break rules are not guaranteed to be honored by the current renderer.",
  },
  {
    question: "Is my pasted HTML uploaded anywhere?",
    answer:
      "No. It's rendered and converted to PDF entirely in your browser.",
  },
];

const signFaqs = [
  {
    question: "Is my signature stored anywhere?",
    answer:
      "No. Signatures are drawn or typed in your browser and applied directly to the downloaded file.",
  },
  {
    question: "Can I resize or reposition a signature after placing it?",
    answer:
      "Yes, before you finish — drag to reposition and use the resize handles to scale it on the page.",
  },
];

const convertFaqs = [
  {
    question: "Are Word/PDF conversions private?",
    answer:
      "Office format conversion needs a server-side engine (free, self-hosted LibreOffice), so the file is uploaded temporarily and cleared immediately after conversion — it is not stored.",
  },
  {
    question: "Does Word to PDF preserve formatting?",
    answer:
      "Layout, fonts, tables, and images are preserved for standard DOCX/DOC documents. Highly complex layouts may shift slightly.",
  },
];

const allFaqs = [
  ...mergeFaqs,
  ...splitFaqs,
  ...compressFaqs,
  ...organizeFaqs,
  ...extractTextFaqs,
  ...htmlToPdfFaqs,
  ...signFaqs,
  ...convertFaqs,
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
      <FaqGroup title="Render — Text Extract questions" items={extractTextFaqs} />
      <FaqGroup title="Seal — Sign PDF questions" items={signFaqs} />
      <FaqGroup title="Convert — Word/PDF questions" items={convertFaqs} />
      <FaqGroup title="Convert — HTML to PDF questions" items={htmlToPdfFaqs} />
      <FaqGroup title="Privacy questions" items={privacyFaqs} />
    </InfoPageShell>
  );
}
