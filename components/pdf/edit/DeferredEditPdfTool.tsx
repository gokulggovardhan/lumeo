"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useWorkspaceDocument } from "@/components/pdf/workspace/WorkspaceDocumentProvider";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import { L2UploadStage } from "@/components/pdf/workspace/ToolWorkspace";

// Keep the first-visit PDF upload UI independent of the large editor,
// OCR, shaping and native PDF rewrite modules. None of those modules is
// needed until a PDF has been selected (or a Workspace continuation exists).
function ToolWorkspaceLoading() {
  return (
    <section
      aria-hidden="true"
      aria-label="Loading tool"
      className="l2-tool-workspace mx-auto grid w-full max-w-[1240px] grid-cols-1 gap-5"
    >
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(330px,1fr)] xl:gap-7">
        <div aria-hidden="true" className="aura-shimmer min-h-[22rem] rounded-[var(--radius-2xl)] bg-[rgba(var(--lumeo-paper-rgb),0.07)]" />
        <div aria-hidden="true" className="aura-shimmer min-h-[22rem] rounded-[var(--radius-2xl)] bg-[rgba(var(--lumeo-paper-rgb),0.07)]" />
      </div>
    </section>
  );
}

const EditPdfTool = dynamic(() => import("@/components/pdf/EditPdfTool"), {
  ssr: false,
  loading: () => <ToolWorkspaceLoading />,
});

export default function DeferredEditPdfTool() {
  const { continuationTarget } = useWorkspaceDocument();
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);
  const [initialFile, setInitialFile] = useState<File | null>(null);
  const [editorRequested, setEditorRequested] = useState(continuationTarget === "edit");
  const entryRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const result = track({ eventName: "tool_opened", toolSlug: "edit" });
    if (result.accepted) openedTrackedRef.current = true;
  }, [availability, track]);

  useEffect(() => {
    // Match EditPdfTool's established browser-test readiness contract.
    entryRef.current?.setAttribute("data-edit-client-ready", "true");
  }, []);

  // takeContinuation clears the provider's one-shot target before the PDF
  // finishes opening. Retain the request for this entry's lifetime so that
  // consuming it cannot unmount the editor and discard its in-flight load.
  // Adjust during render so this also handles a handoff arriving after mount,
  // before the child can consume it. Route unmount resets this local state.
  if (continuationTarget === "edit" && !editorRequested) {
    setEditorRequested(true);
  }

  if (initialFile || editorRequested) {
    return <EditPdfTool initialFile={initialFile} />;
  }

  return (
    <section ref={entryRef} className="l2-workspace grid gap-5 pb-4 lg:pb-0">
      <div className="aura-glass-regular mx-auto w-full max-w-[720px] rounded-[var(--radius-2xl)] p-2 shadow-[var(--v2-elevation-3)]">
        <L2UploadStage
          inputId="edit-pdf-upload"
          accept="application/pdf,.pdf"
          acceptedNote="PDF only · One file"
          multiple={false}
          buttonLabel="Select PDF"
          onFilesSelected={(files) => {
            const file = files.item(0);
            if (file) setInitialFile(file);
          }}
        />
      </div>
    </section>
  );
}
