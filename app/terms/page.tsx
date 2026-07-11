import type { Metadata } from "next";
import {
  InfoCallout,
  InfoInlineLinks,
  InfoList,
  InfoPageSection,
  InfoPageShell,
  InfoStructuredData,
} from "@/components/InfoPage";

const lastUpdated = "July 11, 2026";

export const metadata: Metadata = {
  title: "Terms of Use - Lumeo PDF Workspace",
  description:
    "Review the terms governing access to and use of Lumeo PDF Workspace and its browser-first PDF tools.",
  alternates: {
    canonical: "https://lumeo.in/terms",
  },
  openGraph: {
    title: "Terms of Use - Lumeo PDF Workspace",
    description:
      "Plain-language terms for using Lumeo PDF Workspace and its browser-first PDF tools.",
    url: "https://lumeo.in/terms",
    siteName: "Lumeo PDF",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms of Use - Lumeo PDF Workspace",
    description: "Terms for accessing and using Lumeo PDF Workspace.",
  },
};

const termsSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Terms of Use - Lumeo PDF Workspace",
  url: "https://lumeo.in/terms",
  description: "Terms governing use of Lumeo PDF Workspace.",
};

export default function TermsPage() {
  return (
    <>
      <InfoStructuredData data={termsSchema} />
      <InfoPageShell
        eyebrow="Terms"
        title="Terms of Use"
        description="These terms describe responsible use of Lumeo PDF Workspace and its browser-first document tools."
        lastUpdated={lastUpdated}
      >
        <InfoCallout>
          These terms use plain language and do not specify a legal jurisdiction
          or registered company details that have not been provided.
        </InfoCallout>

        {[
          {
            title: "Acceptance of terms",
            body: "By accessing Lumeo PDF Workspace, you agree to use the service responsibly and in accordance with these terms.",
          },
          {
            title: "Description of service",
            body: "Lumeo provides browser-first PDF tools and public information pages. Available tools and capabilities may evolve over time.",
          },
          {
            title: "Browser-first processing",
            body: "Current supported tools process documents locally in the browser. Browser limitations may affect very large, damaged, encrypted, or unusually complex files.",
          },
          {
            title: "Ownership of user documents",
            body: "You retain ownership of the documents you choose to use with Lumeo. You are responsible for having the rights needed to process those files.",
          },
          {
            title: "Intellectual property",
            body: "The Lumeo interface, brand, copy, and software are part of the Lumeo project. These terms do not grant rights to copy or misuse the product identity.",
          },
          {
            title: "Availability and changes",
            body: "The service may change as tools evolve. Lumeo does not guarantee uninterrupted access, error-free operation, or permanent availability of any specific feature.",
          },
          {
            title: "No professional advice",
            body: "Lumeo does not provide legal, financial, medical, or other professional advice. Review important documents independently before sharing or submitting them.",
          },
          {
            title: "Disclaimers and responsibility",
            body: "Use Lumeo at your own discretion. Keep backup copies of important files and verify downloaded output before relying on it.",
          },
          {
            title: "Third-party services",
            body: "Lumeo may rely on hosting, deployment, framework, font, and dependency infrastructure. Those services may have their own terms and limitations.",
          },
          {
            title: "Changes to terms",
            body: "These terms may be updated as Lumeo develops. Material updates will be reflected on this page.",
          },
        ].map((section) => (
          <InfoPageSection key={section.title} title={section.title}>
            <p>{section.body}</p>
          </InfoPageSection>
        ))}

        <InfoPageSection title="User responsibilities and prohibited use">
          <InfoList
            items={[
              "Use Lumeo only for lawful document work.",
              "Do not process files you do not have the right to use.",
              "Do not use Lumeo for harmful, infringing, abusive, or misleading activity.",
              "Do not attempt to interfere with the site or access data that does not belong to you.",
            ]}
          />
        </InfoPageSection>

        <InfoPageSection title="Contact">
          <p>Questions about these terms can be routed through the contact page.</p>
          <InfoInlineLinks links={[{ label: "Contact Lumeo", href: "/contact" }]} />
        </InfoPageSection>
      </InfoPageShell>
    </>
  );
}
