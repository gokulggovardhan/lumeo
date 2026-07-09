import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import { PublicNav } from "@/components/PublicPdfChrome";

export const metadata: Metadata = {
  title: "Lumeo Terms of Use",
  description:
    "Terms of Use for Lumeo PDF Workspace, a simple PDF workspace for everyday documents.",
  alternates: {
    canonical: "https://lumeo.in/terms",
  },
  openGraph: {
    title: "Lumeo Terms of Use",
    description:
      "Terms of Use for Lumeo PDF Workspace, a simple PDF workspace for everyday documents.",
    url: "https://lumeo.in/terms",
    siteName: "Lumeo",
    type: "website",
  },
};

const sections = [
  {
    title: "Use of Lumeo",
    body: "Lumeo PDF Workspace provides simple document tools and public information pages. By using Lumeo, you agree to use the site responsibly and lawfully.",
  },
  {
    title: "Your files",
    body: "You are responsible for the files you choose to use with Lumeo and for making sure you have the rights needed to process, convert, or share those files.",
  },
  {
    title: "Acceptable use",
    body: "You may not use Lumeo for unlawful, harmful, infringing, abusive, or misleading activity, or attempt to interfere with the site or access data that does not belong to you.",
  },
  {
    title: "Service availability",
    body: "Lumeo may change as the product develops. We aim to provide a reliable experience, but we do not guarantee uninterrupted access, error-free operation, or permanent availability of any specific feature.",
  },
  {
    title: "Changes to these terms",
    body: "These Terms of Use may be updated as Lumeo develops. Continued use of the site after updates means you accept the revised terms.",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0C1220] text-[#F0EAD6]">
      <PublicNav />

      <section className="mx-auto max-w-[1360px] px-5 py-16 sm:px-8">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[#C9A84C]">
          Terms
        </p>

        <h1 className="font-serif text-4xl tracking-[-0.02em] sm:text-6xl">
          Terms of Use
        </h1>

        <p className="mt-4 text-sm text-[#F0EAD6]/40">
          Last updated: July 2026
        </p>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-xl border border-[#E8DFC8]/14 bg-[#1A2840] p-6"
            >
              <h2 className="font-serif text-2xl text-[#F0EAD6]">
                {section.title}
              </h2>
              <p className="mt-3 text-base leading-8 text-[#F0EAD6]/58">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
