"use client";

// components/pdf/HeaderFooterTool.tsx
//
// Header & Footer workspace -- reuses the same pdfjs preview + pdf-lib
// flatten-on-export architecture as Watermark PDF and Page Numbers,
// applied to two independent text zones (header/footer, each with its own
// left/center/right alignment) instead of a single watermark or numbering
// sequence. All positioning/rotation/page-range/font math comes from
// lib/pdf/core/* via lib/pdf/headerFooter/config.ts and export.ts --
// nothing here duplicates that logic. No manual positioning (not part of
// the approved feature list, matching Watermark/Page Numbers' own
// documented scope decisions for comparable out-of-scope items).

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2FileCard,
  L2PanelLabel,
  L2PrivacyNote,
  L2UploadStage,
  L2WorkspaceGrid,
  L2WorkspaceHeader,
  L2WorkspaceInspector,
  L2WorkspacePanel,
  L2WorkspaceToolbar,
  ToolActionBar,
} from "@/components/pdf/workspace/ToolWorkspace";
import { HeaderFooterPreview } from "@/components/pdf/headerFooter/HeaderFooterPreview";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import {
  createDefaultHeaderFooterConfig,
  renderZoneText,
  type HeaderFooterConfig,
  type TextZoneAlignment,
  type TextZoneConfig,
} from "@/lib/pdf/headerFooter/config";
import { exportHeaderFooterPdf } from "@/lib/pdf/headerFooter/export";
import { parsePageRangeInput } from "@/lib/pdf/core/pageRanges.ts";
import { openPdfJsDocument } from "@/lib/pdf/pdfjs";
import { formatBytes as formatFileSize } from "@/lib/pdf/formatBytes";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { recordRecentFile } from "@/lib/recent-files";
import { copyArrayBuffer } from "@/lib/pdf/arrayBuffer";
import { hasPdfMagicBytes, isPdfNamedFile, checkPdfFileSize, checkPdfPageCount } from "@/lib/pdf/uploadValidation";

type LoadedPdf = { file: File; bytes: ArrayBuffer; pageCount: number };

const PAGE_RENDER_SCALE = 1.3;
const EXPORT_TIMEOUT_MS = 30_000;
const APPROX_CHAR_WIDTH_PCT = 0.9; // rough on-screen text-width estimate for the preview only; export.ts measures real font metrics

const ALIGNMENTS: Array<[TextZoneAlignment, string]> = [
  ["left", "Left"],
  ["center", "Center"],
  ["right", "Right"],
];
const PLACEHOLDER_HINTS = "{page}  {pages}  {date}  {time}  {filename}";

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

function sanitizePdfFileName(value: string, fallback = "lumeo-header-footer") {
  const stem = sanitizeFileStem(value.replace(/\.pdf$/i, ""), fallback);
  return `${stem}.pdf`;
}

function estimateLabelSizePct(text: string, fontSizePt: number): { widthPct: number; heightPct: number } {
  return {
    widthPct: Math.min(90, Math.max(4, text.length * APPROX_CHAR_WIDTH_PCT * (fontSizePt / 36))),
    heightPct: Math.max(2, fontSizePt / 24),
  };
}

function HeaderFooterIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <rect x="6" y="5" width="20" height="24" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 9h14M9 25h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ZoneEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TextZoneConfig;
  onChange: (next: TextZoneConfig) => void;
}) {
  return (
    <div className="grid gap-2 border-t border-[var(--text-primary)]/10 pt-3">
      <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">
        {label}
        <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} aria-label={`Enable ${label.toLowerCase()}`} />
      </label>
      {value.enabled ? (
        <>
          <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
            Text ({PLACEHOLDER_HINTS})
            <input
              value={value.template}
              onChange={(e) => onChange({ ...value, template: e.target.value })}
              placeholder="e.g. Page {page} of {pages}"
              className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
              Prefix
              <input value={value.prefix} onChange={(e) => onChange({ ...value, prefix: e.target.value })} className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]/60">
              Suffix
              <input value={value.suffix} onChange={(e) => onChange({ ...value, suffix: e.target.value })} className="rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm" />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={`${label} alignment`}>
            {ALIGNMENTS.map(([alignment, alignLabel]) => (
              <button
                key={alignment}
                type="button"
                aria-pressed={value.alignment === alignment}
                onClick={() => onChange({ ...value, alignment })}
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${value.alignment === alignment ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10 text-[var(--text-primary)]" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60"}`}
              >
                {alignLabel}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function HeaderFooterTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);

  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageImageUrl, setPageImageUrl] = useState("");
  const [pageDisplaySize, setPageDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState("");

  const [config, setConfig] = useState<HeaderFooterConfig>(createDefaultHeaderFooterConfig());
  const [pageRangeInput, setPageRangeInput] = useState("");
  const [pageRangeError, setPageRangeError] = useState("");

  const [isExporting, setIsExporting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("lumeo-header-footer.pdf");
  const [outputName, setOutputName] = useState("lumeo-header-footer.pdf");

  const pageImageUrlRef = useRef("");
  const downloadUrlRef = useRef("");
  const pdfJsDocRef = useRef<PDFDocumentProxy | null>(null);
  const [docReady, setDocReady] = useState(0);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const result = track({ eventName: "tool_opened", toolSlug: "header-footer" });
    if (result.accepted) openedTrackedRef.current = true;
  }, [availability, track]);

  useEffect(() => {
    return () => {
      if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      void (pdfJsDocRef.current as (PDFDocumentProxy & { destroy?: () => Promise<void> | void }) | null)?.destroy?.();
    };
  }, []);

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
      setConfig(createDefaultHeaderFooterConfig());
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

  const generateHeaderFooterPdf = useCallback(async () => {
    if (!pdf) return;
    setIsExporting(true);
    setError("");
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "header-footer" });

    try {
      const { bytes, skippedPages } = await runWithTimeout(
        exportHeaderFooterPdf(copyArrayBuffer(pdf.bytes), config, pdf.file.name),
        "Generating the PDF took too long. Try a smaller page range or file.",
      );
      if (skippedPages.length > 0) {
        setError(`Page${skippedPages.length === 1 ? "" : "s"} ${skippedPages.map((p) => p + 1).join(", ")} could not be updated and were left unchanged.`);
      }
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "application/pdf" });
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      setDownloadUrl(url);
      setDownloadName(sanitizePdfFileName(outputName));
      track({ eventName: "processing_succeeded", toolSlug: "header-footer", durationMs: performance.now() - startedAt, success: true });
      recordRecentFile({ tool: "header-footer", filename: sanitizePdfFileName(outputName), fileSize: blob.size, pageCount: pdf.pageCount });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not add the header/footer. Please try again.");
      track({ eventName: "processing_failed", toolSlug: "header-footer", durationMs: performance.now() - startedAt, success: false, errorCode: "processing_error" });
    } finally {
      setIsExporting(false);
    }
  }, [pdf, config, outputName, track]);

  function downloadHeaderFooterPdf() {
    if (!downloadUrl) return;
    track({ eventName: "download_started", toolSlug: "header-footer" });
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const previewContext = { pageNumber: pageIndex + 1, totalPages: pdf?.pageCount ?? 1, filename: pdf?.file.name ?? "" };
  const isFirstSelectedPreview = config.firstPageDifferent && pageIndex === 0;
  const previewHeaderZone = isFirstSelectedPreview ? config.firstPageHeader : config.header;
  const previewFooterZone = isFirstSelectedPreview ? config.firstPageFooter : config.footer;
  const previewHeaderText = renderZoneText(previewHeaderZone, previewContext);
  const previewFooterText = renderZoneText(previewFooterZone, previewContext);
  const estimatedSize = estimateLabelSizePct(
    previewHeaderText.length > previewFooterText.length ? previewHeaderText : previewFooterText,
    config.fontSizePt,
  );
  const textStyle: React.CSSProperties = {
    opacity: config.opacity,
    color: config.color,
    fontWeight: config.bold ? 700 : 400,
    fontStyle: config.italic ? "italic" : "normal",
    fontSize: `${Math.max(10, config.fontSizePt * 0.6)}px`,
  };

  if (!pdf) {
    return (
      <section className="l2-workspace grid gap-5 pb-4 lg:pb-0">
        <L2WorkspaceHeader title="Header & Footer" description="Add a header and footer to a PDF." />

        <div className="aura-glass-regular mx-auto w-full max-w-[720px] rounded-[var(--radius-2xl)] p-2 shadow-[var(--v2-elevation-3)]">
          <L2UploadStage
            inputId="header-footer-pdf-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · One file"
            multiple={false}
            icon={<HeaderFooterIcon />}
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
        title="Header & Footer"
        description={`${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"} · ${formatFileSize(pdf.file.size)}`}
      />

      <L2WorkspaceToolbar>
        <span className="text-xs font-bold text-[var(--text-subtle)]">{pdf.file.name}</span>
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
                <HeaderFooterPreview
                  pageImageUrl={pageImageUrl}
                  headerText={previewHeaderText}
                  footerText={previewFooterText}
                  headerAlignment={previewHeaderZone.alignment}
                  footerAlignment={previewFooterZone.alignment}
                  contentWidthPct={estimatedSize.widthPct}
                  contentHeightPct={estimatedSize.heightPct}
                  marginPct={config.marginPct}
                  pageWidthPt={pageDisplaySize.width}
                  pageHeightPt={pageDisplaySize.height}
                  textStyle={textStyle}
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
          <L2WorkspaceInspector title="Header & Footer" description="Configure each zone, then export.">
            <ZoneEditor label="Header" value={config.header} onChange={(next) => setConfig((current) => ({ ...current, header: next }))} />
            <ZoneEditor label="Footer" value={config.footer} onChange={(next) => setConfig((current) => ({ ...current, footer: next }))} />

            <div className="grid gap-2 border-t border-[var(--text-primary)]/10 pt-3">
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                First page different
                <input
                  type="checkbox"
                  checked={config.firstPageDifferent}
                  onChange={(e) => setConfig((current) => ({ ...current, firstPageDifferent: e.target.checked }))}
                />
              </label>
            </div>
            {config.firstPageDifferent ? (
              <>
                <ZoneEditor label="First page header" value={config.firstPageHeader} onChange={(next) => setConfig((current) => ({ ...current, firstPageHeader: next }))} />
                <ZoneEditor label="First page footer" value={config.firstPageFooter} onChange={(next) => setConfig((current) => ({ ...current, firstPageFooter: next }))} />
              </>
            ) : null}

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
                <input type="color" value={config.color} onChange={(e) => setConfig((current) => ({ ...current, color: e.target.value }))} className="h-7 w-10 rounded border border-[var(--text-primary)]/14" />
              </label>
              <div className="flex gap-2">
                <button type="button" aria-pressed={config.bold} onClick={() => setConfig((current) => ({ ...current, bold: !current.bold }))} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${config.bold ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}>
                  Bold
                </button>
                <button type="button" aria-pressed={config.italic} onClick={() => setConfig((current) => ({ ...current, italic: !current.italic }))} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs italic transition ${config.italic ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}>
                  Italic
                </button>
              </div>
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Opacity
                <input type="range" min={0.1} max={1} step={0.05} value={config.opacity} onChange={(e) => setConfig((current) => ({ ...current, opacity: Number(e.target.value) }))} className="w-24" />
              </label>
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Margin
                <input type="range" min={0} max={20} step={1} value={config.marginPct} onChange={(e) => setConfig((current) => ({ ...current, marginPct: Number(e.target.value) }))} className="w-24" />
              </label>
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
                  placeholder="lumeo-header-footer.pdf"
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
            onClick={downloadHeaderFooterPdf}
            className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98] sm:w-auto"
          >
            Download PDF
          </button>
        ) : (
          <button
            type="button"
            disabled={isExporting || !!pageRangeError}
            onClick={() => void generateHeaderFooterPdf()}
            className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-[var(--v2-interactive-disabled-opacity)] active:scale-[0.98] sm:w-auto"
          >
            {isExporting ? "Applying..." : "Add Header & Footer"}
          </button>
        )}
      </ToolActionBar>

      <L2PrivacyNote />
    </section>
  );
}
