import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import { PublicNav } from "@/components/PublicPdfChrome";

export const metadata: Metadata = {
  title: "Lumeo Privacy Policy",
  description:
    "Privacy Policy for Lumeo PDF Workspace, a simple, privacy-first PDF workspace for everyday documents.",
  alternates: {
    canonical: "https://lumeo.in/privacy",
  },
  openGraph: {
    title: "Lumeo Privacy Policy",
    description:
      "Privacy Policy for Lumeo PDF Workspace, a simple, privacy-first PDF workspace for everyday documents.",
    url: "https://lumeo.in/privacy",
    siteName: "Lumeo",
    type: "website",
  },
};

const sections = [
  {
    title: "Information we collect",
    body: "Lumeo may collect basic information needed to operate the site, such as browser session data, usage diagnostics, and information you choose to provide when using future account-based features.",
  },
  {
    title: "How we use information",
    body: "We use information to provide, maintain, secure, and improve Lumeo PDF Workspace. We do not sell your personal information.",
  },
  {
    title: "Document files",
    body: "Lumeo is being designed so most PDF tools can run in your browser where possible. If server processing is required later, files should be temporary and handled with clear deletion rules.",
  },
  {
    title: "Cookies and session data",
    body: "Lumeo may use cookies or similar browser storage for essential site behavior, security, session management, and product reliability.",
  },
  {
    title: "Security",
    body: "We take reasonable steps to protect data. No online service can guarantee absolute security, so you should keep backup copies of important files.",
  },
  {
    title: "Changes to this policy",
    body: "This Privacy Policy may be updated as Lumeo develops. Any changes will be reflected on this page with an updated date.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0C1220] text-[#F0EAD6]">
      <PublicNav maxWidth="max-w-[900px]" />

      <section className="mx-auto max-w-[900px] px-5 py-16 sm:px-8">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[#C9A84C]">
          Privacy
        </p>

        <h1 className="font-serif text-4xl tracking-[-0.02em] sm:text-6xl">
          Privacy Policy
        </h1>

        <p className="mt-4 text-sm text-[#F0EAD6]/40">
          Last updated: July 2026
        </p>

        <div className="mt-10 space-y-4">
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
