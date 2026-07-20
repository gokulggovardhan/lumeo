import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import { PublicNav } from "@/components/PublicPdfChrome";
import {
  InfoDefinitionList,
  InfoList,
  InfoPageSection,
  InfoCallout,
  InfoStructuredData,
} from "@/components/InfoPage";
import { ContactForm } from "@/components/ContactForm";
import { withSeoOverride } from "@/lib/public-site/seo";

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/contact", {
    title: "Contact Lumeo PDF Workspace",
    description:
      "Contact Lumeo PDF Workspace about product feedback, accessibility, privacy, or security concerns.",
    alternates: {
      canonical: "https://lumeo.in/contact",
    },
    openGraph: {
      title: "Contact Lumeo PDF Workspace",
      description:
        "Contact guidance for product feedback, privacy questions, accessibility concerns, and security reports.",
      url: "https://lumeo.in/contact",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Contact Lumeo PDF Workspace",
      description: "Contact guidance for Lumeo PDF Workspace.",
    },
  });
}

const contactSchema = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact Lumeo PDF Workspace",
  url: "https://lumeo.in/contact",
  description:
    "Contact guidance for Lumeo PDF Workspace product, privacy, accessibility, and security topics.",
};

export default function ContactPage() {
  return (
    <>
      <InfoStructuredData data={contactSchema} />
      <main id="main-content" className="aura-info-page flex min-h-dvh flex-col bg-[var(--surface-canvas)] text-[var(--text-primary)]">
        <PublicNav />

        {/* Sized to land fully in view on open -- no scroll needed to reach
            or use the form itself. Everything below it is reference
            material for people who want it, not required to send a message. */}
        <section className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center px-5 py-5 sm:px-8">
          <div className="mb-4">
            <p className="aura-text-label text-[var(--lumeo-gold-300)]">Contact</p>
            <h1 className="mt-1.5 font-serif font-semibold text-[length:var(--text-heading-md)] leading-tight text-[color:var(--lumeo-paper-50)]">
              Send us a message
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-[var(--text-secondary)]">
              Feedback, privacy questions, accessibility concerns, or security reports — all welcome.
            </p>
          </div>
          <ContactForm />
        </section>

        {/* Collapsed by default -- the message form is the whole page on
            open, professional and uncluttered. Reference material is one
            deliberate click away, not a peek at the bottom of the viewport. */}
        <details className="group mx-auto w-full max-w-[820px] px-5 pb-10 sm:px-8">
          <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-2 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)] transition hover:border-[var(--border-premium)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.18)] [&::-webkit-details-marker]:hidden">
            More contact guidance
            <span aria-hidden="true" className="transition-transform duration-200 group-open:rotate-180">↓</span>
          </summary>

          <article className="mt-8 space-y-9">
        <InfoPageSection title="Contact categories">
          <InfoDefinitionList
            items={[
              {
                term: "Product feedback",
                description:
                  "Ideas for making PDF workflows clearer, calmer, or more useful.",
              },
              {
                term: "Bug report",
                description:
                  "A reproducible issue in a public PDF tool or information page.",
              },
              {
                term: "Privacy question",
                description:
                  "Questions about browser-first processing, local preferences, or future data flows.",
              },
              {
                term: "Accessibility feedback",
                description:
                  "Barriers involving keyboard, screen reader, magnification, touch, or reduced-motion use.",
              },
              {
                term: "Security concern",
                description:
                  "A responsible report about a potential vulnerability or unsafe behaviour.",
              },
              {
                term: "General enquiry",
                description:
                  "Questions about Lumeo PDF Workspace that do not fit another category.",
              },
            ]}
          />
        </InfoPageSection>

        <InfoPageSection title="Bug-report guidance">
          <p>Helpful reports include:</p>
          <InfoList
            items={[
              "Browser and version.",
              "Device type.",
              "Tool used.",
              "Steps to reproduce.",
              "Error message, if shown.",
              "Whether the file was scanned, encrypted, unusually large, or damaged.",
            ]}
          />
          <InfoCallout>
            Do not send confidential PDF files unless specifically requested
            through an approved secure channel.
          </InfoCallout>
        </InfoPageSection>

        <InfoPageSection title="Security reports">
          <p>Responsible security reports should include:</p>
          <InfoList
            items={[
              "Affected page or tool.",
              "Clear reproduction steps.",
              "Potential impact.",
              "Non-destructive proof.",
              "Contact details for follow-up, using the form above.",
            ]}
          />
          <p>
            Lumeo does not currently advertise a bug bounty or fixed reward
            program.
          </p>
        </InfoPageSection>

        <InfoPageSection title="Response expectations">
          <p>
            Messages are reviewed as capacity allows. Urgent security and
            privacy reports receive priority where possible. A fixed support SLA
            is not currently published.
          </p>
        </InfoPageSection>
          </article>
        </details>

        <PublicFooter />
      </main>
    </>
  );
}
