import Link from "next/link";

type FaqItem = {
  question: string;
  answer: string;
};

type BenefitItem = {
  title: string;
  description: string;
};

type RelatedLink = {
  href: string;
  label: string;
};

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

function Breadcrumbs({
  current,
  currentUrl,
}: {
  current: string;
  currentUrl: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-[#F0EAD6]/44">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link className="transition hover:text-[#F0EAD6]" href="/">
            Home
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link className="transition hover:text-[#F0EAD6]" href="/pdf">
            PDF Tools
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="text-[#C9A84C]">
          {current}
        </li>
      </ol>
      <JsonLd
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
              name: "PDF Tools",
              item: "https://lumeo.in/pdf",
            },
            {
              "@type": "ListItem",
              position: 3,
              name: current,
              item: currentUrl,
            },
          ],
        }}
      />
    </nav>
  );
}

function ToolFaq({
  title,
  items,
}: {
  title: string;
  items: FaqItem[];
}) {
  const faqId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-faq`;

  return (
    <section aria-labelledby={faqId} className="mx-auto mt-10 max-w-4xl">
      <h2
        id={faqId}
        className="font-serif text-2xl tracking-[-0.02em] text-[#F0EAD6] sm:text-3xl"
      >
        Questions about {title}
      </h2>
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
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#F0EAD6]/55">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.answer,
            },
          })),
        }}
      />
    </section>
  );
}

export function ToolSeoSection({
  toolName,
  toolUrl,
  appName,
  appDescription,
  heading,
  copy,
  benefits,
  steps,
  faqs,
  relatedLinks,
}: {
  toolName: string;
  toolUrl: string;
  appName: string;
  appDescription: string;
  heading: string;
  copy: string;
  benefits: BenefitItem[];
  steps: string[];
  faqs: FaqItem[];
  relatedLinks: RelatedLink[];
}) {
  return (
    <section className="bg-[#0C1220] px-5 pb-14 pt-14 text-[#F0EAD6] sm:px-8 lg:pt-24">
      <div className="mx-auto max-w-[1180px]">
        <Breadcrumbs current={toolName} currentUrl={toolUrl} />
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_0.62fr]">
          <section aria-labelledby={`${toolName}-seo-heading`}>
            <h2
              id={`${toolName}-seo-heading`}
              className="max-w-3xl font-serif text-3xl leading-tight tracking-[-0.02em] sm:text-4xl"
            >
              {heading}
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[#F0EAD6]/56">
              {copy}
            </p>
            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              {benefits.map((benefit) => (
                <article
                  key={benefit.title}
                  className="border-t border-[#E8DFC8]/12 pt-4"
                >
                  <h3 className="text-sm font-bold text-[#F0EAD6]">
                    {benefit.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/48">
                    {benefit.description}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <aside className="border-l border-[#E8DFC8]/12 pl-0 lg:pl-6">
            <h2 className="text-sm font-bold text-[#F0EAD6]">
              How it works
            </h2>
            <ol className="mt-4 space-y-3">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm text-[#F0EAD6]/60">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#C9A84C]/20 text-xs font-bold text-[#C9A84C]">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <h2 className="mt-7 text-sm font-bold text-[#F0EAD6]">
              Related tools
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {relatedLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full border border-[#E8DFC8]/12 px-3 py-2 text-xs font-semibold text-[#F0EAD6]/62 transition hover:border-[#C9A84C]/34 hover:text-[#F0EAD6]"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </aside>
        </div>
        <ToolFaq title={toolName} items={faqs} />
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: appName,
          url: toolUrl,
          description: appDescription,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any modern browser",
        }}
      />
    </section>
  );
}

export function PdfHubSeoContent() {
  return (
    <section className="bg-[#0C1220] px-5 pb-14 pt-14 text-[#F0EAD6] sm:px-8 lg:pt-20">
      <div className="mx-auto max-w-[1180px]">
        <section aria-labelledby="pdf-workspace-directory">
          <h2
            id="pdf-workspace-directory"
            className="max-w-3xl font-serif text-3xl leading-tight tracking-[-0.02em] sm:text-4xl"
          >
            A calm directory for everyday PDF work
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#F0EAD6]/56">
            Lumeo PDF Workspace brings private document tools into one focused
            place. Start with live browser-first merge, split, and compress
            tools, then move between planned conversion workspaces as they become active.
          </p>
        </section>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Merge PDF", "/pdf/merge"],
            ["Split PDF", "/pdf/split"],
            ["Compress PDF", "/pdf/compress"],
            ["JPG to PDF", "/pdf/jpg-to-pdf"],
            ["PDF to JPG", "/pdf/pdf-to-jpg"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-2xl border border-[#E8DFC8]/10 bg-[#0A101C]/72 p-4 text-sm font-semibold text-[#F0EAD6]/72 transition hover:-translate-y-0.5 hover:border-[#C9A84C]/32 hover:text-[#F0EAD6]"
            >
              {label}
            </Link>
          ))}
        </div>

        <section
          aria-labelledby="browser-first-privacy"
          className="mt-8 rounded-2xl border border-[#C9A84C]/18 bg-[#0A101C]/72 p-5"
        >
          <h2
            id="browser-first-privacy"
            className="text-xs font-bold uppercase tracking-[0.18em] text-[#C9A84C]"
          >
            Browser-first privacy
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[#F0EAD6]/55">
            Lumeo uses browser-first processing where supported, so active PDF
            workflows can keep files on your device. Future tools will keep the
            same principle: clear states, honest functionality, and no fake
            processing.
          </p>
        </section>
      </div>
    </section>
  );
}

export const mergeFaqs: FaqItem[] = [
  {
    question: "Are my PDF files uploaded to a server?",
    answer:
      "No. Lumeo Merge PDF uses browser-first processing for supported files, so your documents stay on your device during the merge workflow.",
  },
  {
    question: "Can I change the PDF order before merging?",
    answer:
      "Yes. You can drag and rearrange documents in the workspace before creating the merged PDF.",
  },
  {
    question: "Can Lumeo preserve the original PDF page sizes?",
    answer:
      "Yes. Merge PDF includes output options for keeping original page sizes, matching the first PDF, or using smart A4 sizing.",
  },
  {
    question: "What happens to my files after download?",
    answer:
      "Lumeo can clear the active workspace after download, and you can also manually start a new merge to remove the current files from the session.",
  },
];

export const splitFaqs: FaqItem[] = [
  {
    question: "Are my PDF files uploaded?",
    answer:
      "No. Supported Split PDF processing takes place directly in your browser, keeping the document on your device.",
  },
  {
    question: "Can I extract only selected pages?",
    answer:
      "Yes. Use Extract pages to create a new PDF containing only the pages you select.",
  },
  {
    question: "Can I remove pages from a PDF?",
    answer:
      "Yes. The Remove pages method creates a new PDF without the selected pages.",
  },
  {
    question: "Can I split a PDF into multiple files?",
    answer:
      "Yes. You can split by ranges, create one PDF per page, or create equal document chunks using Every N pages.",
  },
  {
    question: "Does Split PDF support range shortcuts?",
    answer:
      "Yes. Supported range inputs include values such as 1-3, 1-3,5, end, all, odd, and even.",
  },
];
