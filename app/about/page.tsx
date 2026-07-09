import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import { PublicNav } from "@/components/PublicPdfChrome";

export const metadata: Metadata = {
  title: "About Lumeo PDF Workspace",
  description:
    "Learn about Lumeo PDF Workspace, a simple, private PDF workspace for everyday documents.",
  alternates: {
    canonical: "https://lumeo.in/about",
  },
  openGraph: {
    title: "About Lumeo PDF Workspace",
    description:
      "Learn about Lumeo PDF Workspace, a simple, private PDF workspace for everyday documents.",
    url: "https://lumeo.in/about",
    siteName: "Lumeo",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#0C1220] text-[#F0EAD6]">
      <PublicNav />

      <section className="mx-auto max-w-[1360px] px-5 py-16 sm:px-8">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[#C9A84C]">
          About
        </p>

        <h1 className="max-w-3xl font-serif text-4xl leading-tight tracking-[-0.02em] sm:text-6xl">
          Lumeo is a careful PDF workspace for everyday documents.
        </h1>

        <div className="mt-10 max-w-4xl space-y-7 text-base leading-8 text-[#F0EAD6]/58">
          <p>
            Lumeo PDF Workspace is being built for people who need simple,
            private tools to prepare common documents without a cluttered
            interface.
          </p>

          <p>
            The product focuses on practical PDF tasks such as merging,
            splitting, compressing, and converting files for forms, resumes,
            statements, invoices, and office documents.
          </p>

          <p>
            Lumeo is designed around clarity and control. Most tools are
            intended to run in the browser where possible, and any future server
            processing should use clear temporary file handling rules.
          </p>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {[
            {
              title: "Simple",
              description: "Focused document tasks without unnecessary clutter.",
            },
            {
              title: "Private",
              description:
                "Built around browser-first workflows where possible.",
            },
            {
              title: "Practical",
              description:
                "Made for everyday PDFs people actually need to prepare.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-[#E8DFC8]/14 bg-[#1A2840] p-5"
            >
              <h2 className="text-base font-bold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/48">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
