import type { Metadata } from "next";
import {
  InfoDefinitionList,
  InfoInlineLinks,
  InfoList,
  InfoPageSection,
  InfoPageShell,
  InfoStructuredData,
} from "@/components/InfoPage";
import { withSeoOverride } from "@/lib/public-site/seo";

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/security", {
    title: "Security and Browser-First Processing - Lumeo PDF",
    description:
      "Learn how Lumeo PDF Workspace uses browser-first processing, local cleanup, dependency controls, and careful document handling.",
    alternates: {
      canonical: "https://lumeo.in/security",
    },
    openGraph: {
      title: "Security and Browser-First Processing - Lumeo PDF",
      description:
        "How Lumeo PDF approaches local document processing, cleanup, and security limitations.",
      url: "https://lumeo.in/security",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Security and Browser-First Processing - Lumeo PDF",
      description:
        "Learn about Lumeo PDF's browser-first security approach.",
    },
  });
}

const securitySchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Security and Browser-First Processing",
  url: "https://lumeo.in/security",
  description:
    "Security information for Lumeo PDF Workspace and its browser-first document tools.",
};

export default function SecurityPage() {
  return (
    <>
      <InfoStructuredData data={securitySchema} />
      <InfoPageShell
        eyebrow="Security"
        title="Security and browser-first processing"
        description="Lumeo is designed to reduce unnecessary document movement. For supported browser-first tools, PDF processing happens locally inside the browser rather than through a remote document-processing server."
      >
        <InfoPageSection title="Security approach">
          <p>
            Browser-first processing is an architectural choice intended to
            reduce avoidable document transfer for current supported tools. It
            does not remove every risk, but it keeps the active workflow closer
            to the user&apos;s device.
          </p>
        </InfoPageSection>

        <InfoPageSection title="Current processing model">
          <InfoDefinitionList
            items={[
              { term: "Processing location", description: "User's browser" },
              {
                term: "File upload",
                description:
                  "Not required for current supported browser-first tools",
              },
              {
                term: "Document storage",
                description:
                  "Not intentionally stored by Lumeo for current supported workflows",
              },
              { term: "Account required", description: "No" },
            ]}
          />
        </InfoPageSection>

        <InfoPageSection title="Browser isolation">
          <p>
            Current tools use browser APIs and client-side PDF libraries.
            Browser sandboxing provides an important security boundary, while
            actual protection also depends on the browser, device, extensions,
            and operating system.
          </p>
        </InfoPageSection>

        <InfoPageSection title="Temporary data and cleanup">
          <p>
            Files may be held in memory or browser-generated temporary URLs
            during the active session. Start New and cleanup actions clear active
            workspace state. Temporary data may also end when the tab or browser
            session closes. Browser downloads remain under user control.
          </p>
        </InfoPageSection>

        <InfoPageSection title="Dependencies">
          <p>
            Browser PDF libraries are used for current document processing.
            Dependencies are reviewed for compatibility and bundle impact, but
            no software supply chain can be described as perfectly risk-free.
          </p>
        </InfoPageSection>

        <InfoPageSection title="What current tools do not do">
          <InfoList
            items={[
              "No required server upload for current Compose, Distill, Capture, or Render workflows.",
              "No remote PDF processing for current Compose, Distill, Capture, or Render workflows.",
              "No cloud document storage for current supported workflows.",
              "No forced account.",
              "No document-content analytics.",
              "No external OCR for current supported workflows.",
            ]}
          />
        </InfoPageSection>

        <InfoPageSection title="User security recommendations">
          <InfoList
            items={[
              "Use a current browser.",
              "Avoid untrusted browser extensions.",
              "Use trusted devices for sensitive documents.",
              "Review downloaded output before sharing.",
              "Follow organisation-specific document policies.",
            ]}
          />
        </InfoPageSection>

        <InfoPageSection title="Responsible disclosure">
          <p>
            Security concerns should include the affected page or tool, clear
            reproduction steps, impact, and non-destructive proof. Please do not
            send confidential PDF files unless specifically requested through an
            approved secure channel.
          </p>
          <InfoInlineLinks links={[{ label: "Report a security concern", href: "/contact" }]} />
        </InfoPageSection>

        <InfoPageSection title="Security limitations and future architecture">
          <p>
            No system is perfectly secure. Browser-first does not remove every
            risk, and device compromise or malicious extensions remain outside
            Lumeo&apos;s control. Cloud or account features, if introduced, should
            receive separate security and privacy disclosures.
          </p>
        </InfoPageSection>
      </InfoPageShell>
    </>
  );
}
