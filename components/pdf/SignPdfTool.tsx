"use client";

// components/pdf/SignPdfTool.tsx
//
// Sign PDF workspace -- orchestrates upload, the signature library
// (lib/sign/signatureLibrary), signature creation (SignatureCreator),
// multi-element placement across pages (PlacedElementView +
// lib/sign/useHistoryState for undo/redo), and export (pdf-lib).
//
// Deliberately NOT built: page-thumbnail rail, fullscreen viewer,
// pinch-zoom, and PDF-text "sign here" detection -- each is a
// substantial feature of its own; shipping them half-done would cost
// more in bugs than the polish is worth in one pass.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { degrees, PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2ActionArea,
  L2FileCard,
  L2ToolMainColumn,
  L2ToolSettingsPanel,
  L2ToolWorkspace,
  L2UploadStage,
} from "@/components/pdf/workspace/ToolWorkspace";
import { PlacedElementView } from "@/components/pdf/sign/PlacedElementView";
import { SignatureCreator, type CreatedSignature } from "@/components/pdf/sign/SignatureCreator";
import { SignatureLibraryPanel } from "@/components/pdf/sign/SignatureLibraryPanel";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import {
  deleteSignature as deleteSignatureFromLibrary,
  listSignatures,
  markSignatureUsed,
  renameSignature as renameSignatureInLibrary,
  saveSignature,
  setDefaultSignature,
} from "@/lib/sign/signatureLibrary";
import type { PlacedElement, PlacedElementType, SavedSignature } from "@/lib/sign/types";
import { useHistoryState } from "@/lib/sign/useHistoryState";

type PdfJsModule = typeof import("pdfjs-dist");

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

async function loadPdfJsModule() {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import("pdfjs-dist").then((module) => {
      if (!module.GlobalWorkerOptions.workerSrc) {
        module.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();
      }
      return module;
    });
  }
  return pdfJsModulePromise;
}

type PageSize = { width: number; height: number };

type LoadedPdf = {
  file: File;
  bytes: ArrayBuffer;
  pageCount: number;
  pageSizes: PageSize[];
};

// pdfjs's viewport scale maps PDF points to render pixels 1:1 at this
// factor, uniformly for every page -- so it doubles as the pixels-per-point
// conversion for every placed element at export time, no per-element
// bookkeeping needed.
const PAGE_RENDER_SCALE = 1.3;

const DEFAULT_SIGNATURE_WIDTH_PCT = 22;
const DEFAULT_TEXT_WIDTH_PCT = 18;
const DEFAULT_TEXT_HEIGHT_PCT = 4;
const DEFAULT_FONT_SIZE_PT = 20;

type Toast = { id: string; message: string; tone: "success" | "error" };

function copyArrayBuffer(buffer: ArrayBuffer) {
  const source = new Uint8Array(buffer);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy.buffer;
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function sanitizePdfFileName(value: string) {
  const cleanName = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, " ").trim();
  const safeName = cleanName || "lumeo-signed.pdf";
  return safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

function SignIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <path d="M6 24c4-1 6-3 9-7s4-8 7-8 1 5-2 9-8 7-12 7c-2 0-3-1-2-1Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 25h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

export default function SignPdfTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);

  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageImageUrl, setPageImageUrl] = useState("");
  const [pageDisplaySize, setPageDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState("");
  const [pageLoading, setPageLoading] = useState(false);

  const { state: elements, set: setElements, setLive: setElementsLive, commit: commitElements, undo, redo, canUndo, canRedo, reset: resetElements } = useHistoryState<PlacedElement[]>([]);
  const dragSnapshotRef = useRef<PlacedElement[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [armedSignature, setArmedSignature] = useState<CreatedSignature | SavedSignature | null>(null);

  const [signatures, setSignatures] = useState<SavedSignature[]>(() => listSignatures());
  const [showCreator, setShowCreator] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("lumeo-signed.pdf");
  const [outputName, setOutputName] = useState("lumeo-signed.pdf");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const pageImageUrlRef = useRef("");
  const downloadUrlRef = useRef("");

  const pushToast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 2600);
  }, []);

  useEffect(() => {
    const shouldAttempt = shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current });
    if (!shouldAttempt) return;
    const result = track({ eventName: "tool_opened", toolSlug: "sign" });
    if (result.accepted) openedTrackedRef.current = true;
  }, [availability, track]);

  useEffect(() => {
    return () => {
      if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
    };
  }, []);

  // Renders the current page to a background image for the placement stage.
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;

    void (async () => {
      setPageLoading(true);
      try {
        const pdfjs = await loadPdfJsModule();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(copyArrayBuffer(pdf.bytes)) }).promise;
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
        } finally {
          void (doc as typeof doc & { destroy?: () => Promise<void> | void }).destroy?.();
        }
      } catch {
        setError("This page could not be previewed. Try a different page.");
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex]);

  // Keyboard shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z
  // redo, Delete/Backspace removes the selected element.
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
        setElements((current) => current.filter((item) => item.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redo, undo, selectedId, setElements]);

  const addFile = async (files: FileList | File[]) => {
    setError("");
    const file = Array.from(files)[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file.");
      return;
    }

    try {
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(copyArrayBuffer(bytes), { ignoreEncryption: false });
      const pageSizes = doc.getPages().map((page) => {
        const { width, height } = page.getSize();
        return { width, height };
      });
      setPdf({ file, bytes, pageCount: doc.getPageCount(), pageSizes });
      setPageIndex(0);
      resetElements([]);
      setSelectedId(null);
      setDownloadUrl("");
    } catch {
      setError("This file could not be read. It may be damaged or password-protected.");
    }
  };

  const startNew = () => {
    if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
    if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
    downloadUrlRef.current = "";
    pageImageUrlRef.current = "";
    setPdf(null);
    setPageImageUrl("");
    resetElements([]);
    setSelectedId(null);
    setDownloadUrl("");
    setError("");
    setOutputName("lumeo-signed.pdf");
  };

  function refreshLibrary() {
    setSignatures(listSignatures());
  }

  function handleSaveToLibrary(signature: CreatedSignature) {
    const name = window.prompt("Name this signature", "My signature");
    if (name === null) return;
    saveSignature({ name, dataUrl: signature.dataUrl, aspectRatio: signature.aspectRatio, source: signature.source });
    refreshLibrary();
    pushToast("Signature saved");
  }

  function armSignature(signature: CreatedSignature | SavedSignature) {
    setArmedSignature(signature);
    setShowCreator(false);
  }

  function handleStageClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!armedSignature || !stageRef.current) return;
    if ((event.target as HTMLElement).closest('[role="button"]')) return;
    const rect = stageRef.current.getBoundingClientRect();
    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
    const widthPct = DEFAULT_SIGNATURE_WIDTH_PCT;
    const heightPct = widthPct / armedSignature.aspectRatio;

    const id = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setElements((current) => [
      ...current,
      {
        id,
        type: "signature",
        pageIndex,
        xPct: Math.min(100 - widthPct, Math.max(0, xPct - widthPct / 2)),
        yPct: Math.min(100 - heightPct, Math.max(0, yPct - heightPct / 2)),
        widthPct,
        heightPct,
        rotationDeg: 0,
        signatureId: "id" in armedSignature ? armedSignature.id : "",
        dataUrl: armedSignature.dataUrl,
        aspectRatio: armedSignature.aspectRatio,
      },
    ]);
    setSelectedId(id);
    if ("id" in armedSignature) markSignatureUsed(armedSignature.id);
    setArmedSignature(null);
  }

  function addTextElement(type: Exclude<PlacedElementType, "signature">) {
    const defaultText = type === "date" ? new Date().toLocaleDateString() : type === "initials" ? "" : "";
    const id = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setElements((current) => [
      ...current,
      {
        id,
        type,
        pageIndex,
        xPct: 38,
        yPct: 46,
        widthPct: DEFAULT_TEXT_WIDTH_PCT,
        heightPct: DEFAULT_TEXT_HEIGHT_PCT,
        rotationDeg: 0,
        text: defaultText,
        fontSizePt: DEFAULT_FONT_SIZE_PT,
      },
    ]);
    setSelectedId(id);
  }

  // Continuous drag/resize/rotate frames update live state only -- pushing
  // an undo entry per pointermove would flood the stack. The pre-gesture
  // snapshot is captured lazily on the first patch of a gesture, then
  // committed as one undo step when the gesture ends (see commitElement).
  function patchElement(id: string, patch: Partial<PlacedElement>) {
    setElementsLive((current) => {
      if (dragSnapshotRef.current === null) dragSnapshotRef.current = current;
      return current.map((item) => (item.id === id ? ({ ...item, ...patch } as PlacedElement) : item));
    });
  }

  function commitElement() {
    if (dragSnapshotRef.current) {
      commitElements(dragSnapshotRef.current);
      dragSnapshotRef.current = null;
    }
  }

  const currentPageElements = useMemo(() => elements.filter((item) => item.pageIndex === pageIndex), [elements, pageIndex]);

  async function generateSignedPdf() {
    if (!pdf || elements.length === 0) return;
    setIsGenerating(true);
    setError("");
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "sign" });

    try {
      const doc = await PDFDocument.load(copyArrayBuffer(pdf.bytes));
      const helvetica = await doc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const pngCache = new Map<string, Uint8Array>();

      for (const element of elements) {
        const page = doc.getPages()[element.pageIndex];
        if (!page) continue;
        const { width: pageWidth, height: pageHeight } = page.getSize();

        if (element.type === "signature") {
          let bytes = pngCache.get(element.dataUrl);
          if (!bytes) {
            const response = await fetch(element.dataUrl);
            bytes = new Uint8Array(await response.arrayBuffer());
            pngCache.set(element.dataUrl, bytes);
          }
          const embedded = await doc.embedPng(bytes);
          const widthPt = (element.widthPct / 100) * pageWidth;
          const heightPt = (element.heightPct / 100) * pageHeight;
          const centerXPt = ((element.xPct + element.widthPct / 2) / 100) * pageWidth;
          const centerYPt = pageHeight - ((element.yPct + element.heightPct / 2) / 100) * pageHeight;
          page.drawImage(embedded, {
            x: centerXPt - widthPt / 2,
            y: centerYPt - heightPt / 2,
            width: widthPt,
            height: heightPt,
            rotate: degrees(-element.rotationDeg),
          });
        } else if (element.text.trim()) {
          const fontSizePt = element.fontSizePt / PAGE_RENDER_SCALE;
          const xPt = (element.xPct / 100) * pageWidth;
          const topYPt = pageHeight - (element.yPct / 100) * pageHeight;
          const font = element.type === "initials" ? helveticaBold : helvetica;
          page.drawText(element.text, {
            x: xPt,
            y: topYPt - fontSizePt,
            size: fontSizePt,
            font,
            color: rgb(0.07, 0.08, 0.1),
          });
        }
      }

      const bytes = await doc.save();
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "application/pdf" });
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      setDownloadUrl(url);
      setDownloadName(sanitizePdfFileName(outputName));
      track({ eventName: "processing_succeeded", toolSlug: "sign", durationMs: performance.now() - startedAt, success: true });
    } catch {
      setError("Signing failed. Try a smaller file or fewer elements.");
      pushToast("Could not sign the PDF. Please try again.", "error");
      track({ eventName: "processing_failed", toolSlug: "sign", durationMs: performance.now() - startedAt, success: false, errorCode: "processing_error" });
    } finally {
      setIsGenerating(false);
    }
  }

  function downloadSignedPdf() {
    if (!downloadUrl) return;
    track({ eventName: "download_started", toolSlug: "sign" });
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    pushToast("Signed PDF downloaded");
  }

  if (!pdf) {
    return (
      <section className="l2-tool-empty-state grid gap-4 pb-4 lg:pb-0">
        <div className="mx-auto w-full max-w-[1040px]">
          <L2UploadStage
            inputId="sign-pdf-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · One file"
            multiple={false}
            icon={<SignIcon />}
            buttonLabel="Select PDF"
            onFilesSelected={(files) => {
              void addFile(files);
            }}
          />
        </div>
        <p className="mx-auto flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]/44">
          🔒 Your PDF stays on your device.
        </p>
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
              <L2FileCard
                icon={<FileIcon />}
                name={pdf.file.name}
                meta={`${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"} · ${formatFileSize(pdf.file.size)}`}
              />
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24 disabled:opacity-30">
                  Undo
                </button>
                <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24 disabled:opacity-30">
                  Redo
                </button>
                <button type="button" onClick={startNew} className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24">
                  Start new
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/60 px-3 py-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                  className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40 disabled:opacity-35"
                >
                  ← Prev
                </button>
                <span className="text-xs font-semibold text-[var(--text-primary)]/60">
                  Page {pageIndex + 1} of {pdf.pageCount}
                </span>
                <button
                  type="button"
                  disabled={pageIndex === pdf.pageCount - 1}
                  onClick={() => setPageIndex((current) => Math.min(pdf.pageCount - 1, current + 1))}
                  className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40 disabled:opacity-35"
                >
                  Next →
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => addTextElement("date")} className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/40 hover:text-[var(--text-primary)]">
                  + Date
                </button>
                <button type="button" onClick={() => addTextElement("text")} className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/40 hover:text-[var(--text-primary)]">
                  + Text
                </button>
                <button type="button" onClick={() => addTextElement("initials")} className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/40 hover:text-[var(--text-primary)]">
                  + Initials
                </button>
              </div>
            </div>
          </section>

          <section className="mt-3 rounded-xl border border-[var(--text-primary)]/12 bg-gradient-to-br from-[var(--atelier-surface-3)] via-[var(--atelier-surface-2)] to-[var(--atelier-surface-1)] p-3.5 shadow-2xl shadow-black/24">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--lumeo-gold)]">
              {armedSignature ? "Click anywhere on the page to place it" : "Place your signature"}
            </p>
            <p className="mb-3 text-xs text-[var(--text-primary)]/48">
              🔒 Your PDF stays on your device. Drag to move, use the corner handle to resize.
            </p>

            {pageLoading || !pageImageUrl || !pageDisplaySize ? (
              <div className="flex h-64 animate-pulse items-center justify-center rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/40 text-sm text-[var(--text-primary)]/40">
                Loading page preview...
              </div>
            ) : (
              <div
                ref={stageRef}
                onClick={handleStageClick}
                className={`relative mx-auto overflow-hidden rounded-lg border border-[var(--text-primary)]/12 bg-white ${armedSignature ? "cursor-crosshair" : ""}`}
                style={{ aspectRatio: `${pageDisplaySize.width} / ${pageDisplaySize.height}`, maxWidth: "100%" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pageImageUrl} alt={`Page ${pageIndex + 1} preview`} className="pointer-events-none block h-full w-full select-none" />
                {currentPageElements.map((element) => (
                  <PlacedElementView
                    key={element.id}
                    element={element}
                    selected={selectedId === element.id}
                    stageRef={stageRef}
                    onSelect={() => setSelectedId(element.id)}
                    onChange={(patch) => patchElement(element.id, patch)}
                    onCommit={commitElement}
                    onDelete={() => {
                      setElements((current) => current.filter((item) => item.id !== element.id));
                      setSelectedId(null);
                    }}
                    onDuplicate={() => {
                      const id = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                      setElements((current) => [
                        ...current,
                        { ...element, id, xPct: Math.min(94 - element.widthPct, element.xPct + 3), yPct: Math.min(94 - element.heightPct, element.yPct + 3) },
                      ]);
                      setSelectedId(id);
                    }}
                    onEditText={
                      element.type !== "signature"
                        ? (text) => setElements((current) => current.map((item) => (item.id === element.id ? ({ ...item, text } as PlacedElement) : item)))
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {error ? (
            <div role="alert" className="mt-3 rounded-lg border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
              {error}
            </div>
          ) : null}
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="Signature" description="Pick a saved signature or create a new one, then click the page to place it.">
          <div className="flex h-full min-h-0 flex-col">
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
              {showCreator ? (
                <div>
                  <button type="button" onClick={() => setShowCreator(false)} className="mb-2 text-xs font-semibold text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]">
                    ← Back to saved signatures
                  </button>
                  <SignatureCreator
                    onCreate={(signature) => {
                      armSignature(signature);
                      handleSaveToLibrary(signature);
                    }}
                  />
                </div>
              ) : (
                <SignatureLibraryPanel
                  signatures={signatures}
                  onUse={(signature) => armSignature(signature)}
                  onRename={(id, name) => {
                    renameSignatureInLibrary(id, name);
                    refreshLibrary();
                  }}
                  onDelete={(id) => {
                    deleteSignatureFromLibrary(id);
                    refreshLibrary();
                    pushToast("Signature deleted");
                  }}
                  onSetDefault={(id) => {
                    setDefaultSignature(id);
                    refreshLibrary();
                  }}
                  onCreateNew={() => setShowCreator(true)}
                />
              )}

              {armedSignature ? (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-[var(--lumeo-gold)]/30 bg-[var(--lumeo-gold)]/10 px-3 py-2">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">Ready to place</span>
                  <button type="button" onClick={() => setArmedSignature(null)} className="text-xs font-semibold text-[var(--text-danger)]/80 hover:text-[var(--text-danger)]">
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-3 border-t border-[var(--text-primary)]/10 pt-3">
              <label className="block rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/50 p-2.5">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">File name</span>
                <input
                  value={outputName}
                  onChange={(event) => {
                    setOutputName(event.target.value);
                    setDownloadUrl("");
                  }}
                  className="mt-1.5 w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-primary)]/26 focus:border-b-[var(--lumeo-gold)]/45"
                  placeholder="lumeo-signed.pdf"
                />
              </label>

              <div className="mt-3">
                {downloadUrl ? (
                  <L2ActionArea
                    primary={
                      <button
                        type="button"
                        onClick={downloadSignedPdf}
                        className="lumeo-primary-action w-full rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)]"
                      >
                        Download signed PDF
                      </button>
                    }
                  />
                ) : (
                  <L2ActionArea
                    primary={
                      <button
                        type="button"
                        disabled={elements.length === 0 || isGenerating}
                        onClick={() => void generateSignedPdf()}
                        className="lumeo-primary-action w-full rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isGenerating ? "Signing..." : "Sign PDF"}
                      </button>
                    }
                  />
                )}
              </div>
            </div>
          </div>
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>

      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto rounded-[var(--radius-md)] border px-4 py-2.5 text-sm font-semibold shadow-lg ${
              toast.tone === "success"
                ? "border-[rgba(var(--lumeo-seal-rgb),0.4)] bg-[var(--surface-success)] text-[var(--text-success)]"
                : "border-[var(--border-danger)] bg-[var(--surface-danger)] text-[var(--text-danger)]"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </section>
  );
}
