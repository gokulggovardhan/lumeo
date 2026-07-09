import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";

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
    <main className="min-h-screen bg-[#07070A] text-[#F7F0DE]">
      <nav className="border-b border-[#F3E7C8]/10 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F3E7C8] text-sm font-bold text-[#111018]">
              L
            </div>
            <span className="font-bold tracking-tight">
              Lumeo PDF Workspace
            </span>
          </Link>

          <Link
            href="/"
            className="rounded-full border border-[#F3E7C8]/10 px-4 py-2 text-sm font-semibold text-[#F7F0DE]/55 transition hover:border-[#F3E7C8]/30 hover:text-white"
          >
            Back home
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-6 py-20">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-[#D8C48E]">
          About
        </p>

        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Lumeo is a clean PDF workspace for everyday documents.
        </h1>

        <div className="mt-10 space-y-7 text-base leading-8 text-[#F7F0DE]/60">
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

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
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
              className="rounded-2xl border border-[#F3E7C8]/10 bg-white/[0.035] p-5"
            >
              <h2 className="text-base font-bold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#F7F0DE]/45">
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
