"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2ActionArea,
  L2PrivacyNote,
  L2ToolMainColumn,
  L2ToolSettingsPanel,
  L2ToolWorkspace,
  L2UploadStage,
} from "@/components/pdf/workspace/ToolWorkspace";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import { openPdfJsDocument } from "@/lib/pdf/pdfjs";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { buildTxtFile, isEffectivelyEmpty, joinTextItems } from "@/lib/pdf/textExtraction";
import { checkPdfFileSize, hasPdfMagicBytes, isPdfNamedFile } from "@/lib/pdf/uploadValidation";

function ExtractIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <path d="M8 6.5h10.5l2.5 2.5v16.5H8v-19Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M12 14h8M12 18h8M12 22h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function downloadText(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ExtractTextTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);

  const [fileName, setFileName] = useState("");
  const [pageTexts, setPageTexts] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    track({ eventName: "tool_opened", toolSlug: "extract-text" });
    openedTrackedRef.current = true;
  }, [availability, track]);

  async function handleFiles(files: FileList) {
    const file = Array.from(files)[0];
    if (!file) return;

    setError("");
    setPageTexts(null);

    if (!isPdfNamedFile(file)) {
      setError("Please add one PDF file.");
      return;
    }
    const sizeError = checkPdfFileSize(file);
    if (sizeError) {
      setError(sizeError);
      return;
    }

    setIsExtracting(true);
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "extract-text" });

    try {
      const bytes = await file.arrayBuffer();
      if (!hasPdfMagicBytes(bytes)) {
        setError("This doesn't look like a valid PDF file.");
        setIsExtracting(false);
        return;
      }

      const doc = await openPdfJsDocument(bytes);
      const texts: string[] = [];
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();
        texts.push(joinTextItems(content.items as Array<{ str: string }>));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      await (doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();

      setFileName(file.name);
      setPageTexts(texts);
      track({
        eventName: "processing_succeeded",
        toolSlug: "extract-text",
        durationMs: performance.now() - startedAt,
        success: true,
      });
    } catch (extractError) {
      const message =
        extractError instanceof Error && /password|encrypt/i.test(extractError.message)
          ? "This file appears to be password-protected or encrypted."
          : "This file could not be read. It may be damaged or password-protected.";
      setError(message);
      track({
        eventName: "processing_failed",
        toolSlug: "extract-text",
        durationMs: performance.now() - startedAt,
        success: false,
        errorCode: "processing_error",
      });
    } finally {
      setIsExtracting(false);
    }
  }

  const filteredIndices = useMemo(() => {
    if (!pageTexts || !search.trim()) return pageTexts?.map((_, index) => index) ?? [];
    const term = search.trim().toLowerCase();
    return pageTexts
      .map((text, index) => ({ text, index }))
      .filter(({ text }) => text.toLowerCase().includes(term))
      .map(({ index }) => index);
  }, [pageTexts, search]);

  const noTextLayer = pageTexts ? isEffectivelyEmpty(pageTexts) : false;

  function handleCopyAll() {
    if (!pageTexts) return;
    void navigator.clipboard.writeText(buildTxtFile(pageTexts));
  }

  function handleDownload() {
    if (!pageTexts) return;
    downloadText(buildTxtFile(pageTexts), `${sanitizeFileStem(fileName, "lumeo-extract")}.txt`);
    track({ eventName: "download_started", toolSlug: "extract-text" });
  }

  if (!pageTexts) {
    return (
      <section className="l2-tool-empty-state grid gap-4 pb-4 lg:pb-0">
        <div className="mx-auto w-full max-w-[1040px]">
          <L2UploadStage
            inputId="extract-text-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · One file"
            multiple={false}
            icon={<ExtractIcon />}
            buttonLabel="Select PDF"
            loading={isExtracting}
            onFilesSelected={handleFiles}
          />
        </div>
        <L2PrivacyNote />
        {error ? (
          <div role="alert" className="mt-4 rounded-lg border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="l2-tool-deep-workspace pb-4 lg:pb-0">
      <L2ToolWorkspace>
        <L2ToolMainColumn>
          {noTextLayer ? (
            <div role="status" className="rounded-lg border border-[var(--text-primary)]/14 bg-[var(--text-primary)]/[0.045] p-4 text-sm font-medium text-[var(--text-primary)]">
              No selectable text found — this looks like a scanned document.
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredIndices.map((index) => (
                <details key={index} open={index === 0} className="rounded-xl border border-[var(--text-primary)]/14 p-3">
                  <summary className="cursor-pointer text-sm font-black text-[var(--text-primary)]">
                    Page {index + 1}
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)]">
                    {pageTexts[index] || "(no text on this page)"}
                  </pre>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(pageTexts[index])}
                    className="mt-2 text-xs font-bold text-[var(--text-accent)]"
                  >
                    Copy this page
                  </button>
                </details>
              ))}
            </div>
          )}
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="Search" description="Filters pages by matching text.">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search extracted text…"
            className="rounded-lg border border-[var(--text-primary)]/14 px-3 py-2 text-sm"
          />
          <L2ActionArea
            primary={
              <button
                type="button"
                onClick={handleDownload}
                disabled={noTextLayer}
                className="lumeo-primary-action lumeo-press inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[linear-gradient(180deg,var(--action-primary-hover),var(--action-primary-active))] px-6 py-3 text-sm font-extrabold text-[var(--text-on-accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Download .txt
              </button>
            }
            secondary={
              <button type="button" onClick={handleCopyAll} disabled={noTextLayer} className="text-sm font-bold text-[var(--text-primary)]">
                Copy all
              </button>
            }
          />
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>

      <L2PrivacyNote />
    </section>
  );
}
