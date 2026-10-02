import type { Metadata } from "next";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader } from "@/components/pdf/workspace/ToolWorkspace";
import { AddWorkspaceEntry } from "@/components/pdf/workspace/AddWorkspaceEntry";

export const metadata: Metadata = {
  title: "Add to PDF - Lumeo PDF",
  description:
    "Add a watermark, page numbers, or headers and footers to a PDF.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function AddPdfPage() {
  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[980px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        categoryLabel="ADD"
        title="Add to PDF"
        description="Choose one focused addition and keep working with the same PDF."
      />
      <div className="lumeo-fade-up lumeo-fade-up-delay-1 mt-5">
        <AddWorkspaceEntry />
      </div>
    </PublicCatalogPageShell>
  );
}
