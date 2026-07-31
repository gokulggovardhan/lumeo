"use client";

// components/pdf/CropPdfTool.tsx
//
// Crop PDF workspace -- reuses the same pdfjs preview + percent-based
// overlay + pdf-lib flatten-on-export architecture proven by Watermark
// PDF (see docs/specs/crop-pdf-spec.md), applied to a single rectangular
// crop region stamped across a chosen page scope instead of a watermark.
//
// Per Watermark PDF v1.0.0's core lesson (see
// docs/specs/watermark-pdf-v1-freeze.md): the crop rect is always
// percent-of-visual-page, converted to native page space fresh, per page,
// inside lib/pdf/crop/export.ts's own loop -- never precomputed once
// against whichever page is on screen and reused across a document
// mixing page sizes/orientations.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2ActionArea,
  L2FileCard,
  L2PrivacyNote,
  L2ToolMainColumn,
  L2ToolSettingsPanel,
  L2ToolWorkspace,
  L2UploadStage,
} from "@/components/pdf/workspace/ToolWorkspace";
import { CropRectView } from "@/components/pdf/crop/CropRectView";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import {
  applyAspectPreset,
  centerCropRect,
  clampCropRect,
  createDefaultCropConfig,
  DEFAULT_CROP_RECT,
  ENTIRE_PAGE_RECT,
  isCropRectValid,
  type CropAspectPreset,
  type CropConfig,
} from "@/lib/pdf/crop/config";
import { exportCroppedPdf } from "@/lib/pdf/crop/export";
import { useHistoryState } from "@/lib/sign/useHistoryState";
import { openPdfJsDocument } from "@/lib/pdf/pdfjs";
import { formatBytes as formatFileSize } from "@/lib/pdf/formatBytes";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { recordRecentFile } from "@/lib/recent-files";
import { copyArrayBuffer } from "@/lib/pdf/arrayBuffer";
import { hasPdfMagicBytes, isPdfNamedFile, checkPdfFileSize, checkPdfPageCount } from "@/lib/pdf/uploadValidation";

type LoadedPdf = { file: File; bytes: ArrayBuffer; pageCount: number };

const PAGE_RENDER_SCALE = 1.3;
const EXPORT_TIMEOUT_MS = 30_000;

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

function sanitizePdfFileName(value: string, fallback = "lumeo-cropped") {
  const stem = sanitizeFileStem(value.replace(/\.pdf$/i, ""), fallback);
  return `${stem}.pdf`;
}

const ASPECT_PRESETS: Array<[CropAspectPreset, string]> = [
  ["free", "Free"],
  ["1:1", "1:1"],
  ["4:3", "4:3"],
  ["16:9", "16:9"],
  ["a4", "A4"],
  ["letter", "Letter"],
];

function CropIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <path d="M10 6v16a2 2 0 0 0 2 2h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M22 26V10a2 2 0 0 0-2-2H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function CropPdfTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);

  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageImageUrl, setPageImageUrl] = useState("");
  const [pageDisplaySize, setPageDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState("");

  const { state: config, set: setConfig, undo, redo, canUndo, canRedo, reset: resetConfig } =
    useHistoryState<CropConfig>(createDefaultCropConfig());
  const [scopeInput, setScopeInput] = useState("");
  const [scopeError, setScopeError] = useState("");
  const [lockAspectRatio, setLockAspectRatio] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("lumeo-cropped.pdf");
  const [outputName, setOutputName] = useState("lumeo-cropped.pdf");

  const pageImageUrlRef = useRef("");
  const downloadUrlRef = useRef("");
  const pdfJsDocRef = useRef<PDFDocumentProxy | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [docReady, setDocReady] = useState(0);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const result = track({ eventName: "tool_opened", toolSlug: "crop" });
    if (result.accepted) openedTrackedRef.current = true;
  }, [availability, track]);

  useEffect(() => {
    return () => {
      if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      void (pdfJsDocRef.current as (PDFDocumentProxy & { destroy?: () => Promise<void> | void }) | null)?.destroy?.();
    };
  }, []);

  // Any config change invalidates the previous export -- same
  // stale-download-reset pattern WatermarkTool.tsx established.
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
      resetConfig(createDefaultCropConfig());
      setScopeInput("");
      setScopeError("");
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

  function applyPreset(preset: CropAspectPreset) {
    if (!pageDisplaySize) return;
    setConfig((current) => ({
      ...current,
      aspectPreset: preset,
      rect: applyAspectPreset(current.rect, preset, pageDisplaySize.width, pageDisplaySize.height),
    }));
  }

  // UX-polish actions -- each is a one-shot commit onto config.rect, same
  // as a drag-end or a numeric-input edit, so export.ts needs no changes.
  function handleResetCrop() {
    setConfig((current) => ({ ...current, aspectPreset: "free", rect: { ...DEFAULT_CROP_RECT } }));
  }

  function handleCenterCrop() {
    setConfig((current) => ({ ...current, rect: centerCropRect(current.rect) }));
  }

  function handleSelectEntirePage() {
    setConfig((current) => ({ ...current, aspectPreset: "free", rect: { ...ENTIRE_PAGE_RECT } }));
  }

  function handleScopeInputChange(value: string) {
    setScopeInput(value);
    if (!pdf) return;
    if (!value.trim()) {
      setScopeError("");
      setConfig((current) => ({ ...current, scope: { mode: "all" } }));
      return;
    }
    const pages = new Set<number>();
    let hasValidToken = false;
    for (const rawToken of value.split(",")) {
      const token = rawToken.trim();
      if (!token) continue;
      const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
      if (rangeMatch) {
        const start = Number.parseInt(rangeMatch[1], 10);
        const end = Number.parseInt(rangeMatch[2], 10);
        const [low, high] = start <= end ? [start, end] : [end, start];
        for (let page = low; page <= high; page += 1) {
          if (page >= 1 && page <= pdf.pageCount) {
            pages.add(page - 1);
            hasValidToken = true;
          }
        }
        continue;
      }
      const single = Number.parseInt(token, 10);
      if (Number.isFinite(single) && single >= 1 && single <= pdf.pageCount) {
        pages.add(single - 1);
        hasValidToken = true;
      }
    }
    if (!hasValidToken) {
      setScopeError("Enter page numbers like 1,3,5-8.");
      return;
    }
    setScopeError("");
    setConfig((current) => ({ ...current, scope: { mode: "custom", pages: Array.from(pages).sort((a, b) => a - b) } }));
  }

  const generateCroppedPdf = useCallback(async () => {
    if (!pdf) return;
    setIsExporting(true);
    setError("");
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "crop" });

    try {
      const { bytes, skippedPages } = await runWithTimeout(
        exportCroppedPdf(copyArrayBuffer(pdf.bytes), config),
        "Cropping the PDF took too long. Try a smaller page range or file.",
      );
      if (skippedPages.length > 0) {
        setError(`Page${skippedPages.length === 1 ? "" : "s"} ${skippedPages.map((p) => p + 1).join(", ")} could not be cropped and were left unchanged.`);
      }
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "application/pdf" });
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      setDownloadUrl(url);
      setDownloadName(sanitizePdfFileName(outputName));
      track({ eventName: "processing_succeeded", toolSlug: "crop", durationMs: performance.now() - startedAt, success: true });
      recordRecentFile({ tool: "crop", filename: sanitizePdfFileName(outputName), fileSize: blob.size, pageCount: pdf.pageCount });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not crop the PDF. Please try again.");
      track({ eventName: "processing_failed", toolSlug: "crop", durationMs: performance.now() - startedAt, success: false, errorCode: "processing_error" });
    } finally {
      setIsExporting(false);
    }
  }, [pdf, config, outputName, track]);

  function downloadCroppedPdf() {
    if (!downloadUrl) return;
    track({ eventName: "download_started", toolSlug: "crop" });
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
            inputId="crop-pdf-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · One file"
            multiple={false}
            icon={<CropIcon />}
            buttonLabel="Select PDF"
            onFilesSelected={(files) => void addFile(files)}
          />
        </div>
        <L2PrivacyNote />
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
            {pageDisplaySize ? (
              <p className="mb-2 text-[11px] font-semibold text-[var(--text-primary)]/40">
                Page size: {Math.round(pageDisplaySize.width)} × {Math.round(pageDisplaySize.height)} (preview px, {PAGE_RENDER_SCALE}x render scale)
              </p>
            ) : null}
            {pageLoading || !pageImageUrl || !pageDisplaySize ? (
              <div className="flex h-64 items-center justify-center rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/40 text-sm text-[var(--text-primary)]/40">
                Loading page preview...
              </div>
            ) : (
              <div
                ref={stageRef}
                className="relative mx-auto max-h-[70vh] w-full overflow-hidden rounded-lg border border-[var(--text-primary)]/12 bg-white"
                style={{ aspectRatio: `${pageDisplaySize.width} / ${pageDisplaySize.height}` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pageImageUrl} alt="Page preview" className="pointer-events-none block h-full w-full object-contain select-none" />
                <CropRectView
                  stageRef={stageRef}
                  rect={config.rect}
                  onRectChange={(rect) => setConfig((current) => ({ ...current, rect }))}
                  lockAspectRatio={lockAspectRatio}
                />
              </div>
            )}
          </section>

          {error ? (
            <div role="alert" className="mt-3 rounded-lg border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
              {error}
            </div>
          ) : null}
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="Crop" description="Drag the rectangle, then export.">
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
            <div className="grid grid-cols-3 gap-1.5">
              <button type="button" onClick={handleResetCrop} className="rounded-lg border border-[var(--text-primary)]/12 px-2 py-1.5 text-[11px] font-bold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/40">
                Reset Crop
              </button>
              <button type="button" onClick={handleCenterCrop} className="rounded-lg border border-[var(--text-primary)]/12 px-2 py-1.5 text-[11px] font-bold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/40">
                Center Crop
              </button>
              <button type="button" onClick={handleSelectEntirePage} className="rounded-lg border border-[var(--text-primary)]/12 px-2 py-1.5 text-[11px] font-bold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/40">
                Entire Page
              </button>
            </div>

            <div className="grid gap-2 border-t border-[var(--text-primary)]/10 pt-3">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">Aspect ratio</span>
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Lock width/height ratio while resizing
                <input type="checkbox" checked={lockAspectRatio} onChange={(e) => setLockAspectRatio(e.target.checked)} />
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {ASPECT_PRESETS.map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={config.aspectPreset === preset}
                    onClick={() => applyPreset(preset)}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${config.aspectPreset === preset ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-[var(--text-primary)]/10 pt-3">
              <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
                X %
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={Math.round(config.rect.xPct)}
                  onChange={(e) => setConfig((current) => ({ ...current, rect: clampCropRect({ ...current.rect, xPct: Number(e.target.value) }) }))}
                  className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
                Y %
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={Math.round(config.rect.yPct)}
                  onChange={(e) => setConfig((current) => ({ ...current, rect: clampCropRect({ ...current.rect, yPct: Number(e.target.value) }) }))}
                  className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
                Width %
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={Math.round(config.rect.widthPct)}
                  onChange={(e) => setConfig((current) => ({ ...current, rect: clampCropRect({ ...current.rect, widthPct: Number(e.target.value) }) }))}
                  className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
                Height %
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={Math.round(config.rect.heightPct)}
                  onChange={(e) => setConfig((current) => ({ ...current, rect: clampCropRect({ ...current.rect, heightPct: Number(e.target.value) }) }))}
                  className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            <div className="grid gap-2 border-t border-[var(--text-primary)]/10 pt-3">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">Pages</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  aria-pressed={config.scope.mode === "all"}
                  onClick={() => {
                    setScopeInput("");
                    setScopeError("");
                    setConfig((current) => ({ ...current, scope: { mode: "all" } }));
                  }}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${config.scope.mode === "all" ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60"}`}
                >
                  All pages
                </button>
                <button
                  type="button"
                  aria-pressed={config.scope.mode === "current"}
                  onClick={() => {
                    setScopeInput("");
                    setScopeError("");
                    setConfig((current) => ({ ...current, scope: { mode: "current", pageIndex } }));
                  }}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${config.scope.mode === "current" ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60"}`}
                >
                  This page only
                </button>
              </div>
              <input
                value={scopeInput}
                onChange={(e) => handleScopeInputChange(e.target.value)}
                placeholder="Custom range, e.g. 1,3,5-8"
                className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-xs"
              />
              {scopeError ? <p className="text-[11px] text-[var(--text-danger)]">{scopeError}</p> : null}
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
                  placeholder="lumeo-cropped.pdf"
                />
              </label>

              <div className="mt-3">
                {downloadUrl ? (
                  <L2ActionArea
                    primary={
                      <button type="button" onClick={downloadCroppedPdf} className="lumeo-primary-action w-full rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)]">
                        Download cropped PDF
                      </button>
                    }
                  />
                ) : (
                  <L2ActionArea
                    primary={
                      <button
                        type="button"
                        disabled={isExporting || !!scopeError || !isCropRectValid(config.rect)}
                        onClick={() => void generateCroppedPdf()}
                        className="lumeo-primary-action w-full rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isExporting ? "Cropping..." : "Apply Crop"}
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
