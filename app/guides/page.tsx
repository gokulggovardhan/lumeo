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

const allFaqs = [
  ...mergeFaqs,
  ...splitFaqs,
  ...compressFaqs,
  ...privacyFaqs,
];

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/guides", {
    title: {
      absolute: "Lumeo PDF Guides",
    },
    description:
      "Concise guides for Compose, Distill, Capture, and Render — Lumeo's browser-first PDF tools — plus how to choose the right one.",
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
          Use Compose when separate documents need to become one file, or one
          file needs selected pages, smaller ranges, or page cleanup — it
          bundles merge, split, and related organizing actions in one place.
          Use Distill when a file is too large for sharing or uploading. Use
          Capture to turn photos or scans into a PDF, and Render to export PDF
          pages as images or pull the text out.
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
          use="Export PDF pages as image files, or pull the page content out."
          workflow="Add one PDF, choose the pages and quality, export, download."
          limitation="Scanned pages without selectable text export as images only."
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
      <FaqGroup title="Distill — Compress PDF questions" items={compressFaqs} />
      <FaqGroup title="Privacy questions" items={privacyFaqs} />
    </InfoPageShell>
  );
}
