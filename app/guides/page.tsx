import type { Metadata } from "next";
import Link from "next/link";
import {
  InfoPageSection,
  InfoPageShell,
  InfoStructuredData,
} from "@/components/InfoPage";
import { mergeFaqs, splitFaqs } from "@/components/pdf/PdfSeoContent";

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

export const metadata: Metadata = {
  title: {
    absolute: "Lumeo PDF Guides",
  },
  description:
    "Concise guides for Merge PDF, Split PDF, Compress PDF, browser-first privacy, and choosing the right Lumeo PDF tool.",
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
};

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
    <div className="border-t border-[#E8DFC8]/12 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-serif text-2xl text-[#F0EAD6]">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/58">{use}</p>
          <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/50">
            Workflow: {workflow}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/44">
            Limitation: {limitation}
          </p>
        </div>
        <Link
          href={href}
          className="shrink-0 rounded-full border border-[#E8DFC8]/14 px-4 py-2 text-sm font-semibold text-[#F0EAD6]/68 transition hover:border-[#C9A84C]/34 hover:text-[#F0EAD6]"
        >
          Open tool
        </Link>
      </div>
    </div>
  );
}

function FaqGroup({ title, items }: { title: string; items: typeof allFaqs }) {
  return (
    <section className="border-t border-[#E8DFC8]/12 pt-6">
      <h3 className="font-serif text-2xl text-[#F0EAD6]">{title}</h3>
      <div className="mt-4 divide-y divide-[#E8DFC8]/10 border-y border-[#E8DFC8]/12">
        {items.map((item) => (
          <details key={item.question} className="group py-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-[#F0EAD6] marker:hidden">
              <span className="flex items-center justify-between gap-4">
                {item.question}
                <span className="text-[#C9A84C] transition group-open:rotate-45">
                  +
                </span>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-6 text-[#F0EAD6]/55">
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
        { label: "Open PDF tools", href: "/pdf" },
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
          Use Merge PDF when separate documents need to become one file. Use
          Split PDF when one file needs selected pages, smaller ranges, or page
          cleanup. Use Compress PDF when a file is too large for sharing or
          uploading.
        </p>
      </InfoPageSection>

      <InfoPageSection title="Current PDF tools">
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
          title="Compress PDF"
          href="/pdf/compress"
          use="Reduce file size for sharing, forms, and upload limits."
          workflow="Add one PDF, choose a compression profile, compress, review the result."
          limitation="Compression rebuilds pages as images, so review the output before replacing the original."
        />
      </InfoPageSection>

      <InfoPageSection title="Browser-first privacy">
        <p>
          Lumeo PDF tools are designed to process supported files directly in
          your browser where possible. That keeps everyday document work simple,
          fast, and private without unnecessary sign-in.
        </p>
      </InfoPageSection>

      <FaqGroup title="Merge PDF questions" items={mergeFaqs} />
      <FaqGroup title="Split PDF questions" items={splitFaqs} />
      <FaqGroup title="Compress PDF questions" items={compressFaqs} />
      <FaqGroup title="Privacy questions" items={privacyFaqs} />
    </InfoPageShell>
  );
}
