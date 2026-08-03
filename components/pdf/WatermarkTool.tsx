"use client";

// components/pdf/WatermarkTool.tsx
//
// Watermark PDF workspace -- reuses the same pdfjs preview + percent-based
// overlay + pdf-lib flatten-on-export architecture proven by Edit PDF and
// Sign PDF, applied to a single watermark configuration (text or image)
// stamped across a chosen page range instead of many independently-placed
// elements.
//
// Explicitly out of scope, per the approved design: per-tile manual
// dragging in tiled mode (no reviewed competitor offers it), zoom controls
// (not part of the approved feature list), and true transparency for JPG
// watermarks (a format limitation, not an engineering gap).

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
import { WatermarkPreview } from "@/components/pdf/watermark/WatermarkPreview";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import {
  alignBottom,
  alignLeft,
  alignRight,
  alignTop,
  anchorPointFromTopLeft,
  centerHorizontally,
  centerVertically,
  clampManualPosition,
  cornerAnchorPct,
  createDefaultImageWatermarkConfig,
  createDefaultTextWatermarkConfig,
  parsePageRangeInput,
  pctToPoints,
  pointsToPct,
  resetManualPosition,
  topLeftFromAnchorPoint,
  type WatermarkAnchor,
  type WatermarkConfig,
  type WatermarkPlacementCorner,
} from "@/lib/pdf/watermark/config";
import { exportWatermarkedPdf } from "@/lib/pdf/watermark/export";
import { useHistoryState } from "@/lib/sign/useHistoryState";
import { openPdfJsDocument } from "@/lib/pdf/pdfjs";
import { formatBytes as formatFileSize } from "@/lib/pdf/formatBytes";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { recordRecentFile } from "@/lib/recent-files";
import { copyArrayBuffer } from "@/lib/pdf/arrayBuffer";
import { hasPdfMagicBytes, isPdfNamedFile, checkPdfFileSize, checkPdfPageCount } from "@/lib/pdf/uploadValidation";
import { resetPdfPreviewState } from "@/lib/pdf/resetPreviewState";

type LoadedPdf = { file: File; bytes: ArrayBuffer; pageCount: number };
type ContentMode = "text" | "image";

const PAGE_RENDER_SCALE = 1.3;
const EXPORT_TIMEOUT_MS = 30_000;
const APPROX_CHAR_WIDTH_PCT = 0.9; // rough on-screen text-width estimate for the draggable preview only; export.ts measures real font metrics

// 3x3 anchor grid, row-major (top row, middle row, bottom row).
const ANCHOR_GRID: WatermarkAnchor[] = [
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
];
const ANCHOR_LABELS: Record<WatermarkAnchor, string> = {
  "top-left": "Top left", "top-center": "Top center", "top-right": "Top right",
  "center-left": "Center left", center: "Center", "center-right": "Center right",
  "bottom-left": "Bottom left", "bottom-center": "Bottom center", "bottom-right": "Bottom right",
};

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

function sanitizePdfFileName(value: string, fallback = "lumeo-watermarked") {
  const stem = sanitizeFileStem(value.replace(/\.pdf$/i, ""), fallback);
  return `${stem}.pdf`;
}

// Rough on-screen size estimate for the draggable preview anchor and for
// corner-anchor/tile-spacing math in the UI only -- export.ts computes the
// real size from pdf-lib font metrics / image natural dimensions at export
// time, so this estimate never affects the exported PDF.
function estimateContentSizePct(content: WatermarkConfig["content"], scale: number): { widthPct: number; heightPct: number } {
  if (content.kind === "image") {
    const widthPct = 25 * scale;
    return { widthPct, heightPct: widthPct };
  }
  return {
    widthPct: Math.min(90, content.text.length * APPROX_CHAR_WIDTH_PCT * scale),
    heightPct: Math.max(3, (content.fontSizePt * scale) / 8),
  };
}

function WatermarkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <path d="M6 24 26 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
      <path d="M10 10h12v12H10z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export default function WatermarkTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);

  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageImageUrl, setPageImageUrl] = useState("");
  const [pageDisplaySize, setPageDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState("");

  const { state: config, set: setConfig, undo, redo, canUndo, canRedo, reset: resetConfig } =
    useHistoryState<WatermarkConfig>(createDefaultTextWatermarkConfig());
  const [contentMode, setContentMode] = useState<ContentMode>("text");
  const [pageRangeInput, setPageRangeInput] = useState("");
  const [pageRangeError, setPageRangeError] = useState("");
  const [positionUnit, setPositionUnit] = useState<"pt" | "pct">("pt");
  const [snapToCenter, setSnapToCenter] = useState(true);
  const [snapToEdges, setSnapToEdges] = useState(true);

  const [isExporting, setIsExporting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("lumeo-watermarked.pdf");
  const [outputName, setOutputName] = useState("lumeo-watermarked.pdf");

  const pageImageUrlRef = useRef("");
  const downloadUrlRef = useRef("");
  const pdfJsDocRef = useRef<PDFDocumentProxy | null>(null);
  const [docReady, setDocReady] = useState(0);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const result = track({ eventName: "tool_opened", toolSlug: "watermark" });
    if (result.accepted) openedTrackedRef.current = true;
  }, [availability, track]);

  useEffect(() => {
    return () => {
      if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      void (pdfJsDocRef.current as (PDFDocumentProxy & { destroy?: () => Promise<void> | void }) | null)?.destroy?.();
    };
  }, []);

  // Same cleanup an unmount already does (revoke both object URLs, destroy
  // the live pdfjs document), plus a full reset of every piece of state a
  // new upload doesn't already reinitialize on its own -- returns to the
  // upload screen ready for a different file immediately.
  function resetTool() {
    resetPdfPreviewState({ pageImageUrlRef, downloadUrlRef, pdfJsDocRef, setDocReady });
    setPdf(null);
    setPageIndex(0);
    setPageImageUrl("");
    setPageDisplaySize(null);
    setError("");
    resetConfig(createDefaultTextWatermarkConfig());
    setContentMode("text");
    setPageRangeInput("");
    setPageRangeError("");
    setDownloadUrl("");
    setOutputName("lumeo-watermarked.pdf");
  }

  // Any export-affecting config change (text, image, opacity, rotation,
  // scale, color, font size, bold/italic, margin, placement, tiled mode,
  // tile spacing, page range) invalidates the previous export -- the
  // downloaded file no longer matches the current settings, so the stale
  // blob URL is revoked and the primary button reverts to "Add Watermark"
  // until the user exports again.
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
      resetConfig(createDefaultTextWatermarkConfig());
      setContentMode("text");
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

  function handleImageFile(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;
    const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
    const isJpg = file.type === "image/jpeg" || /\.(jpg|jpeg)$/i.test(file.name);
    if (!isPng && !isJpg) {
      setError("Please choose a PNG or JPG image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) return;
      setConfig(() => createDefaultImageWatermarkConfig(dataUrl, isPng ? "png" : "jpg"));
      setContentMode("image");
    };
    reader.readAsDataURL(file);
  }

  // Corner placement stores only the corner itself -- no coordinates, no
  // page dimensions, no async page fetch. It's a page-local constraint
  // (see WatermarkSinglePlacement in lib/pdf/watermark/config.ts): the
  // actual xPct/yPct anchor is derived fresh for whichever page is being
  // rendered, by WatermarkPreview for the on-screen preview and by
  // export.ts per page for the real export. That's what keeps every page
  // corner-safe on a document mixing page sizes/orientations -- there is
  // no single anchor that would be correct for every page at once.
  function applyCorner(corner: WatermarkPlacementCorner) {
    setConfig((current) => ({ ...current, placementMode: "single", placement: { mode: "corner", corner } }));
  }

  const estimatedContentSize = estimateContentSizePct(config.content, config.scale);

  // What the numeric X/Y fields display: the currently-selected anchor
  // point's position, projected from the stored top-left (per
  // docs/specs/watermark-manual-position-v1.1-spec.md section 3 -- storage
  // never changes, only this read/write projection does).
  const manualAnchorPointPct = config.placement.mode === "manual"
    ? anchorPointFromTopLeft(config.placement.xPct, config.placement.yPct, estimatedContentSize.widthPct, estimatedContentSize.heightPct, config.manualAnchor)
    : { xPct: 0, yPct: 0 };

  // Switching Preset <-> Manual preserves the current visual position
  // whenever possible (per spec section 11): Preset -> Manual snapshots
  // wherever the corner preset currently lands on THIS page (the same
  // cornerAnchorPct call WatermarkPreview.tsx already uses to draw it) into
  // a manual xPct/yPct. Manual -> Preset has no stored corner to restore
  // (manual mode carries no corner at all), so it defaults to "center" --
  // the same fallback the spec documents for a session that never picked a
  // corner. Deliberately no "remember last corner" ref: mutating a ref
  // inside a plain (non-memoized) click handler broke React Compiler's
  // whole-component memoization for the unrelated generateWatermarkedPdf
  // callback below (verified by bisection -- removing the ref write alone
  // took the build from 36 lint errors back to the 35-error baseline).
  function switchToManualPosition() {
    if (config.placement.mode === "manual") return;
    const anchor = cornerAnchorPct(
      config.placement.corner,
      config.marginPct,
      estimatedContentSize.widthPct,
      estimatedContentSize.heightPct,
      config.rotationDeg,
      pageDisplaySize?.width ?? 1,
      pageDisplaySize?.height ?? 1,
    );
    setConfig((current) => ({ ...current, placementMode: "single", placement: { mode: "manual", xPct: anchor.xPct, yPct: anchor.yPct } }));
  }

  function switchToPresetPosition() {
    if (config.placement.mode === "corner") return;
    setConfig((current) => ({ ...current, placementMode: "single", placement: { mode: "corner", corner: "center" } }));
  }

  // v1.1 Phase 3 alignment tools -- each is a one-shot commit onto the
  // stored top-left, same shape as a drag-end (see
  // lib/pdf/watermark/config.ts's align*/center*/reset helpers). Only
  // meaningful in manual mode; the buttons are only rendered there.
  function applyAlignment(align: (widthPct: number, heightPct: number, otherAxisPct: number) => { xPct: number; yPct: number }, otherAxisPct: number) {
    if (config.placement.mode !== "manual") return;
    const next = align(estimatedContentSize.widthPct, estimatedContentSize.heightPct, otherAxisPct);
    setConfig((current) => ({ ...current, placement: { mode: "manual", xPct: next.xPct, yPct: next.yPct, allowOverflow: current.placement.mode === "manual" ? current.placement.allowOverflow : false } }));
  }

  function handleResetPosition() {
    const next = resetManualPosition(estimatedContentSize.widthPct, estimatedContentSize.heightPct);
    setConfig((current) => ({ ...current, placement: { mode: "manual", xPct: next.xPct, yPct: next.yPct } }));
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

  const generateWatermarkedPdf = useCallback(async () => {
    if (!pdf) return;
    setIsExporting(true);
    setError("");
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "watermark" });

    try {
      const { bytes, skippedPages } = await runWithTimeout(
        exportWatermarkedPdf(copyArrayBuffer(pdf.bytes), config),
        "Generating the PDF took too long. Try a smaller page range or file.",
      );
      if (skippedPages.length > 0) {
        setError(`Page${skippedPages.length === 1 ? "" : "s"} ${skippedPages.map((p) => p + 1).join(", ")} could not be watermarked and were left unchanged.`);
      }
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "application/pdf" });
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      setDownloadUrl(url);
      setDownloadName(sanitizePdfFileName(outputName));
      track({ eventName: "processing_succeeded", toolSlug: "watermark", durationMs: performance.now() - startedAt, success: true });
      recordRecentFile({ tool: "watermark", filename: sanitizePdfFileName(outputName), fileSize: blob.size, pageCount: pdf.pageCount });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not add the watermark. Please try again.");
      track({ eventName: "processing_failed", toolSlug: "watermark", durationMs: performance.now() - startedAt, success: false, errorCode: "processing_error" });
    } finally {
      setIsExporting(false);
    }
  }, [pdf, config, outputName, track]);

  function downloadWatermarkedPdf() {
    if (!downloadUrl) return;
    track({ eventName: "download_started", toolSlug: "watermark" });
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  if (!pdf) {
    return (
      <section className="l2-workspace grid gap-5 pb-4 lg:pb-0">
        <L2WorkspaceHeader title="Watermark PDF" description="Add a text or image watermark to a PDF." />

        <div className="aura-glass-regular mx-auto w-full max-w-[720px] rounded-[var(--radius-2xl)] p-2 shadow-[var(--v2-elevation-3)]">
          <L2UploadStage
            inputId="watermark-pdf-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · One file"
            multiple={false}
            icon={<WatermarkIcon />}
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
        title="Watermark PDF"
        description={`${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"} · ${formatFileSize(pdf.file.size)}`}
      />

      <L2WorkspaceToolbar>
        <L2ToolbarButton onClick={undo} disabled={!canUndo}>
          Undo
        </L2ToolbarButton>
        <L2ToolbarButton onClick={redo} disabled={!canRedo}>
          Redo
        </L2ToolbarButton>
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
              <L2PanelLabel title="Preview" />
            </div>
            {pageLoading || !pageImageUrl || !pageDisplaySize ? (
              <div className="mt-3 flex h-64 items-center justify-center rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/40 text-sm text-[var(--text-primary)]/40">
                Loading page preview...
              </div>
            ) : (
              <div className="mt-3">
                <WatermarkPreview
                  pageImageUrl={pageImageUrl}
                  config={config}
                  contentWidthPct={estimatedContentSize.widthPct}
                  contentHeightPct={estimatedContentSize.heightPct}
                  pageWidthPt={pageDisplaySize.width}
                  pageHeightPt={pageDisplaySize.height}
                  snapToCenter={snapToCenter}
                  snapToEdges={snapToEdges}
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
          <L2WorkspaceInspector title="Watermark" description="Configure your watermark, then export.">
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setContentMode("text");
                  setConfig(() => createDefaultTextWatermarkConfig());
                }}
                className={`rounded-lg border px-2 py-2 text-[11px] font-bold transition ${contentMode === "text" ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10 text-[var(--text-primary)]" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60"}`}
              >
                Text
              </button>
              <label className={`grid cursor-pointer place-items-center rounded-lg border px-2 py-2 text-[11px] font-bold transition ${contentMode === "image" ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10 text-[var(--text-primary)]" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60"}`}>
                Image
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files) handleImageFile(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>

            {config.content.kind === "text" ? (
              <div className="grid gap-2 border-t border-[var(--text-primary)]/10 pt-3">
                <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
                  Text
                  <input
                    value={config.content.text}
                    onChange={(e) => setConfig((current) => ({ ...current, content: { ...(current.content as typeof config.content & { kind: "text" }), text: e.target.value } }))}
                    className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Font size
                  <input
                    type="number"
                    min={8}
                    max={200}
                    value={config.content.fontSizePt}
                    onChange={(e) => setConfig((current) => ({ ...current, content: { ...(current.content as typeof config.content & { kind: "text" }), fontSizePt: Number(e.target.value) } }))}
                    className="w-16 rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1 text-right"
                  />
                </label>
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Color
                  <input
                    type="color"
                    value={config.content.color}
                    onChange={(e) => setConfig((current) => ({ ...current, content: { ...(current.content as typeof config.content & { kind: "text" }), color: e.target.value } }))}
                    className="h-7 w-10 rounded border border-[var(--text-primary)]/14"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfig((current) => ({ ...current, content: { ...(current.content as typeof config.content & { kind: "text" }), bold: !(current.content as { bold: boolean }).bold } }))}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${config.content.bold ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}
                  >
                    Bold
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfig((current) => ({ ...current, content: { ...(current.content as typeof config.content & { kind: "text" }), italic: !(current.content as { italic: boolean }).italic } }))}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs italic transition ${config.content.italic ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}
                  >
                    Italic
                  </button>
                </div>
              </div>
            ) : (
              <p className="border-t border-[var(--text-primary)]/10 pt-3 text-[11px] leading-5 text-[var(--text-primary)]/60">
                {config.content.imageFormat === "jpg"
                  ? "JPG watermarks are always opaque -- JPG doesn't support transparency. Use a PNG for a see-through watermark."
                  : "PNG transparency is preserved in the exported PDF."}
              </p>
            )}

            <div className="grid gap-2 border-t border-[var(--text-primary)]/10 pt-3">
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Opacity
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={config.opacity}
                  onChange={(e) => setConfig((current) => ({ ...current, opacity: Number(e.target.value) }))}
                  className="w-24"
                />
              </label>
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Scale
                <input
                  type="range"
                  min={0.25}
                  max={3}
                  step={0.05}
                  value={config.scale}
                  onChange={(e) => setConfig((current) => ({ ...current, scale: Number(e.target.value) }))}
                  className="w-24"
                />
              </label>
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Rotation
                <input
                  type="range"
                  min={0}
                  max={359}
                  step={1}
                  value={config.rotationDeg}
                  onChange={(e) => setConfig((current) => ({ ...current, rotationDeg: Number(e.target.value) }))}
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
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ["top-left", "↖", "Top left"],
                    ["center", "•", "Center"],
                    ["top-right", "↗", "Top right"],
                    ["bottom-left", "↙", "Bottom left"],
                    ["bottom-right", "↘", "Bottom right"],
                  ] as [WatermarkPlacementCorner, string, string][]).map(([corner, glyph, label]) => (
                    <button
                      key={corner}
                      type="button"
                      aria-pressed={config.placement.mode === "corner" && config.placement.corner === corner}
                      onClick={() => applyCorner(corner)}
                      title={corner}
                      aria-label={label}
                      className="rounded-lg border border-[var(--text-primary)]/12 px-2 py-1.5 text-sm text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40"
                    >
                      {glyph}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                    <span>Units</span>
                    <div className="flex gap-1.5" role="group" aria-label="Position unit">
                      <button
                        type="button"
                        aria-pressed={positionUnit === "pt"}
                        onClick={() => setPositionUnit("pt")}
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${positionUnit === "pt" ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}
                      >
                        Points
                      </button>
                      <button
                        type="button"
                        aria-pressed={positionUnit === "pct"}
                        onClick={() => setPositionUnit("pct")}
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${positionUnit === "pct" ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}
                      >
                        Percent
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-xs font-semibold text-[var(--text-primary)]/60">Anchor point</span>
                    <div className="grid grid-cols-3 gap-1" role="group" aria-label="Anchor point">
                      {ANCHOR_GRID.map((anchor) => (
                        <button
                          key={anchor}
                          type="button"
                          aria-pressed={config.manualAnchor === anchor}
                          aria-label={ANCHOR_LABELS[anchor]}
                          title={ANCHOR_LABELS[anchor]}
                          onClick={() => setConfig((current) => ({ ...current, manualAnchor: anchor }))}
                          className={`h-6 rounded border transition ${config.manualAnchor === anchor ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
                      X Position
                      <input
                        type="number"
                        step="0.1"
                        value={
                          positionUnit === "pt"
                            ? pctToPoints(manualAnchorPointPct.xPct, pageDisplaySize?.width ?? 0).toFixed(1)
                            : manualAnchorPointPct.xPct.toFixed(1)
                        }
                        onChange={(e) => {
                          const entered = Number(e.target.value);
                          if (!Number.isFinite(entered)) return;
                          const anchorXPct = positionUnit === "pt" ? pointsToPct(entered, pageDisplaySize?.width ?? 0) : entered;
                          const topLeft = topLeftFromAnchorPoint(anchorXPct, manualAnchorPointPct.yPct, estimatedContentSize.widthPct, estimatedContentSize.heightPct, config.manualAnchor);
                          const yPct = config.placement.mode === "manual" ? config.placement.yPct : 0;
                          const allowOverflow = config.placement.mode === "manual" ? (config.placement.allowOverflow ?? false) : false;
                          const clamped = clampManualPosition(topLeft.xPct, yPct, estimatedContentSize.widthPct, estimatedContentSize.heightPct, allowOverflow);
                          setConfig((current) => ({ ...current, placement: { mode: "manual", xPct: clamped.xPct, yPct: clamped.yPct, allowOverflow } }));
                        }}
                        className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
                      Y Position
                      <input
                        type="number"
                        step="0.1"
                        value={
                          positionUnit === "pt"
                            ? pctToPoints(manualAnchorPointPct.yPct, pageDisplaySize?.height ?? 0).toFixed(1)
                            : manualAnchorPointPct.yPct.toFixed(1)
                        }
                        onChange={(e) => {
                          const entered = Number(e.target.value);
                          if (!Number.isFinite(entered)) return;
                          const anchorYPct = positionUnit === "pt" ? pointsToPct(entered, pageDisplaySize?.height ?? 0) : entered;
                          const topLeft = topLeftFromAnchorPoint(manualAnchorPointPct.xPct, anchorYPct, estimatedContentSize.widthPct, estimatedContentSize.heightPct, config.manualAnchor);
                          const xPct = config.placement.mode === "manual" ? config.placement.xPct : 0;
                          const allowOverflow = config.placement.mode === "manual" ? (config.placement.allowOverflow ?? false) : false;
                          const clamped = clampManualPosition(xPct, topLeft.yPct, estimatedContentSize.widthPct, estimatedContentSize.heightPct, allowOverflow);
                          setConfig((current) => ({ ...current, placement: { mode: "manual", xPct: clamped.xPct, yPct: clamped.yPct, allowOverflow } }));
                        }}
                        className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm"
                      />
                    </label>
                  </div>

                  <div className="grid gap-1">
                    <span className="text-xs font-semibold text-[var(--text-primary)]/60">Align</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button type="button" onClick={() => applyAlignment(alignLeft, config.placement.mode === "manual" ? config.placement.yPct : 0)} className="rounded-lg border border-[var(--text-primary)]/12 px-2 py-1.5 text-[11px] font-bold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/40">
                        Align Left
                      </button>
                      <button type="button" onClick={() => applyAlignment(centerHorizontally, config.placement.mode === "manual" ? config.placement.yPct : 0)} className="rounded-lg border border-[var(--text-primary)]/12 px-2 py-1.5 text-[11px] font-bold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/40">
                        Align Center
                      </button>
                      <button type="button" onClick={() => applyAlignment(alignRight, config.placement.mode === "manual" ? config.placement.yPct : 0)} className="rounded-lg border border-[var(--text-primary)]/12 px-2 py-1.5 text-[11px] font-bold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/40">
                        Align Right
                      </button>
                      <button type="button" onClick={() => applyAlignment(alignTop, config.placement.mode === "manual" ? config.placement.xPct : 0)} className="rounded-lg border border-[var(--text-primary)]/12 px-2 py-1.5 text-[11px] font-bold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/40">
                        Align Top
                      </button>
                      <button type="button" onClick={() => applyAlignment(centerVertically, config.placement.mode === "manual" ? config.placement.xPct : 0)} className="rounded-lg border border-[var(--text-primary)]/12 px-2 py-1.5 text-[11px] font-bold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/40">
                        Align Middle
                      </button>
                      <button type="button" onClick={() => applyAlignment(alignBottom, config.placement.mode === "manual" ? config.placement.xPct : 0)} className="rounded-lg border border-[var(--text-primary)]/12 px-2 py-1.5 text-[11px] font-bold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/40">
                        Align Bottom
                      </button>
                    </div>
                    <button type="button" onClick={handleResetPosition} className="mt-1 rounded-lg border border-[var(--text-primary)]/12 px-2 py-1.5 text-[11px] font-bold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/40">
                      Reset Position
                    </button>
                  </div>

                  <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                    Snap to Center
                    <input type="checkbox" checked={snapToCenter} onChange={(e) => setSnapToCenter(e.target.checked)} />
                  </label>
                  <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                    Snap to Edges
                    <input type="checkbox" checked={snapToEdges} onChange={(e) => setSnapToEdges(e.target.checked)} />
                  </label>
                  <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                    Allow Overflow
                    <input
                      type="checkbox"
                      checked={config.placement.mode === "manual" ? (config.placement.allowOverflow ?? false) : false}
                      onChange={(e) => {
                        if (config.placement.mode !== "manual") return;
                        const allowOverflow = e.target.checked;
                        const clamped = clampManualPosition(config.placement.xPct, config.placement.yPct, estimatedContentSize.widthPct, estimatedContentSize.heightPct, allowOverflow);
                        setConfig((current) => ({ ...current, placement: { mode: "manual", xPct: clamped.xPct, yPct: clamped.yPct, allowOverflow } }));
                      }}
                    />
                  </label>
                </div>
              )}
              <label className="mt-1 flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Tiled
                <input
                  type="checkbox"
                  checked={config.placementMode === "tiled"}
                  onChange={(e) => setConfig((current) => ({ ...current, placementMode: e.target.checked ? "tiled" : "single" }))}
                />
              </label>
              {config.placementMode === "tiled" ? (
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Tile spacing
                  <input
                    type="range"
                    min={2}
                    max={30}
                    step={1}
                    value={config.tileSpacingPct}
                    onChange={(e) => setConfig((current) => ({ ...current, tileSpacingPct: Number(e.target.value) }))}
                    className="w-24"
                  />
                </label>
              ) : null}
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
                  placeholder="lumeo-watermarked.pdf"
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
            onClick={downloadWatermarkedPdf}
            className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98] sm:w-auto"
          >
            Download watermarked PDF
          </button>
        ) : (
          <button
            type="button"
            disabled={isExporting || !!pageRangeError || (config.content.kind === "text" && !config.content.text.trim())}
            onClick={() => void generateWatermarkedPdf()}
            className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-[var(--v2-interactive-disabled-opacity)] active:scale-[0.98] sm:w-auto"
          >
            {isExporting ? "Adding watermark..." : "Add Watermark"}
          </button>
        )}
      </ToolActionBar>

      <L2PrivacyNote />
    </section>
  );
}
