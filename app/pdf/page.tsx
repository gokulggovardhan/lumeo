import type { Metadata } from "next";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { WorkspaceStart } from "@/components/pdf/workspace/WorkspaceStart";

export const metadata: Metadata = {
  title: "PDF Workspace - Upload Once, Use Multiple PDF Tools | Lumeo",
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
};

export default function PdfWorkspacePage() {
  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1160px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-4 pb-20 pt-4 sm:px-8 sm:pb-20 sm:pt-7"
    >
      <WorkspaceStart />
    </PublicCatalogPageShell>
  );
}
