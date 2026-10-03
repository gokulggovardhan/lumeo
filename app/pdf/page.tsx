import type { Metadata } from "next";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { WorkspaceStart } from "@/components/pdf/workspace/WorkspaceStart";

export const metadata: Metadata = {
  title: "PDF Workspace - Upload Once, Use Multiple PDF Tools | Lumeo",
  description:
    "Upload one PDF once and keep working across Edit, Pages, Sign, Add and Compress before one final download in Lumeo PDF Workspace.",
  alternates: {
    canonical: "/pdf",
  },
};

export default function PdfWorkspacePage() {
  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1160px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-16 pt-6 sm:px-8 sm:pb-20 sm:pt-8"
    >
      <WorkspaceStart />
    </PublicCatalogPageShell>
  );
}
