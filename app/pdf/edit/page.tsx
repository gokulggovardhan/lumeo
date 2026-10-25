import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { PublicToolPageHeader } from "@/components/pdf/workspace/PublicToolPageHeader";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";
import { ToolSeoContent } from "@/components/pdf/ToolSeoContent";
import { LOCAL_FIRST_SHORT } from "@/lib/public-site/copy";
import DeferredEditPdfTool from "@/components/pdf/edit/DeferredEditPdfTool";

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo Edit PDF",
  description: "Add text, freehand drawing, shapes, and whiteout boxes to a PDF, privately in your browser.",
  path: "/pdf/edit",
  featureList: ["Click-to-type text", "Freehand ink", "Shapes and highlight", "Whiteout boxes", "No file upload"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "Edit PDF", path: "/pdf/edit" },
]);

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/edit", {
    title: { absolute: "PDF Editor Online - Edit PDF Privately | Lumeo" },
    description: "Edit supported PDF text and add text, drawing, shapes, and whiteout locally in your browser. Your PDF stays on your device.",
    alternates: { canonical: "/pdf/edit" },
    openGraph: {
      title: "PDF Editor Online - Edit PDF Privately | Lumeo PDF",
      description: "Edit supported PDF text and add text, drawing, shapes, and whiteout in a private browser-first workspace.",
      url: "https://lumeo.in/pdf/edit",
      siteName: "Lumeo PDF",
      type: "website",
      images: ["https://lumeo.in/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: "PDF Editor Online - Edit PDF Privately | Lumeo PDF",
      description: "Edit supported PDF text and add text, drawing, shapes, and whiteout directly in your browser.",
      images: ["https://lumeo.in/twitter-image"],
    },
  });
}

// Keep tool gating server-side, but stream the text-first page shell without
// waiting on availability. The editor is never interactive until the gate
// resolves; maintenance messages retain exactly the same behaviour.
async function EditPdfAvailabilityGate() {
  const toolState = await getToolBlockedState("edit");
  return toolState.blocked ? (
    <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
  ) : (
    <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool min-h-[calc(100dvh-12rem)] sm:min-h-0">
      <DeferredEditPdfTool />
    </div>
  );
}

function EditPdfAvailabilityFallback() {
  return (
    <div className="l2-live-tool-workspace min-h-[calc(100dvh-12rem)] rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-base)]/30 p-4 sm:min-h-64" role="status" aria-label="Checking PDF editor availability">
      <p className="text-sm text-[var(--text-muted)]">Preparing your private PDF editor…</p>
    </div>
  );
}

export default function EditPdfPage() {
  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <PublicToolPageHeader categoryLabel="EDIT" title="Edit PDF" description="Add text, drawing, shapes, and whiteout boxes to a PDF." />

      <Suspense fallback={<EditPdfAvailabilityFallback />}>
        <EditPdfAvailabilityGate />
      </Suspense>

      {/* Keep the privacy promise server-rendered. Lighthouse's LCP node was
          the former client-only note, which appeared after hydration. This
          public, non-sensitive sentence does not depend on document state. */}
      <div className="l2-privacy-note mx-auto flex w-fit max-w-[560px] items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-raised)] px-4 py-2 text-center text-xs font-extrabold text-[var(--text-muted)]">
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[var(--text-premium)]" fill="none">
          <path d="M8 2.5 12 4v3.1c0 2.6-1.5 4.9-4 6.1-2.5-1.2-4-3.5-4-6.1V4l4-1.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
        </svg>
        <span>{LOCAL_FIRST_SHORT}</span>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <ToolSeoContent route="/pdf/edit" />
    </PublicCatalogPageShell>
  );
}
