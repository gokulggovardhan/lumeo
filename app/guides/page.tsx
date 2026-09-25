import type { Metadata } from "next";
import Link from "next/link";
import {
  InfoPageSection,
  InfoPageShell,
  InfoStructuredData,
} from "@/components/InfoPage";
import {
  compressFaqs,
  editPdfFaqs,
  watermarkFaqs,
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
  ...editPdfFaqs,
  ...watermarkFaqs,
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
      "Concise guides for Lumeo's live PDF and document tools, organized by the task you need to complete.",
    alternates: {
      canonical: "/guides",
    },
    openGraph: {
      title: "Lumeo PDF Guides",
      description:
        "A practical handbook for Lumeo's browser-first PDF and document tools.",
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
    <div className="rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-[rgba(var(--lumeo-paper-rgb),0.04)] p-5 shadow-[inset_0_1px_0_rgba(255,253,247,0.05)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-serif text-xl font-semibold text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            {use}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Workflow: {workflow}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Limitation: {limitation}
          </p>
        </div>
        <Link
          href={href}
          className="shrink-0 rounded-full border border-[var(--border-hairline)] bg-[rgba(var(--lumeo-paper-rgb),0.055)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-selected)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.2)]"
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
      <h3 className="font-serif text-2xl font-semibold text-[var(--text-primary)]">
        {title}
      </h3>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <details
            key={item.question}
            className="group rounded-[var(--radius-xl)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-4 shadow-[inset_0_1px_0_rgba(255,253,247,0.06)]"
          >
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
      description="Choose a task, understand the workflow, and know the important limitation before you begin."
      actions={[
        { label: "Open PDF tools", href: "/pdf-tools" },
        { label: "Start with Merge PDF", href: "/pdf/merge" },
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
            "Concise guidance for the live Lumeo PDF and document tool set.",
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
          Use Organize for page and document structure, Edit for visible page
          changes, Convert when the file format needs to change, Sign & Fill for
          signatures, Optimize when file size is the problem, Recognize for
          selectable text, and Image Tools for utilities such as HEIC to JPEG.
        </p>
      </InfoPageSection>

      <InfoPageSection title="Organize">
        <ToolGuide
          title="Merge PDF"
          href="/pdf/merge"
          use="Combine multiple documents into one polished PDF."
          workflow="Add PDFs, arrange them, choose output style, merge, download."
          limitation="Very large or damaged PDFs may need a smaller batch."
        />
        <ToolGuide
          title="Split PDF"
          href="/pdf/split"
          use="Extract pages, remove pages, or create smaller PDFs from one file."
          workflow="Add one PDF, choose a split method, select pages or ranges, download."
          limitation="Password-protected or damaged PDFs may not open in the browser."
        />
        <ToolGuide
          title="Organize PDF"
          href="/pdf/organize"
          use="Reorder, rotate, duplicate, or remove pages within one document."
          workflow="Add one PDF, arrange pages, apply page actions, export."
          limitation="Password-protected or damaged PDFs may not open in the browser."
        />
      </InfoPageSection>

      <InfoPageSection title="Edit">
        <ToolGuide
          title="Edit PDF"
          href="/pdf/edit"
          use="Add text, freehand drawing, shapes, and whiteout boxes to a PDF."
          workflow="Add one PDF, choose an editing tool, place or adjust elements, export."
          limitation="Whiteout is visual-only and does not permanently remove underlying content."
        />
        <ToolGuide
          title="Crop PDF"
          href="/pdf/crop"
          use="Change the visible page area with a precise crop rectangle."
          workflow="Add one PDF, set the crop area and page scope, apply, download."
          limitation="Cropping changes page bounds; content outside the crop is not a permanent redaction."
        />
        <ToolGuide
          title="Watermark PDF"
          href="/pdf/watermark"
          use="Apply a text or image watermark across selected PDF pages."
          workflow="Add one PDF, choose watermark type, placement, opacity, and page range, export."
          limitation="JPG images have no transparency channel; use PNG for transparent image watermarks."
        />
        <ToolGuide
          title="Page Numbers"
          href="/pdf/page-numbers"
          use="Add page numbers with controlled style, position, and range."
          workflow="Add one PDF, choose numbering and placement, preview, export."
          limitation="Review pages that already contain footer content so the added numbers do not overlap it."
        />
        <ToolGuide
          title="Header & Footer"
          href="/pdf/header-footer"
          use="Add running header or footer text across selected pages."
          workflow="Add one PDF, enter content, choose position and range, preview, export."
          limitation="Added content overlays the existing page, so documents with tight margins need a visual review."
        />
      </InfoPageSection>

      <InfoPageSection title="Convert">
        <ToolGuide
          title="Word to PDF"
          href="/pdf/word-to-pdf"
          use="Convert Word documents to PDF locally in a supported browser."
          workflow="Choose a DOCX or DOC file, pass the compatibility check, convert, download."
          limitation="Complex Word layouts can still have small rendering differences after conversion."
        />
        <ToolGuide
          title="PDF to Word"
          href="/pdf/pdf-to-word"
          use="Reconstruct PDF documents into editable Word files locally."
          workflow="Choose one PDF, reconstruct it in the browser, download the DOCX."
          limitation="PDFs do not contain Word document structure, so complex layouts are reconstructed as closely as possible."
        />
        <ToolGuide
          title="JPG to PDF"
          href="/pdf/jpg-to-pdf"
          use="Turn JPG, PNG, or WebP images into one PDF document."
          workflow="Add images, arrange them, choose page settings, combine, download."
          limitation="Very large batches of high-resolution images may need a smaller batch."
        />
        <ToolGuide
          title="PDF to JPG"
          href="/pdf/pdf-to-jpg"
          use="Export PDF pages as JPG, PNG, or WebP images."
          workflow="Add one PDF, choose pages, format, quality, and DPI, export."
          limitation="Image export does not create editable document text."
        />
        <ToolGuide
          title="HTML to PDF"
          href="/pdf/html-to-pdf"
          use="Turn HTML and CSS into a downloadable PDF."
          workflow="Paste or type HTML/CSS, preview, set page options, generate, download."
          limitation="Forced CSS page-break rules are not guaranteed to be honored by the current renderer."
        />
      </InfoPageSection>

      <InfoPageSection title="Sign & Fill">
        <ToolGuide
          title="Sign PDF"
          href="/pdf/sign"
          use="Draw or type a signature and place it on any PDF page."
          workflow="Add one PDF, create a signature or initials, position it, export."
          limitation="Legally binding e-signature workflows with audit trails are not provided."
        />
      </InfoPageSection>

      <InfoPageSection title="Optimize">
        <ToolGuide
          title="Compress PDF"
          href="/pdf/compress"
          use="Reduce file size for sharing, forms, and upload limits."
          workflow="Add one PDF, choose a compression profile or target, compress, review."
          limitation="Compression can reduce page rendering detail, so review the result before replacing the original."
        />
      </InfoPageSection>

      <InfoPageSection title="Recognize">
        <ToolGuide
          title="Extract Text"
          href="/pdf/extract-text"
          use="Read, search, and export selectable text already present in a PDF."
          workflow="Add one PDF, search or choose a page range, export as TXT, JSON, or CSV."
          limitation="Scanned pages without an existing OCR text layer have no selectable text to extract."
        />
      </InfoPageSection>

      <InfoPageSection title="Image Tools">
        <ToolGuide
          title="HEIC to JPEG"
          href="/heic-to-jpeg"
          use="Convert iPhone HEIC or HEIF photos to high-quality JPEG files."
          workflow="Add HEIC photos, convert them in the browser, download the JPEG results."
          limitation="Large high-resolution batches can use significant browser memory and may work better in smaller groups."
        />
      </InfoPageSection>

      <InfoPageSection title="Browser-first privacy">
        <p>
          Current public Lumeo document tools are designed to process supported
          files directly in the browser. Tool pages explain their handling and
          any browser capability requirements before the main action becomes
          available.
        </p>
      </InfoPageSection>

      <FaqGroup title="Merge PDF questions" items={mergeFaqs} />
      <FaqGroup title="Split PDF questions" items={splitFaqs} />
      <FaqGroup title="Organize PDF questions" items={organizeFaqs} />
      <FaqGroup title="Compress PDF questions" items={compressFaqs} />
      <FaqGroup title="JPG to PDF questions" items={jpgToPdfFaqs} />
      <FaqGroup title="PDF to JPG questions" items={pdfToJpgFaqs} />
      <FaqGroup title="Extract Text questions" items={extractTextFaqs} />
      <FaqGroup title="Sign PDF questions" items={signFaqs} />
      <FaqGroup title="Word to PDF questions" items={wordToPdfFaqs} />
      <FaqGroup title="PDF to Word questions" items={pdfToWordFaqs} />
      <FaqGroup title="HTML to PDF questions" items={htmlToPdfFaqs} />
      <FaqGroup title="Edit PDF questions" items={editPdfFaqs} />
      <FaqGroup title="Watermark PDF questions" items={watermarkFaqs} />
      <FaqGroup title="Privacy questions" items={privacyFaqs} />
    </InfoPageShell>
  );
}
