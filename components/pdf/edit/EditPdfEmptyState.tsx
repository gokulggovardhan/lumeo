"use client";

import type { Ref } from "react";
import {
  L2PrivacyNote,
  L2UploadStage,
} from "@/components/pdf/workspace/ToolWorkspace";

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <path d="M8 22.5 20 10.5l3 3L11 25.5H8v-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M18.5 12 21 14.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

export function EditPdfEmptyState({
  sectionRef,
  onFilesSelected,
  error,
  preparing = false,
}: {
  sectionRef?: Ref<HTMLElement>;
  onFilesSelected?: (files: FileList) => void;
  error?: string;
  preparing?: boolean;
}) {
  return (
    <section ref={sectionRef} className="l2-workspace grid gap-5 pb-4 lg:pb-0">
      <div className="aura-glass-regular mx-auto w-full max-w-[720px] rounded-[var(--radius-2xl)] p-2 shadow-[var(--v2-elevation-3)]">
        <L2UploadStage
          inputId={onFilesSelected ? "edit-pdf-upload" : undefined}
          accept="application/pdf,.pdf"
          acceptedNote="PDF only · One file"
          multiple={false}
          icon={<EditIcon />}
          buttonLabel={preparing ? "Preparing editor…" : "Select PDF"}
          onFilesSelected={onFilesSelected}
        />
      </div>

      <L2PrivacyNote />

      {error ? (
        <div role="alert" className="mx-auto w-full max-w-[720px] rounded-[var(--radius-lg)] border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
          {error}
        </div>
      ) : null}
    </section>
  );
}
