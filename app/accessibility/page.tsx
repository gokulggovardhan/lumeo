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
  title: "Accessibility - Lumeo PDF Workspace",
  description:
    "Learn how Lumeo PDF Workspace approaches keyboard access, readable interfaces, responsive design, and inclusive PDF tools.",
  alternates: {
    canonical: "https://lumeo.in/accessibility",
  },
  openGraph: {
    title: "Accessibility - Lumeo PDF Workspace",
    description:
      "How Lumeo PDF approaches keyboard access, readable interfaces, and inclusive PDF workflows.",
    url: "https://lumeo.in/accessibility",
    siteName: "Lumeo PDF",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Accessibility - Lumeo PDF Workspace",
    description: "Lumeo PDF's accessibility approach for document tools.",
  },
};

const accessibilitySchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Accessibility - Lumeo PDF Workspace",
  url: "https://lumeo.in/accessibility",
  description:
    "Accessibility approach for Lumeo PDF Workspace and its browser-first tools.",
};

export default function AccessibilityPage() {
  return (
    <>
      <InfoStructuredData data={accessibilitySchema} />
      <InfoPageShell
        eyebrow="Accessibility"
        title="Accessibility at Lumeo"
        description="Lumeo aims to make document tools usable across different devices, input methods, and assistive technologies."
        lastUpdated={lastUpdated}
      >
        <InfoCallout>
          Lumeo does not currently claim formal WCAG certification. Accessibility
          is treated as an ongoing product responsibility.
        </InfoCallout>

        <InfoPageSection title="Current design approach">
          <InfoList
            items={[
              "Keyboard-accessible controls where tool interactions require them.",
              "Visible focus states for key navigation and action controls.",
              "Semantic headings and page landmarks on public pages.",
              "Accessible labels for icon-only navigation.",
              "Touch-friendly targets and responsive mobile layouts.",
              "Reduced-motion support where implemented.",
              "Contrast-conscious Midnight Notary palette.",
              "Error messages that do not rely only on colour.",
            ]}
          />
        </InfoPageSection>

        <InfoPageSection title="Known limitations">
          <InfoList
            items={[
              "Complex PDF previews may not yet communicate all page content to assistive technology.",
              "Third-party PDF rendering libraries may have accessibility limitations.",
              "Some advanced document interactions may require further keyboard and screen-reader refinement.",
              "Large document workflows can be constrained by browser and device capabilities.",
            ]}
          />
        </InfoPageSection>

        <InfoPageSection title="Feedback">
          <p>
            Accessibility feedback is welcome, especially when a workflow is
            difficult to complete with a keyboard, screen reader, magnification,
            touch input, or reduced-motion preference.
          </p>
          <InfoInlineLinks links={[{ label: "Send accessibility feedback", href: "/contact" }]} />
        </InfoPageSection>

        <InfoPageSection title="Improvement model">
          <p>
            New tools should be reviewed for keyboard access, mobile usability,
            focus management, error recovery, semantic structure, reduced
            motion, and colour-independent state communication.
          </p>
        </InfoPageSection>
      </InfoPageShell>
    </>
  );
}
