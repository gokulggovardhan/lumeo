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
  L2ActionArea,
  L2FileCard,
  L2ToolMainColumn,
  L2ToolSettingsPanel,
  L2ToolWorkspace,
  L2UploadStage,
} from "@/components/pdf/workspace/ToolWorkspace";
import { WatermarkPreview } from "@/components/pdf/watermark/WatermarkPreview";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import {
  createDefaultImageWatermarkConfig,
  createDefaultTextWatermarkConfig,
  parsePageRangeInput,
  type WatermarkConfig,
  type WatermarkPlacementCorner,
} from "@/lib/pdf/watermark/config";
import { exportWatermarkedPdf } from "@/lib/pdf/watermark/export";
import { useHistoryState } from "@/lib/sign/useHistoryState";
import { openPdfJsDocument } from "@/lib/pdf/pdfjs";
import { formatBytes as formatFileSize } from "@/lib/pdf/formatBytes";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { copyArrayBuffer } from "@/lib/pdf/arrayBuffer";
import { hasPdfMagicBytes, isPdfNamedFile, checkPdfFileSize, checkPdfPageCount } from "@/lib/pdf/uploadValidation";

type LoadedPdf = { file: File; bytes: ArrayBuffer; pageCount: number };
type ContentMode = "text" | "image";

const PAGE_RENDER_SCALE = 1.3;
const EXPORT_TIMEOUT_MS = 30_000;
const APPROX_CHAR_WIDTH_PCT = 0.9; // rough on-screen text-width estimate for the draggable preview only; export.ts measures real font metrics

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

  const estimatedContentSize = estimateContentSizePct(config.content, config.scale);

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
      <section className="l2-tool-empty-state grid gap-4 pb-4 lg:pb-0">
        <div className="mx-auto w-full max-w-[1040px]">
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
        {error ? (
          <div role="alert" className="mt-4 rounded-lg border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
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
          <section className="rounded-xl border border-[var(--text-primary)]/12 bg-gradient-to-br from-[var(--atelier-surface-3)] via-[var(--atelier-surface-2)] to-[var(--atelier-surface-1)] p-3 shadow-2xl shadow-black/28">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <L2FileCard icon={<FileIcon />} name={pdf.file.name} meta={`${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"} · ${formatFileSize(pdf.file.size)}`} />
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24 disabled:opacity-30">
                  Undo
                </button>
                <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24 disabled:opacity-30">
                  Redo
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/60 px-3 py-2">
              <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex((c) => Math.max(0, c - 1))} className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40 disabled:opacity-35">
                ← Prev
              </button>
              <span className="text-xs font-semibold text-[var(--text-primary)]/60">Page {pageIndex + 1} of {pdf.pageCount}</span>
              <button type="button" disabled={pageIndex === pdf.pageCount - 1} onClick={() => setPageIndex((c) => Math.min(pdf.pageCount - 1, c + 1))} className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40 disabled:opacity-35">
                Next →
              </button>
            </div>
          </section>

          <section className="mt-3 rounded-xl border border-[var(--text-primary)]/12 bg-gradient-to-br from-[var(--atelier-surface-3)] via-[var(--atelier-surface-2)] to-[var(--atelier-surface-1)] p-3.5 shadow-2xl shadow-black/24">
            {pageLoading || !pageImageUrl || !pageDisplaySize ? (
              <div className="flex h-64 items-center justify-center rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/40 text-sm text-[var(--text-primary)]/40">
                Loading page preview...
              </div>
            ) : (
              <WatermarkPreview
                pageImageUrl={pageImageUrl}
                config={config}
                contentWidthPct={estimatedContentSize.widthPct}
                contentHeightPct={estimatedContentSize.heightPct}
                pageWidthPt={pageDisplaySize.width}
                pageHeightPt={pageDisplaySize.height}
                onPositionChange={(position) => setConfig((current) => ({ ...current, placement: { mode: "manual", xPct: position.xPct, yPct: position.yPct } }))}
              />
            )}
          </section>

          {error ? (
            <div role="alert" className="mt-3 rounded-lg border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
              {error}
            </div>
          ) : null}
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="Watermark" description="Configure your watermark, then export.">
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
            <div className="grid grid-cols-2 gap-1.5">
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
                    onClick={() => applyCorner(corner)}
                    title={corner}
                    aria-label={label}
                    className="rounded-lg border border-[var(--text-primary)]/12 px-2 py-1.5 text-sm text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40"
                  >
                    {glyph}
                  </button>
                ))}
              </div>
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

            <div className="mt-auto border-t border-[var(--text-primary)]/10 pt-3">
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

              <div className="mt-3">
                {downloadUrl ? (
                  <L2ActionArea
                    primary={
                      <button type="button" onClick={downloadWatermarkedPdf} className="lumeo-primary-action w-full rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)]">
                        Download watermarked PDF
                      </button>
                    }
                  />
                ) : (
                  <L2ActionArea
                    primary={
                      <button
                        type="button"
                        disabled={isExporting || !!pageRangeError || (config.content.kind === "text" && !config.content.text.trim())}
                        onClick={() => void generateWatermarkedPdf()}
                        className="lumeo-primary-action w-full rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isExporting ? "Adding watermark..." : "Add Watermark"}
                      </button>
                    }
                  />
                )}
              </div>
            </div>
          </div>
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>
    </section>
  );
}
