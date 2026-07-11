import type { Metadata } from "next";
import {
  InfoCallout,
  InfoDefinitionList,
  InfoInlineLinks,
  InfoList,
  InfoPageSection,
  InfoPageShell,
  InfoStructuredData,
} from "@/components/InfoPage";

const lastUpdated = "July 11, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy - Lumeo PDF Workspace",
  description:
    "Understand how Lumeo PDF Workspace handles browser-first document processing, local preferences, analytics, and privacy.",
  alternates: {
    canonical: "https://lumeo.in/privacy",
  },
  openGraph: {
    title: "Privacy Policy - Lumeo PDF Workspace",
    description:
      "How Lumeo PDF approaches browser-first document processing, local preferences, and privacy.",
    url: "https://lumeo.in/privacy",
    siteName: "Lumeo PDF",
    type: "website",
    images: ["/og-image.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy - Lumeo PDF Workspace",
    description:
      "Understand Lumeo PDF's browser-first privacy approach.",
    images: ["/og-image.svg"],
  },
};

const privacySchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Privacy Policy - Lumeo PDF Workspace",
  url: "https://lumeo.in/privacy",
  description:
    "Privacy information for Lumeo PDF Workspace and its browser-first PDF tools.",
};

export default function PrivacyPage() {
  return (
    <>
      <InfoStructuredData data={privacySchema} />
      <InfoPageShell
        eyebrow="Privacy"
        title="Privacy Policy"
        description="This page explains how Lumeo PDF Workspace approaches document privacy, local browser processing, preferences, and future data flows."
        lastUpdated={lastUpdated}
      >
        <InfoCallout>
          This privacy page is a practical product disclosure and is not a
          substitute for legal review.
        </InfoCallout>

        <InfoPageSection title="Privacy at a glance">
          <InfoList
            items={[
              "Current supported PDF workflows are browser-first.",
              "Files are processed on the user's device for supported tools.",
              "Current tools do not require document upload for processing.",
              "No account is required for current tools.",
              "The active workspace can be cleared by the user.",
            ]}
          />
        </InfoPageSection>

        <InfoPageSection title="Files and document content">
          <p>
            Current supported browser-first tools process files locally in the
            browser. Files are not intentionally transmitted to Lumeo servers for
            those workflows, and document contents are not stored in
            localStorage.
          </p>
          <p>
            Generated object URLs and temporary in-memory data are cleared when
            the workspace is reset or the page session ends, subject to browser
            behaviour. Downloads remain on the user&apos;s device according to the
            browser&apos;s download settings.
          </p>
        </InfoPageSection>

        <InfoPageSection title="Local storage">
          <InfoDefinitionList
            items={[
              {
                term: "May be stored",
                description:
                  "Non-document UI preferences such as thumbnail density for Split PDF.",
              },
              {
                term: "Not stored",
                description:
                  "PDF contents, page images, output documents, document text, document passwords, and sensitive document metadata.",
              },
            ]}
          />
        </InfoPageSection>

        <InfoPageSection title="Analytics and diagnostics">
          <p>
            Lumeo currently does not intentionally send document names or
            document contents to analytics services. Product diagnostics, if
            added in the future, should avoid document content and should be
            disclosed clearly.
          </p>
        </InfoPageSection>

        <InfoPageSection title="Cookies">
          <p>
            Current browser-first tools do not require account cookies. Hosting
            platforms, browsers, or future product features may use cookies or
            similar storage for operational purposes.
          </p>
        </InfoPageSection>

        <InfoPageSection title="Third-party services">
          <p>
            Lumeo uses web hosting and deployment infrastructure to serve the
            public site. Fonts are loaded through the framework&apos;s font system.
            Current Merge and Split workflows do not require remote PDF
            processing services.
          </p>
        </InfoPageSection>

        <InfoPageSection title="Security limitations">
          <p>
            Browser-first processing reduces unnecessary file transfer, but no
            online service can guarantee absolute security. Users should keep
            browsers updated and handle highly sensitive documents according to
            their organisation&apos;s policies.
          </p>
        </InfoPageSection>

        <InfoPageSection title="Future features">
          <p>
            Optional accounts, cloud history, sync, team workspaces, or remote
            processing may use different data flows in future. Such features
            should receive updated disclosures and user choice before release.
          </p>
        </InfoPageSection>

        <InfoPageSection title="Children's privacy">
          <p>
            Lumeo is intended for general document work and is not designed to
            collect information from children. If a future account feature
            changes that model, this page should be updated.
          </p>
        </InfoPageSection>

        <InfoPageSection title="Changes and contact">
          <p>
            Material updates will be reflected on this page with an updated
            date. Privacy questions can be routed through the contact page.
          </p>
          <InfoInlineLinks links={[{ label: "Contact Lumeo", href: "/contact" }]} />
        </InfoPageSection>
      </InfoPageShell>
    </>
  );
}
