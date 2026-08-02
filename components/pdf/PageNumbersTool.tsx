"use client";

// components/pdf/PageNumbersTool.tsx
//
// Page Numbers workspace -- reuses the same pdfjs preview + percent-based
// overlay + pdf-lib flatten-on-export architecture as Watermark PDF,
// applied to a page-number label stamped across a chosen page range
// instead of a single watermark configuration. All positioning/rotation/
// page-range/font math comes from lib/pdf/core/* (via
// lib/pdf/pageNumbers/config.ts and export.ts) and lib/pdf/watermark/
// config.ts's pctToPoints/pointsToPct unit-conversion helpers -- nothing
// here duplicates that logic.
//
// Explicitly out of scope, matching Watermark's own documented scope
// decisions: snap-to-center/edges guides, a pt/pct unit toggle for the
// manual-position numeric fields (pct only, kept simple), and per-anchor
// numeric alignment shortcuts (drag + arrow keys + corner presets already
// cover manual positioning).

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2FileCard,
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
import { PageNumberPreview } from "@/components/pdf/pageNumbers/PageNumberPreview";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import {
  createDefaultPageNumbersConfig,
  formatPageLabel,
  type NumberFormat,
  type NumeralStyle,
  type PageNumbersConfig,
  type PlacementCorner,
} from "@/lib/pdf/pageNumbers/config";
import { exportPageNumberedPdf } from "@/lib/pdf/pageNumbers/export";
import { resolvePageIndices, parsePageRangeInput } from "@/lib/pdf/core/pageRanges.ts";
import { cornerAnchorPct } from "@/lib/pdf/core/placement.ts";
import { pctToPoints, pointsToPct } from "@/lib/pdf/watermark/config";
import { openPdfJsDocument } from "@/lib/pdf/pdfjs";
import { formatBytes as formatFileSize } from "@/lib/pdf/formatBytes";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { recordRecentFile } from "@/lib/recent-files";
import { copyArrayBuffer } from "@/lib/pdf/arrayBuffer";
import { hasPdfMagicBytes, isPdfNamedFile, checkPdfFileSize, checkPdfPageCount } from "@/lib/pdf/uploadValidation";
import { resetPdfPreviewState } from "@/lib/pdf/resetPreviewState";

type LoadedPdf = { file: File; bytes: ArrayBuffer; pageCount: number };

const PAGE_RENDER_SCALE = 1.3;
const EXPORT_TIMEOUT_MS = 30_000;
const APPROX_CHAR_WIDTH_PCT = 0.9; // rough on-screen text-width estimate for the draggable preview only; export.ts measures real font metrics

const NUMBER_FORMATS: Array<[NumberFormat, string]> = [
  ["number", "1"],
  ["page-x", "Page 1"],
  ["x-of-n", "Page 1 of N"],
  ["x-slash-n", "1 / N"],
];
const NUMERAL_STYLES: Array<[NumeralStyle, string]> = [
  ["arabic", "1, 2, 3"],
  ["roman-lower", "i, ii, iii"],
  ["roman-upper", "I, II, III"],
  ["alpha-lower", "a, b, c"],
  ["alpha-upper", "A, B, C"],
];
const CORNER_PRESETS: Array<[PlacementCorner, string]> = [
  ["top-left", "Top left"],
  ["top-center", "Top center"],
  ["top-right", "Top right"],
  ["bottom-left", "Bottom left"],
  ["bottom-center", "Bottom center"],
  ["bottom-right", "Bottom right"],
];

async function runWithTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), EXPORT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function sanitizePdfFileName(value: string, fallback = "lumeo-page-numbers") {
  const stem = sanitizeFileStem(value.replace(/\.pdf$/i, ""), fallback);
  return `${stem}.pdf`;
}

// Rough on-screen size estimate for the draggable preview anchor only --
// export.ts computes the real size from pdf-lib font metrics at export
// time, so this estimate never affects the exported PDF. Mirrors
// WatermarkTool.tsx's estimateContentSizePct for text.
function estimateLabelSizePct(text: string, fontSizePt: number): { widthPct: number; heightPct: number } {
  return {
    widthPct: Math.min(90, Math.max(4, text.length * APPROX_CHAR_WIDTH_PCT * (fontSizePt / 36))),
    heightPct: Math.max(2, fontSizePt / 24),
  };
}

function PageNumbersIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <rect x="6" y="5" width="20" height="24" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <text x="16" y="24" textAnchor="middle" fontSize="7" fill="currentColor" stroke="none">12</text>
    </svg>
  );
}

export default function PageNumbersTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);

  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageImageUrl, setPageImageUrl] = useState("");
  const [pageDisplaySize, setPageDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState("");

  const [config, setConfig] = useState<PageNumbersConfig>(createDefaultPageNumbersConfig());
  const [pageRangeInput, setPageRangeInput] = useState("");
  const [pageRangeError, setPageRangeError] = useState("");

  const [isExporting, setIsExporting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("lumeo-page-numbers.pdf");
  const [outputName, setOutputName] = useState("lumeo-page-numbers.pdf");

  const pageImageUrlRef = useRef("");
  const downloadUrlRef = useRef("");
  const pdfJsDocRef = useRef<PDFDocumentProxy | null>(null);
  const [docReady, setDocReady] = useState(0);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const result = track({ eventName: "tool_opened", toolSlug: "page-numbers" });
    if (result.accepted) openedTrackedRef.current = true;
  }, [availability, track]);

  useEffect(() => {
    return () => {
      if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      void (pdfJsDocRef.current as (PDFDocumentProxy & { destroy?: () => Promise<void> | void }) | null)?.destroy?.();
    };
  }, []);

  // Same cleanup an unmount already does, plus a full reset of every piece
  // of state a new upload doesn't already reinitialize -- returns to the
  // upload screen ready for a different file immediately.
  function resetTool() {
    resetPdfPreviewState({ pageImageUrlRef, downloadUrlRef, pdfJsDocRef, setDocReady });
    setPdf(null);
    setPageIndex(0);
    setPageImageUrl("");
    setPageDisplaySize(null);
    setError("");
    setConfig(createDefaultPageNumbersConfig());
    setPageRangeInput("");
    setPageRangeError("");
    setDownloadUrl("");
    setOutputName("lumeo-page-numbers.pdf");
  }

  // Any export-affecting config change invalidates the previous export --
  // the downloaded file no longer matches the current settings.
  useEffect(() => {
    if (!downloadUrlRef.current) return;
    URL.revokeObjectURL(downloadUrlRef.current);
    downloadUrlRef.current = "";
    setDownloadUrl("");
  }, [config]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const previousDoc = pdfJsDocRef.current;
      pdfJsDocRef.current = null;
      setDocReady(0);
      if (previousDoc) void (previousDoc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();

      if (!pdf) return;
      try {
        const doc = await openPdfJsDocument(new Uint8Array(copyArrayBuffer(pdf.bytes)));
        if (cancelled) {
          void (doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
          return;
        }
        pdfJsDocRef.current = doc;
        setDocReady((current) => current + 1);
      } catch {
        setError("This file could not be read for preview.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  useEffect(() => {
    if (!pdf || !pdfJsDocRef.current) return;
    const doc = pdfJsDocRef.current;
    let cancelled = false;

    void (async () => {
      setPageLoading(true);
      try {
        const page = await doc.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: PAGE_RENDER_SCALE });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return;
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
        if (cancelled || !blob) return;
        if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
        const url = URL.createObjectURL(blob);
        pageImageUrlRef.current = url;
        setPageImageUrl(url);
        setPageDisplaySize({ width: canvas.width, height: canvas.height });
      } catch {
        setError("This page could not be previewed. Try a different page.");
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex, docReady]);

  async function addFile(files: FileList | File[]) {
    setError("");
    const file = Array.from(files)[0];
    if (!file) return;

    if (!isPdfNamedFile(file)) {
      setError("Please choose a PDF file.");
      return;
    }
    const sizeError = checkPdfFileSize(file);
    if (sizeError) {
      setError(sizeError);
      return;
    }

    try {
      const bytes = await file.arrayBuffer();
      if (!hasPdfMagicBytes(bytes)) {
        setError("This doesn't look like a valid PDF file.");
        return;
      }
      const doc = await openPdfJsDocument(new Uint8Array(copyArrayBuffer(bytes)));
      const pageCount = doc.numPages;
      void (doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();

      const pageCountError = checkPdfPageCount(pageCount);
      if (pageCountError) {
        setError(pageCountError);
        return;
      }

      setPdf({ file, bytes, pageCount });
      setPageIndex(0);
      setConfig(createDefaultPageNumbersConfig());
      setPageRangeInput("");
      setPageRangeError("");
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = "";
      setDownloadUrl("");
    } catch (uploadError) {
      const message =
        uploadError instanceof Error && /password|encrypt/i.test(uploadError.message)
          ? "This file appears to be password-protected or encrypted."
          : "This file could not be read. It may be damaged or password-protected.";
      setError(message);
    }
  }

  function applyCorner(corner: PlacementCorner) {
    setConfig((current) => ({ ...current, placement: { mode: "corner", corner } }));
  }

  function switchToManualPosition() {
    if (config.placement.mode === "manual") return;
    const label = formatPageLabel(config.startNumber, 99, config);
    const size = estimateLabelSizePct(label, config.fontSizePt);
    const anchor = config.placement.mode === "corner"
      ? cornerAnchorPct(config.placement.corner, config.marginPct, size.widthPct, size.heightPct, 0, pageDisplaySize?.width ?? 1, pageDisplaySize?.height ?? 1)
      : { xPct: 50, yPct: 90 };
    setConfig((current) => ({ ...current, placement: { mode: "manual", xPct: anchor.xPct, yPct: anchor.yPct } }));
  }

  function switchToPresetPosition() {
    if (config.placement.mode === "corner") return;
    setConfig((current) => ({ ...current, placement: { mode: "corner", corner: "bottom-center" } }));
  }

  function handlePageRangeInputChange(value: string) {
    setPageRangeInput(value);
    if (!pdf) return;
    if (!value.trim()) {
      setPageRangeError("");
      setConfig((current) => ({ ...current, pageRange: { mode: "all" } }));
      return;
    }
    const pages = parsePageRangeInput(value, pdf.pageCount);
    if (!pages) {
      setPageRangeError("Enter page numbers like 1,3,5-8.");
      return;
    }
    setPageRangeError("");
    setConfig((current) => ({ ...current, pageRange: { mode: "custom", pages } }));
  }

  const generatePageNumberedPdf = useCallback(async () => {
    if (!pdf) return;
    setIsExporting(true);
    setError("");
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "page-numbers" });

    try {
      const { bytes, skippedPages } = await runWithTimeout(
        exportPageNumberedPdf(copyArrayBuffer(pdf.bytes), config),
        "Generating the PDF took too long. Try a smaller page range or file.",
      );
      if (skippedPages.length > 0) {
        setError(`Page${skippedPages.length === 1 ? "" : "s"} ${skippedPages.map((p) => p + 1).join(", ")} could not be numbered and were left unchanged.`);
      }
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "application/pdf" });
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      setDownloadUrl(url);
      setDownloadName(sanitizePdfFileName(outputName));
      track({ eventName: "processing_succeeded", toolSlug: "page-numbers", durationMs: performance.now() - startedAt, success: true });
      recordRecentFile({ tool: "page-numbers", filename: sanitizePdfFileName(outputName), fileSize: blob.size, pageCount: pdf.pageCount });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not add page numbers. Please try again.");
      track({ eventName: "processing_failed", toolSlug: "page-numbers", durationMs: performance.now() - startedAt, success: false, errorCode: "processing_error" });
    } finally {
      setIsExporting(false);
    }
  }, [pdf, config, outputName, track]);

  function downloadPageNumberedPdf() {
    if (!downloadUrl) return;
    track({ eventName: "download_started", toolSlug: "page-numbers" });
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const totalNumberedPages = pdf ? resolvePageIndices(config.pageRange, pdf.pageCount).length : 0;
  const previewLabel = formatPageLabel(config.startNumber, Math.max(totalNumberedPages, config.startNumber), config);
  const estimatedLabelSize = estimateLabelSizePct(previewLabel, config.fontSizePt);

  if (!pdf) {
    return (
      <section className="l2-workspace grid gap-5 pb-4 lg:pb-0">
        <L2WorkspaceHeader title="Page Numbers" description="Add page numbers to a PDF." />

        <div className="aura-glass-regular mx-auto w-full max-w-[720px] rounded-[var(--radius-2xl)] p-2 shadow-[var(--v2-elevation-3)]">
          <L2UploadStage
            inputId="page-numbers-pdf-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · One file"
            multiple={false}
            icon={<PageNumbersIcon />}
            buttonLabel="Select PDF"
            onFilesSelected={(files) => void addFile(files)}
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

  return (
    <section className="l2-workspace-deep grid gap-4 pb-28 lg:pb-6">
      <L2WorkspaceHeader
        title="Page Numbers"
        description={`${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"} · ${formatFileSize(pdf.file.size)}`}
      />

      <L2WorkspaceToolbar>
        <L2ToolbarButton onClick={resetTool}>Start new</L2ToolbarButton>
        <span className="ml-auto text-xs font-bold text-[var(--text-subtle)]">{pdf.file.name}</span>
      </L2WorkspaceToolbar>

      <L2WorkspaceGrid
        main={
          <L2WorkspacePanel>
            <L2FileCard icon={<FileIcon />} name={pdf.file.name} meta={`${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"} · ${formatFileSize(pdf.file.size)}`} />

            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/60 px-3 py-2">
              <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex((c) => Math.max(0, c - 1))} className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40 disabled:opacity-35">
                ← Prev
              </button>
              <span className="text-xs font-semibold text-[var(--text-primary)]/60">Page {pageIndex + 1} of {pdf.pageCount}</span>
              <button type="button" disabled={pageIndex === pdf.pageCount - 1} onClick={() => setPageIndex((c) => Math.min(pdf.pageCount - 1, c + 1))} className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40 disabled:opacity-35">
                Next →
              </button>
            </div>

            <div className="mt-3">
              <L2PanelLabel title="Preview" description="Drag the label or use the position controls to place it." />
            </div>
            {pageLoading || !pageImageUrl || !pageDisplaySize ? (
              <div className="mt-3 flex h-64 items-center justify-center rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/40 text-sm text-[var(--text-primary)]/40">
                Loading page preview...
              </div>
            ) : (
              <div className="mt-3">
                <PageNumberPreview
                  pageImageUrl={pageImageUrl}
                  config={config}
                  labelText={previewLabel}
                  contentWidthPct={estimatedLabelSize.widthPct}
                  contentHeightPct={estimatedLabelSize.heightPct}
                  pageWidthPt={pageDisplaySize.width}
                  pageHeightPt={pageDisplaySize.height}
                  onPositionChange={(position) => {
                    const allowOverflow = config.placement.mode === "manual" ? (config.placement.allowOverflow ?? false) : false;
                    setConfig((current) => ({ ...current, placement: { mode: "manual", xPct: position.xPct, yPct: position.yPct, allowOverflow } }));
                  }}
                />
              </div>
            )}

            {error ? (
              <div role="alert" className="mt-3 rounded-lg border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
                {error}
              </div>
            ) : null}
          </L2WorkspacePanel>
        }
        inspector={
          <L2WorkspaceInspector title="Page Numbers" description="Configure format and placement, then export.">
            <div className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">Format</span>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Number format">
                {NUMBER_FORMATS.map(([format, example]) => (
                  <button
                    key={format}
                    type="button"
                    aria-pressed={config.numberFormat === format}
                    onClick={() => setConfig((current) => ({ ...current, numberFormat: format }))}
                    title={example}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${config.numberFormat === format ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10 text-[var(--text-primary)]" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60"}`}
                  >
                    {example}
                  </button>
                ))}
              </div>
              <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
                Numeral style
                <select
                  value={config.numeralStyle}
                  onChange={(e) => setConfig((current) => ({ ...current, numeralStyle: e.target.value as NumeralStyle }))}
                  className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm"
                >
                  {NUMERAL_STYLES.map(([style, example]) => (
                    <option key={style} value={style}>{example}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
                  Prefix
                  <input
                    value={config.prefix}
                    onChange={(e) => setConfig((current) => ({ ...current, prefix: e.target.value }))}
                    className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
                  Suffix
                  <input
                    value={config.suffix}
                    onChange={(e) => setConfig((current) => ({ ...current, suffix: e.target.value }))}
                    className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Start number
                <input
                  type="number"
                  min={0}
                  value={config.startNumber}
                  onChange={(e) => setConfig((current) => ({ ...current, startNumber: Number(e.target.value) || 1 }))}
                  className="w-16 rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1 text-right"
                />
              </label>
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Skip first page
                <input
                  type="checkbox"
                  checked={config.skipFirstPage}
                  onChange={(e) => setConfig((current) => ({ ...current, skipFirstPage: e.target.checked }))}
                />
              </label>
            </div>

            <div className="grid gap-2 border-t border-[var(--text-primary)]/10 pt-3">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">Text style</span>
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Font size
                <input
                  type="number"
                  min={6}
                  max={72}
                  value={config.fontSizePt}
                  onChange={(e) => setConfig((current) => ({ ...current, fontSizePt: Number(e.target.value) || current.fontSizePt }))}
                  className="w-16 rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1 text-right"
                />
              </label>
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Color
                <input
                  type="color"
                  value={config.color}
                  onChange={(e) => setConfig((current) => ({ ...current, color: e.target.value }))}
                  className="h-7 w-10 rounded border border-[var(--text-primary)]/14"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={config.bold}
                  onClick={() => setConfig((current) => ({ ...current, bold: !current.bold }))}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${config.bold ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}
                >
                  Bold
                </button>
                <button
                  type="button"
                  aria-pressed={config.italic}
                  onClick={() => setConfig((current) => ({ ...current, italic: !current.italic }))}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs italic transition ${config.italic ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}
                >
                  Italic
                </button>
              </div>
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Opacity
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={config.opacity}
                  onChange={(e) => setConfig((current) => ({ ...current, opacity: Number(e.target.value) }))}
                  className="w-24"
                />
              </label>
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Margin
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={1}
                  value={config.marginPct}
                  onChange={(e) => setConfig((current) => ({ ...current, marginPct: Number(e.target.value) }))}
                  className="w-24"
                />
              </label>
            </div>

            <div className="grid gap-2 border-t border-[var(--text-primary)]/10 pt-3">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">Placement</span>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Placement mode">
                <button
                  type="button"
                  aria-pressed={config.placement.mode === "corner"}
                  onClick={switchToPresetPosition}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${config.placement.mode === "corner" ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60"}`}
                >
                  Preset Position
                </button>
                <button
                  type="button"
                  aria-pressed={config.placement.mode === "manual"}
                  onClick={switchToManualPosition}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${config.placement.mode === "manual" ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60"}`}
                >
                  Manual Position
                </button>
              </div>
              {config.placement.mode === "corner" ? (
                <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Corner preset">
                  {CORNER_PRESETS.map(([corner, label]) => (
                    <button
                      key={corner}
                      type="button"
                      aria-pressed={config.placement.mode === "corner" && config.placement.corner === corner}
                      aria-label={label}
                      title={label}
                      onClick={() => applyCorner(corner)}
                      className="rounded-lg border border-[var(--text-primary)]/12 px-2 py-1.5 text-[11px] font-semibold text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
                    X Position (pt)
                    <input
                      type="number"
                      step="0.1"
                      value={config.placement.mode === "manual" ? pctToPoints(config.placement.xPct, pageDisplaySize?.width ?? 0).toFixed(1) : "0"}
                      onChange={(e) => {
                        const entered = Number(e.target.value);
                        if (!Number.isFinite(entered) || config.placement.mode !== "manual") return;
                        const xPct = pointsToPct(entered, pageDisplaySize?.width ?? 0);
                        setConfig((current) => ({ ...current, placement: { mode: "manual", xPct, yPct: current.placement.mode === "manual" ? current.placement.yPct : 0 } }));
                      }}
                      className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
                    Y Position (pt)
                    <input
                      type="number"
                      step="0.1"
                      value={config.placement.mode === "manual" ? pctToPoints(config.placement.yPct, pageDisplaySize?.height ?? 0).toFixed(1) : "0"}
                      onChange={(e) => {
                        const entered = Number(e.target.value);
                        if (!Number.isFinite(entered) || config.placement.mode !== "manual") return;
                        const yPct = pointsToPct(entered, pageDisplaySize?.height ?? 0);
                        setConfig((current) => ({ ...current, placement: { mode: "manual", xPct: current.placement.mode === "manual" ? current.placement.xPct : 0, yPct } }));
                      }}
                      className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="grid gap-2 border-t border-[var(--text-primary)]/10 pt-3">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">Pages</span>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  ["all", "All"],
                  ["first", "First"],
                  ["odd", "Odd"],
                  ["even", "Even"],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setPageRangeInput("");
                      setPageRangeError("");
                      setConfig((current) => ({ ...current, pageRange: { mode } }));
                    }}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${config.pageRange.mode === mode ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                value={pageRangeInput}
                onChange={(e) => handlePageRangeInputChange(e.target.value)}
                placeholder="Custom range, e.g. 1,3,5-8"
                className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-xs"
              />
              {pageRangeError ? <p className="text-[11px] text-[var(--text-danger)]">{pageRangeError}</p> : null}
            </div>

            <div className="mt-3 border-t border-[var(--text-primary)]/10 pt-3">
              <label className="block rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/50 p-2.5">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">File name</span>
                <input
                  value={outputName}
                  onChange={(e) => {
                    setOutputName(e.target.value);
                    setDownloadUrl("");
                  }}
                  className="mt-1.5 w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-primary)]/26 focus:border-b-[var(--lumeo-gold)]/45"
                  placeholder="lumeo-page-numbers.pdf"
                />
              </label>
            </div>
          </L2WorkspaceInspector>
        }
      />

      <ToolActionBar>
        {downloadUrl ? (
          <button
            type="button"
            onClick={downloadPageNumberedPdf}
            className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98] sm:w-auto"
          >
            Download numbered PDF
          </button>
        ) : (
          <button
            type="button"
            disabled={isExporting || !!pageRangeError}
            onClick={() => void generatePageNumberedPdf()}
            className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-[var(--v2-interactive-disabled-opacity)] active:scale-[0.98] sm:w-auto"
          >
            {isExporting ? "Adding page numbers..." : "Add Page Numbers"}
          </button>
        )}
      </ToolActionBar>

      <L2PrivacyNote />
    </section>
  );
}
