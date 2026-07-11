import type { Metadata } from "next";
import {
  InfoCallout,
  InfoDefinitionList,
  InfoList,
  InfoPageSection,
  InfoPageShell,
  InfoStructuredData,
} from "@/components/InfoPage";

export const metadata: Metadata = {
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
    images: ["/og-image.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Lumeo PDF Workspace",
    description: "Contact guidance for Lumeo PDF Workspace.",
    images: ["/og-image.svg"],
  },
};

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
      <InfoPageShell
        eyebrow="Contact"
        title="Let's improve document work together"
        description="Use the guidance below for product feedback, privacy questions, accessibility concerns, or responsible security reports."
      >
        <InfoCallout>
          A public contact mailbox has not been verified in the repository, so
          this page does not publish an email address yet. Do not send
          confidential PDF files through informal channels.
        </InfoCallout>

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
              "Contact details for follow-up when a verified mailbox is available.",
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
      </InfoPageShell>
    </>
  );
}
