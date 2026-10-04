import type { Metadata } from "next";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { WorkspaceStart } from "@/components/pdf/workspace/WorkspaceStart";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf", {
    title: { absolute: "PDF Workspace - Upload Once, Use Multiple Tools | Lumeo" },
    description:
      "Upload one PDF once, then move between Edit, Pages, Sign, Add and Compress before one final download. Prefer one task? Lumeo's standalone PDF tools remain available.",
    alternates: {
      canonical: "/pdf",
    },
    openGraph: {
      title: "Lumeo PDF Workspace - Upload Once, Use Multiple Tools",
      description:
        "Keep one PDF open across compatible Lumeo tools, or use any standalone PDF tool for a quick one-off task.",
      url: "https://lumeo.in/pdf",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Lumeo PDF Workspace",
      description:
        "Upload one PDF once and keep working across compatible Lumeo tools.",
    },
  });
}

const workspaceSchema = buildSoftwareApplicationSchema({
  name: "Lumeo PDF Workspace",
  description:
    "Upload one PDF once and move between compatible editing, page, signing, enhancement, and compression tools before a final download.",
  path: "/pdf",
  featureList: [
    "Upload one PDF once",
    "Switch between compatible PDF tools",
    "Keep supported document work in browser memory",
    "Finish with one final download",
  ],
});

const workspaceBreadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Workspace", path: "/pdf" },
]);

export default function PdfWorkspacePage() {
  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1160px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-4 pb-20 pt-4 sm:px-8 sm:pb-20 sm:pt-7"
    >
      <WorkspaceStart />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(workspaceSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(workspaceBreadcrumbSchema) }}
      />
    </PublicCatalogPageShell>
  );
}
