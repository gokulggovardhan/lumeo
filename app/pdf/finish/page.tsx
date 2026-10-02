import type { Metadata } from "next";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader } from "@/components/pdf/workspace/ToolWorkspace";
import { WorkspaceFinish } from "@/components/pdf/workspace/WorkspaceFinish";

export const metadata: Metadata = {
  title: "Finish PDF - Lumeo PDF",
  description: "Review the current Lumeo PDF workspace and download the final PDF.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function FinishPdfPage() {
  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1080px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-16 pt-7 sm:px-8 sm:pb-20 sm:pt-9"
    >
      <L2ToolPageHeader
        categoryLabel="FINISH"
        title="Finish"
        description="Review your changes and download one final PDF."
      />
      <div className="lumeo-fade-up lumeo-fade-up-delay-1 mt-5">
        <WorkspaceFinish />
      </div>
    </PublicCatalogPageShell>
  );
}
