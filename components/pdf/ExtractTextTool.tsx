"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2PanelLabel,
  L2PrivacyNote,
  L2ToolbarButton,
  L2UploadStage,
  L2WorkspaceGrid,
  L2WorkspaceHeader,
  L2WorkspaceInspector,
  L2WorkspacePanel,
  L2WorkspaceToolbar,
  ToolActionBar,
} from "@/components/pdf/workspace/ToolWorkspace";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import { openPdfJsDocument, withPageTimeout } from "@/lib/pdf/pdfjs";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { recordRecentFile } from "@/lib/recent-files";
import {
  buildCsvFromEntries,
  buildJsonFromEntries,
  buildTxtFromEntries,
  isEffectivelyEmpty,
  joinTextItems,
  parsePageRange,
  selectPageEntries,
} from "@/lib/pdf/textExtraction";
import { checkPdfFileSize, hasPdfMagicBytes, isPdfNamedFile } from "@/lib/pdf/uploadValidation";

type ExportFormat = "txt" | "json" | "csv";

const PAGE_EXTRACT_TIMEOUT_MS = 15_000;
const UNREADABLE_PAGE_TEXT = "[This page could not be read -- it may use an unsupported encoding or a damaged content stream.]";

const FORMAT_EXTENSION: Record<ExportFormat, string> = { txt: "txt", json: "json", csv: "csv" };
const FORMAT_MIME: Record<ExportFormat, string> = {
  txt: "text/plain",
  json: "application/json",
  csv: "text/csv",
};

function ExtractIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <path d="M8 6.5h10.5l2.5 2.5v16.5H8v-19Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M12 14h8M12 18h8M12 22h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function downloadText(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
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
  const [pageRangeInput, setPageRangeInput] = useState("");
  const [format, setFormat] = useState<ExportFormat>("txt");
  const [error, setError] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const result = track({ eventName: "tool_opened", toolSlug: "extract-text" });
    if (result.accepted) {
      openedTrackedRef.current = true;
    }
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
      // Each page is isolated: a malformed content stream or unsupported
      // encoding on one page (real-world corrupt/hand-crafted PDFs) fails or
      // hangs that page alone -- the rest of the document still extracts
      // instead of the whole operation dying on one bad page.
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        try {
          const page = await withPageTimeout(doc.getPage(pageNumber), pageNumber, PAGE_EXTRACT_TIMEOUT_MS, "load");
          const content = await withPageTimeout(page.getTextContent(), pageNumber, PAGE_EXTRACT_TIMEOUT_MS, "extract text from");
          texts.push(joinTextItems(content.items as Array<{ str: string }>));
        } catch {
          texts.push(UNREADABLE_PAGE_TEXT);
        }
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
      recordRecentFile({ tool: "extract-text", filename: file.name, fileSize: file.size, pageCount: texts.length });
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

  const rangeResult = useMemo(
    () => parsePageRange(pageRangeInput, pageTexts?.length ?? 0),
    [pageRangeInput, pageTexts],
  );

  const filteredIndices = useMemo(() => {
    if (!pageTexts) return [];
    const term = search.trim().toLowerCase();
    return pageTexts
      .map((text, index) => ({ text, index }))
      .filter(({ index }) => !rangeResult.pages || rangeResult.pages.has(index + 1))
      .filter(({ text }) => !term || text.toLowerCase().includes(term))
      .map(({ index }) => index);
  }, [pageTexts, search, rangeResult.pages]);

  const selectedEntries = useMemo(
    () => (pageTexts ? selectPageEntries(pageTexts, rangeResult.pages) : []),
    [pageTexts, rangeResult.pages],
  );

  const noTextLayer = pageTexts ? isEffectivelyEmpty(pageTexts) : false;
  const exportDisabled = noTextLayer || selectedEntries.length === 0;

  function handleCopyAll() {
    if (exportDisabled) return;
    void navigator.clipboard.writeText(buildTxtFromEntries(selectedEntries));
  }

  function resetTool() {
    setFileName("");
    setPageTexts(null);
    setSearch("");
    setPageRangeInput("");
    setFormat("txt");
    setError("");
  }

  function handleDownload() {
    if (exportDisabled) return;
    const content =
      format === "json"
        ? buildJsonFromEntries(selectedEntries)
        : format === "csv"
          ? buildCsvFromEntries(selectedEntries)
          : buildTxtFromEntries(selectedEntries);
    downloadText(
      content,
      `${sanitizeFileStem(fileName, "lumeo-extract")}.${FORMAT_EXTENSION[format]}`,
      FORMAT_MIME[format],
    );
    track({ eventName: "download_started", toolSlug: "extract-text" });
  }

  if (!pageTexts) {
    return (
      <section className="l2-workspace grid gap-5 pb-4 lg:pb-0">
        <L2WorkspaceHeader title="Text Extract" description="Pull selectable text out of a PDF, narrow to a page range, and export as TXT, JSON, or CSV." />

        <div className="aura-glass-regular mx-auto w-full max-w-[720px] rounded-[var(--radius-2xl)] p-2 shadow-[var(--v2-elevation-3)]">
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
          <div role="alert" className="mx-auto w-full max-w-[720px] rounded-[var(--radius-lg)] border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  const summaryLine = `${pageTexts.length} page${pageTexts.length === 1 ? "" : "s"} extracted`;

  return (
    <section className="l2-workspace-deep grid gap-4 pb-28 lg:pb-6">
      <L2WorkspaceHeader title="Text Extract" description={summaryLine} />

      <L2WorkspaceToolbar>
        <L2ToolbarButton onClick={resetTool}>Start new</L2ToolbarButton>
        <span className="ml-auto text-xs font-bold text-[var(--text-subtle)]">{summaryLine}</span>
      </L2WorkspaceToolbar>

      <L2WorkspaceGrid
        main={
          <L2WorkspacePanel>
            <L2PanelLabel title="Extracted text" description="Expand a page to read or copy its text." />
            <div className="mt-3">
          {noTextLayer ? (
            <div role="status" className="rounded-lg border border-[var(--text-primary)]/14 bg-[var(--text-primary)]/[0.045] p-4 text-sm font-medium text-[var(--text-primary)]">
              No selectable text found — this looks like a scanned document.
            </div>
          ) : filteredIndices.length === 0 ? (
            <div role="status" className="rounded-lg border border-[var(--text-primary)]/14 bg-[var(--text-primary)]/[0.045] p-4 text-sm font-medium text-[var(--text-primary)]">
              No pages match the current page range and search.
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
            </div>
          </L2WorkspacePanel>
        }
        inspector={
          <L2WorkspaceInspector title="Search & export" description="Narrow to a page range, search matching text, and choose an export format.">
          <label className="grid gap-1 text-sm font-bold text-[var(--text-primary)]">
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search extracted text…"
              className="rounded-lg border border-[var(--text-primary)]/14 px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold text-[var(--text-primary)]">
            Page range
            <input
              value={pageRangeInput}
              onChange={(event) => setPageRangeInput(event.target.value)}
              placeholder="e.g. 1-3, 7 (leave blank for all pages)"
              className="rounded-lg border border-[var(--text-primary)]/14 px-3 py-2 text-sm font-normal"
            />
          </label>
          {rangeResult.error ? (
            <p role="alert" className="text-xs font-bold text-[var(--text-danger)]">
              {rangeResult.error}
            </p>
          ) : null}
          <label className="grid gap-1 text-sm font-bold text-[var(--text-primary)]">
            Export format
            <select
              value={format}
              onChange={(event) => setFormat(event.target.value as ExportFormat)}
              className="rounded-lg border border-[var(--text-primary)]/14 px-3 py-2 text-sm font-normal"
            >
              <option value="txt">Plain text (.txt)</option>
              <option value="json">JSON (.json)</option>
              <option value="csv">CSV (.csv)</option>
            </select>
          </label>
          </L2WorkspaceInspector>
        }
      />

      <ToolActionBar>
        <button
          type="button"
          onClick={handleCopyAll}
          disabled={exportDisabled}
          className="lumeo-press inline-flex h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] px-5 text-sm font-bold text-[var(--text-secondary)] transition duration-[var(--v2-motion-fast)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-[var(--v2-interactive-disabled-opacity)]"
        >
          Copy all
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={exportDisabled}
          className="lumeo-primary-action lumeo-press inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[linear-gradient(180deg,var(--action-primary-hover),var(--action-primary-active))] px-6 text-sm font-extrabold text-[var(--text-on-accent)] disabled:cursor-not-allowed disabled:opacity-[var(--v2-interactive-disabled-opacity)] sm:w-auto"
        >
          Download .{FORMAT_EXTENSION[format]}
        </button>
      </ToolActionBar>

      <L2PrivacyNote />
    </section>
  );
}
