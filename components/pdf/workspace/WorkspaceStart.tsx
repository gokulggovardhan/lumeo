"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AuraButton,
  AuraStatus,
} from "@/components/ui/Aura";
import {
  L2UploadStage,
  ToolPrivacyNote,
} from "@/components/pdf/workspace/ToolWorkspace";
import {
  continuationRouteForArea,
  type ContinuationArea,
} from "@/lib/pdf/workspace/continuation";
import type { WorkspaceArea } from "@/lib/pdf/workspace/model";
import {
  checkPdfFileSize,
  checkPdfPageCount,
  hasPdfMagicBytes,
  isPdfNamedFile,
} from "@/lib/pdf/uploadValidation";
import { useWorkspaceDocument } from "./WorkspaceDocumentProvider";

type PreparedPdf = {
  fileName: string;
  bytes: ArrayBuffer;
  pageCount: number;
};

const FIRST_STEPS: readonly {
  area: WorkspaceArea;
  label: string;
  detail: string;
}[] = [
  { area: "edit", label: "Edit", detail: "Edit text and document content" },
  { area: "pages", label: "Pages", detail: "Reorder, rotate or delete pages" },
  { area: "sign", label: "Sign", detail: "Add signatures and initials" },
  { area: "enhance", label: "Add", detail: "Watermarks, page numbers and headers" },
  { area: "optimize", label: "Compress", detail: "Reduce the final PDF size" },
];

function routeForArea(area: WorkspaceArea): string {
  return continuationRouteForArea(area as ContinuationArea);
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function friendlyPdfError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    message.includes("encrypted") ||
    message.includes("password") ||
    message.includes("encryption")
  ) {
    return "This PDF is password-protected. Unlock it first, then start the Workspace.";
  }
  return "Lumeo could not open this PDF. Choose a valid PDF file and try again.";
}

export function WorkspaceStart() {
  const router = useRouter();
  const {
    document,
    startDocument,
    continueCurrent,
    clearDocument,
  } = useWorkspaceDocument();
  const [prepared, setPrepared] = useState<PreparedPdf | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function preparePdf(files: FileList) {
    const file = files.item(0);
    if (!file) return;

    setError("");
    setLoading(true);

    try {
      if (!isPdfNamedFile(file)) {
        throw new Error("not-pdf");
      }
      const sizeError = checkPdfFileSize(file);
      if (sizeError) {
        setPrepared(null);
        setError(sizeError);
        return;
      }

      const bytes = await file.arrayBuffer();
      if (!hasPdfMagicBytes(bytes)) {
        throw new Error("not-pdf");
      }

      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.load(bytes, {
        ignoreEncryption: false,
        updateMetadata: false,
      });
      const pageCount = pdf.getPageCount();
      if (pageCount < 1) {
        throw new Error("empty-pdf");
      }
      const pageError = checkPdfPageCount(pageCount);
      if (pageError) {
        setPrepared(null);
        setError(pageError);
        return;
      }

      setPrepared({
        fileName: file.name,
        bytes,
        pageCount,
      });
    } catch (nextError) {
      setPrepared(null);
      setError(friendlyPdfError(nextError));
    } finally {
      setLoading(false);
    }
  }

  function openArea(area: WorkspaceArea) {
    if (prepared) {
      startDocument({
        fileName: prepared.fileName,
        bytes: prepared.bytes,
        pageCount: prepared.pageCount,
        initialArea: area,
      });
    } else if (!document) {
      return;
    }

    if (!continueCurrent(area)) return;
    router.push(routeForArea(area));
  }

  function startDifferentPdf() {
    clearDocument();
    setPrepared(null);
    setError("");
  }

  const currentName = prepared?.fileName ?? document?.revision.fileName ?? null;
  const currentPageCount =
    prepared?.pageCount ?? document?.revision.pageCount ?? null;
  const currentByteLength =
    prepared?.bytes.byteLength ?? document?.revision.byteLength ?? null;
  const ready = Boolean(prepared || document);

  return (
    <section className="grid gap-5">
      <div className="rounded-[var(--radius-2xl)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-5 shadow-[var(--v2-elevation-2)] sm:p-6">
        <div className="max-w-3xl">
          <p className="aura-text-label text-[var(--text-accent)]">
            ONE PDF · MULTIPLE TOOLS · ONE FINAL DOWNLOAD
          </p>
          <h1 className="mt-2.5 font-serif text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1] tracking-[-0.035em] text-[var(--text-primary)]">
            PDF Workspace
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
            Upload one PDF once. Keep the same document open while you edit it,
            organize pages, sign, add watermarks or page numbers, compress, and
            download the finished PDF once.
          </p>
        </div>

        {!ready ? (
          <div className="mt-6">
            <L2UploadStage
              title="Upload one PDF to start"
              description="The file stays in browser memory while you move between compatible Workspace tools."
              acceptedNote="One PDF document"
              multiple={false}
              loading={loading}
              error={error || undefined}
              buttonLabel={loading ? "Opening PDF…" : "Choose PDF"}
              onFilesSelected={(files) => void preparePdf(files)}
            />
            <div className="mt-3">
              <ToolPrivacyNote />
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.025)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">
                  {currentName}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {currentPageCount} {currentPageCount === 1 ? "page" : "pages"}
                  {currentByteLength ? ` · ${formatBytes(currentByteLength)}` : ""}
                  {document && !prepared ? ` · Revision ${document.revision.number}` : ""}
                </p>
              </div>
              <AuraStatus
                tone="success"
                label={document && !prepared ? "Workspace open" : "Ready"}
              />
            </div>
            <AuraButton
              type="button"
              variant="secondary"
              size="md"
              onClick={startDifferentPdf}
              className="mt-3"
            >
              Start with a different PDF
            </AuraButton>
          </div>
        )}
      </div>

      <section
        aria-labelledby="workspace-first-step"
        className="rounded-[var(--radius-2xl)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-5 shadow-[var(--v2-elevation-1)] sm:p-6"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="aura-text-label text-[var(--text-accent)]">WORKSPACE TOOLS</p>
            <h2
              id="workspace-first-step"
              className="mt-1.5 font-serif text-xl font-semibold text-[var(--text-primary)]"
            >
              {ready ? "Choose your next step." : "Upload once, then choose your first step."}
            </h2>
          </div>
          <p className="max-w-md text-xs leading-5 text-[var(--text-muted)] sm:text-right">
            These tools share the same in-memory PDF. You can switch again after each materialized change without downloading or re-uploading.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 max-[360px]:grid-cols-1 md:grid-cols-5">
          {FIRST_STEPS.map((step) => (
            <button
              key={step.area}
              type="button"
              disabled={!ready}
              onClick={() => openArea(step.area)}
              className="lumeo-focus-ring flex min-h-[6.5rem] flex-col justify-between rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-[var(--surface-base)] p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--border-selected)] hover:bg-[var(--surface-elevated)] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transform-none"
            >
              <span className="font-serif text-base font-semibold text-[var(--text-primary)]">
                {step.label}
              </span>
              <span className="mt-2 text-[11px] leading-4 text-[var(--text-muted)]">
                {step.detail}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-2 text-sm text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          Prefer a single task? Every existing standalone PDF tool still works normally.
        </p>
        <AuraButton
          type="button"
          variant="secondary"
          size="md"
          onClick={() => router.push("/pdf-tools")}
        >
          Browse all PDF tools
        </AuraButton>
      </div>
    </section>
  );
}
