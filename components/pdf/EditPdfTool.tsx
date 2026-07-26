"use client";

// components/pdf/EditPdfTool.tsx
//
// Edit PDF workspace -- generalizes SignPdfTool's architecture (pdfjs page
// render -> percent-based HTML overlay for placed elements -> pdf-lib
// flatten on export) to four element types: text, freehand ink, shapes
// (rect/ellipse/line/highlight), and whiteout/redaction boxes.
//
// Explicitly out of scope, per the approved design spec: signatures (use
// Sign PDF), page management -- rotate/reorder/delete/duplicate/merge/split
// (use Page Re-Order / Merge / Split), watermarking (its own future tool),
// multi-select, true content-stripping redaction, vector-path ink.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { EditElementView } from "@/components/pdf/edit/EditElementView";
import { InkCanvas } from "@/components/pdf/edit/InkCanvas";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import {
  createInkElement,
  createShapeElement,
  createTextElement,
  createWhiteoutElement,
  deleteElement,
  elementsForPage,
  patchElement,
  type EditElement,
  type ShapeKind,
} from "@/lib/pdf/edit/elements";
import { exportEditedPdf } from "@/lib/pdf/edit/export";
import { useHistoryState } from "@/lib/sign/useHistoryState";
import { openPdfJsDocument } from "@/lib/pdf/pdfjs";
import { formatBytes as formatFileSize } from "@/lib/pdf/formatBytes";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { copyArrayBuffer } from "@/lib/pdf/arrayBuffer";
import { hasPdfMagicBytes, isPdfNamedFile, checkPdfFileSize } from "@/lib/pdf/uploadValidation";

type ActiveTool = "select" | "text" | "draw" | "shape" | "whiteout";

type LoadedPdf = { file: File; bytes: ArrayBuffer; pageCount: number };

const PAGE_RENDER_SCALE = 1.3;
const EXPORT_TIMEOUT_MS = 30_000;
const DEFAULT_SHAPE_KIND: ShapeKind = "rect";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

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

function sanitizePdfFileName(value: string, fallback = "lumeo-edited") {
  const stem = sanitizeFileStem(value.replace(/\.pdf$/i, ""), fallback);
  return `${stem}.pdf`;
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <path d="M8 22.5 20 10.5l3 3L11 25.5H8v-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M18.5 12 21 14.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

export default function EditPdfTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);

  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageImageUrl, setPageImageUrl] = useState("");
  const [pageDisplaySize, setPageDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState("");

  const { state: elements, set: setElements, undo, redo, canUndo, canRedo, reset: resetElements } = useHistoryState<EditElement[]>([]);
  const elementIdCounterRef = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [shapeKind, setShapeKind] = useState<ShapeKind>(DEFAULT_SHAPE_KIND);
  const [inkColor, setInkColor] = useState("#12141a");
  const [inkStrokeWidth, setInkStrokeWidth] = useState(3);
  const [zoom, setZoom] = useState(1);

  const [isExporting, setIsExporting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("lumeo-edited.pdf");
  const [outputName, setOutputName] = useState("lumeo-edited.pdf");

  const stageRef = useRef<HTMLDivElement | null>(null);
  const pageImageUrlRef = useRef("");
  const downloadUrlRef = useRef("");
  const pdfJsDocRef = useRef<PDFDocumentProxy | null>(null);
  const [docReady, setDocReady] = useState(0);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const result = track({ eventName: "tool_opened", toolSlug: "edit" });
    if (result.accepted) openedTrackedRef.current = true;
  }, [availability, track]);

  useEffect(() => {
    return () => {
      if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      void (pdfJsDocRef.current as (PDFDocumentProxy & { destroy?: () => Promise<void> | void }) | null)?.destroy?.();
    };
  }, []);

  // Opens the source PDF via pdfjs once per uploaded file, kept open for the
  // per-page preview effect below to reuse (no re-parsing on page turns).
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

  // Renders the current page to a background image for the placement stage.
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        setElements((current) => deleteElement(current, selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redo, undo, selectedId, setElements]);

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
      // A lightweight pdfjs open (already done in the effect above once
      // `pdf` state is set) validates the page count; here we just need
      // pageCount up front for the Next/Prev bounds, so open once via pdfjs.
      const doc = await openPdfJsDocument(new Uint8Array(copyArrayBuffer(bytes)));
      const pageCount = doc.numPages;
      void (doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();

      setPdf({ file, bytes, pageCount });
      setPageIndex(0);
      resetElements([]);
      setSelectedId(null);
      setDownloadUrl("");
    } catch (uploadError) {
      const message =
        uploadError instanceof Error && /password|encrypt/i.test(uploadError.message)
          ? "This file appears to be password-protected or encrypted."
          : "This file could not be read. It may be damaged or password-protected.";
      setError(message);
    }
  }

  function nextElementId() {
    elementIdCounterRef.current += 1;
    return `el-${elementIdCounterRef.current}`;
  }

  function handleStageClick(event: React.MouseEvent<HTMLDivElement>) {
    if (activeTool === "select" || activeTool === "draw") return;
    if ((event.target as HTMLElement).closest('[role="button"]')) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
    const id = nextElementId();

    let element: EditElement;
    if (activeTool === "text") element = createTextElement(id, pageIndex, xPct, yPct);
    else if (activeTool === "shape") element = createShapeElement(id, pageIndex, xPct, yPct, shapeKind);
    else element = createWhiteoutElement(id, pageIndex, xPct, yPct);

    setElements((current) => [...current, element]);
    setSelectedId(id);
    setActiveTool("select");
  }

  function handleInkStroke(result: { pngDataUrl: string; xPct: number; yPct: number; widthPct: number; heightPct: number }) {
    const id = nextElementId();
    const element = createInkElement(id, pageIndex, result.xPct, result.yPct, result.widthPct, result.heightPct, result.pngDataUrl);
    setElements((current) => [...current, element]);
  }

  const currentPageElements = useMemo(() => elementsForPage(elements, pageIndex), [elements, pageIndex]);
  const selectedElement = useMemo(() => elements.find((item) => item.id === selectedId) ?? null, [elements, selectedId]);

  const generateEditedPdf = useCallback(async () => {
    if (!pdf) return;
    setIsExporting(true);
    setError("");
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "edit" });

    try {
      const { bytes, skippedPages } = await runWithTimeout(
        exportEditedPdf(copyArrayBuffer(pdf.bytes), elements),
        "Generating the PDF took too long. Try fewer elements or a smaller file.",
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
      track({ eventName: "processing_succeeded", toolSlug: "edit", durationMs: performance.now() - startedAt, success: true });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export the PDF. Please try again.");
      track({ eventName: "processing_failed", toolSlug: "edit", durationMs: performance.now() - startedAt, success: false, errorCode: "processing_error" });
    } finally {
      setIsExporting(false);
    }
  }, [pdf, elements, outputName, track]);

  function downloadEditedPdf() {
    if (!downloadUrl) return;
    track({ eventName: "download_started", toolSlug: "edit" });
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
            inputId="edit-pdf-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · One file"
            multiple={false}
            icon={<EditIcon />}
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
                <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} title="Zoom out" className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24">
                  −
                </button>
                <span className="text-xs font-semibold text-[var(--text-primary)]/58">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} title="Zoom in" className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24">
                  +
                </button>
                <button type="button" onClick={() => setZoom(1)} title="Fit width" className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24">
                  Fit
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
              <div className="mx-auto" style={{ width: `${zoom * 100}%` }}>
                <div
                  ref={stageRef}
                  onClick={handleStageClick}
                  className={`relative mx-auto max-h-[32rem] w-full overflow-hidden rounded-lg border border-[var(--text-primary)]/12 bg-white ${activeTool !== "select" && activeTool !== "draw" ? "cursor-crosshair" : ""}`}
                  style={{ aspectRatio: `${pageDisplaySize.width} / ${pageDisplaySize.height}` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pageImageUrl} alt={`Page ${pageIndex + 1} preview`} className="pointer-events-none block h-full w-full select-none" />

                  {currentPageElements.map((element) => (
                    <EditElementView
                      key={element.id}
                      element={element}
                      selected={selectedId === element.id}
                      stageRef={stageRef}
                      onSelect={() => setSelectedId(element.id)}
                      onChange={(patch) => setElements((current) => patchElement(current, element.id, patch))}
                      onDelete={() => {
                        setElements((current) => deleteElement(current, element.id));
                        setSelectedId(null);
                      }}
                      onTextChange={(text) => setElements((current) => patchElement(current, element.id, { text } as Partial<EditElement>))}
                    />
                  ))}

                  {activeTool === "draw" && pageDisplaySize ? (
                    <InkCanvas
                      stageWidthPx={pageDisplaySize.width}
                      stageHeightPx={pageDisplaySize.height}
                      color={inkColor}
                      strokeWidthPx={inkStrokeWidth}
                      onStrokeComplete={handleInkStroke}
                    />
                  ) : null}
                </div>
              </div>
            )}
          </section>

          {error ? (
            <div role="alert" className="mt-3 rounded-lg border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
              {error}
            </div>
          ) : null}
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="Tools" description="Pick a tool, then click the page to place it.">
          <div className="flex h-full min-h-0 flex-col">
            <div className="grid grid-cols-5 gap-1.5">
              {(["select", "text", "draw", "shape", "whiteout"] as ActiveTool[]).map((tool) => (
                <button
                  key={tool}
                  type="button"
                  onClick={() => setActiveTool(tool)}
                  className={`rounded-lg border px-2 py-2 text-[11px] font-bold capitalize transition ${activeTool === tool ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10 text-[var(--text-primary)]" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60 hover:border-[var(--text-primary)]/24"}`}
                >
                  {tool}
                </button>
              ))}
            </div>

            {activeTool === "shape" ? (
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {(["rect", "ellipse", "line", "highlight"] as ShapeKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setShapeKind(kind)}
                    className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold capitalize transition ${shapeKind === kind ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60"}`}
                  >
                    {kind}
                  </button>
                ))}
              </div>
            ) : null}

            {activeTool === "draw" ? (
              <div className="mt-3 grid gap-2">
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Color
                  <input type="color" value={inkColor} onChange={(e) => setInkColor(e.target.value)} className="h-7 w-10 rounded border border-[var(--text-primary)]/14" />
                </label>
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Thickness
                  <input type="range" min={1} max={10} value={inkStrokeWidth} onChange={(e) => setInkStrokeWidth(Number(e.target.value))} className="w-24" />
                </label>
              </div>
            ) : null}

            {activeTool === "whiteout" ? (
              <p className="mt-3 rounded-lg border border-[var(--text-primary)]/12 bg-[var(--text-primary)]/[0.04] p-2.5 text-[11px] leading-5 text-[var(--text-primary)]/60">
                Whiteout hides content visually in the exported PDF. For documents with legal or compliance requirements, verify the underlying content is also removed before sharing.
              </p>
            ) : null}

            {selectedElement && selectedElement.type === "text" ? (
              <div className="mt-3 grid gap-2 border-t border-[var(--text-primary)]/10 pt-3">
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Font size
                  <input
                    type="number"
                    min={8}
                    max={72}
                    value={selectedElement.fontSizePt}
                    onChange={(e) => setElements((current) => patchElement(current, selectedElement.id, { fontSizePt: Number(e.target.value) } as Partial<EditElement>))}
                    className="w-16 rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1 text-right"
                  />
                </label>
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Color
                  <input
                    type="color"
                    value={selectedElement.color}
                    onChange={(e) => setElements((current) => patchElement(current, selectedElement.id, { color: e.target.value } as Partial<EditElement>))}
                    className="h-7 w-10 rounded border border-[var(--text-primary)]/14"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setElements((current) => patchElement(current, selectedElement.id, { bold: !selectedElement.bold } as Partial<EditElement>))}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${selectedElement.bold ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}
                  >
                    Bold
                  </button>
                  <button
                    type="button"
                    onClick={() => setElements((current) => patchElement(current, selectedElement.id, { italic: !selectedElement.italic } as Partial<EditElement>))}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs italic transition ${selectedElement.italic ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}
                  >
                    Italic
                  </button>
                </div>
              </div>
            ) : null}

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
                  placeholder="lumeo-edited.pdf"
                />
              </label>

              <div className="mt-3">
                {downloadUrl ? (
                  <L2ActionArea
                    primary={
                      <button type="button" onClick={downloadEditedPdf} className="lumeo-primary-action w-full rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)]">
                        Download edited PDF
                      </button>
                    }
                  />
                ) : (
                  <L2ActionArea
                    primary={
                      <button
                        type="button"
                        disabled={elements.length === 0 || isExporting}
                        onClick={() => void generateEditedPdf()}
                        className="lumeo-primary-action w-full rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isExporting ? "Exporting..." : "Export PDF"}
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
