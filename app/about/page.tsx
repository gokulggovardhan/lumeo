import type { Metadata } from "next";
import {
  InfoCallout,
  InfoInlineLinks,
  InfoList,
  InfoPageSection,
  InfoPageShell,
  InfoStructuredData,
} from "@/components/InfoPage";
import { withSeoOverride } from "@/lib/public-site/seo";

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/about", {
    title: "About Lumeo PDF Workspace - Private Browser PDF Tools",
    description:
      "Learn how Lumeo PDF Workspace is building a premium browser-first environment for private, professional PDF handling.",
    alternates: {
      canonical: "https://lumeo.in/about",
    },
    openGraph: {
      title: "About Lumeo PDF Workspace",
      description:
        "A premium browser-first workspace for private, professional PDF handling.",
      url: "https://lumeo.in/about",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "About Lumeo PDF Workspace",
      description:
        "Learn how Lumeo PDF is building a calm, private document workspace.",
    },
  });
}

const aboutSchema = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "About Lumeo PDF Workspace",
  url: "https://lumeo.in/about",
  description:
    "Lumeo PDF Workspace is a premium browser-first environment for private, professional PDF handling.",
};

export default function AboutPage() {
  return (
    <>
      <InfoStructuredData data={aboutSchema} />
      <InfoPageShell
        eyebrow="About"
        title="A quieter, more private way to work with PDFs"
        description="Lumeo PDF Workspace is designed as a premium document environment where everyday PDF tasks feel clear, controlled, and professional."
        actions={[
          { label: "Explore PDF tools", href: "/pdf" },
          { label: "Read our privacy approach", href: "/privacy" },
        ]}
      >
        <InfoPageSection title="Why Lumeo exists">
          <p>
            Many document tools feel crowded, transactional, or built around a
            quick conversion rather than a complete workspace. Lumeo is being
            shaped as a calm document console where important PDF work feels
            organized from the first file to the final download.
          </p>
          <p>
            The goal is simple first and powerful when needed: the primary path
            should be understandable immediately, while advanced controls appear
            progressively for users who need more precision.
          </p>
        </InfoPageSection>

        <InfoPageSection title="The Lumeo philosophy">
          <InfoList
            items={[
              "Simple first: the primary workflow should remain immediately understandable.",
              "Powerful when needed: advanced controls appear progressively instead of overwhelming the user.",
              "Premium always: every state, from upload to output, should feel deliberate and trustworthy.",
            ]}
          />
        </InfoPageSection>

        <InfoPageSection title="Browser-first by design">
          <p>
            Current supported workflows process files locally in the browser.
            Files stay on the device during those supported operations, and no
            account or remote document storage is required for current tools.
          </p>
          <InfoCallout>
            Some future capabilities may require a different architecture. If
            that happens, Lumeo should introduce those flows transparently with
            updated privacy and security disclosures.
          </InfoCallout>
        </InfoPageSection>

        <InfoPageSection title="Built as a workspace">
          <p>
            Lumeo is growing toward a consistent document workspace: visual
            document decks, output manifests, document health checks, smart
            local analysis, reversible session controls, premium completion
            states, and clear cleanup.
          </p>
          <p>
            These are product-direction standards. Each tool should earn its
            place in the workspace one careful release at a time.
          </p>
        </InfoPageSection>

        <InfoPageSection title="Who Lumeo is for">
          <InfoList
            items={[
              "Professionals preparing important documents.",
              "Students organizing assignments, notes, and applications.",
              "Businesses handling invoices, forms, reports, and statements.",
              "General users who want PDF tools that feel calm and controlled.",
            ]}
          />
        </InfoPageSection>

        <InfoPageSection title="Current tools">
          <p>
            Available now: Compose (organize — merge, split, reorder), Distill
            (compress and optimize), Capture (images to PDF), and Render (PDF
            to images and text). Editing, signing, protection, and Office
            conversion are in development.
          </p>
          <InfoInlineLinks
            links={[
              { label: "Compose", href: "/pdf/merge" },
              { label: "Distill", href: "/pdf/compress" },
              { label: "All PDF tools", href: "/pdf-tools" },
            ]}
          />
        </InfoPageSection>

        <InfoPageSection title="Product promise">
          <p>
            Lumeo will grow one carefully finished tool at a time. Each tool is
            expected to meet the same standards for privacy, performance,
            accessibility, clarity, and premium experience before it becomes
            part of the workspace.
          </p>
        </InfoPageSection>
      </InfoPageShell>
    </>
  );
}
