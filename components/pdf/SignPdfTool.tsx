"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
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
import { AuraSegmentedControl } from "@/components/ui/Aura";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";

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

type SignatureMode = "draw" | "type";

type Signature = {
  url: string;
  bytes: Uint8Array;
  aspectRatio: number;
};

type Placement = {
  // Percent of the rendered page image's width/height -- resolution
  // independent, so it survives switching pages or re-rendering at a
  // different scale.
  xPct: number;
  yPct: number;
  widthPct: number;
};

const SIGN_CANVAS_WIDTH = 340;
const SIGN_CANVAS_HEIGHT = 130;
const PAGE_RENDER_SCALE = 1.3;

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
  const cleanName = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const safeName = cleanName || "lumeo-signed.pdf";
  return safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
}

async function canvasToPngSignature(canvas: HTMLCanvasElement): Promise<Signature | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    url: URL.createObjectURL(blob),
    bytes,
    aspectRatio: canvas.width / canvas.height,
  };
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

  const [mode, setMode] = useState<SignatureMode>("draw");
  const [typedText, setTypedText] = useState("");
  const [signature, setSignature] = useState<Signature | null>(null);
  const [placement, setPlacement] = useState<Placement>({ xPct: 55, yPct: 78, widthPct: 26 });

  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("lumeo-signed.pdf");
  const [outputName, setOutputName] = useState("lumeo-signed.pdf");
  const [cleanupMessage, setCleanupMessage] = useState("");

  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; originXPct: number; originYPct: number } | null>(null);
  const pageImageUrlRef = useRef("");
  const downloadUrlRef = useRef("");
  const signatureUrlRef = useRef("");

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
      if (signatureUrlRef.current) URL.revokeObjectURL(signatureUrlRef.current);
    };
  }, []);

  // Renders the current page to a background image for the placement stage.
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;

    void (async () => {
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
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex]);

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
      setPageIndex(doc.getPageCount() - 1);
      setDownloadUrl("");
      setCleanupMessage("");
    } catch {
      setError("This file could not be read. It may be damaged or password-protected.");
    }
  };

  const startNew = () => {
    if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
    if (signatureUrlRef.current) URL.revokeObjectURL(signatureUrlRef.current);
    if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
    downloadUrlRef.current = "";
    signatureUrlRef.current = "";
    pageImageUrlRef.current = "";
    setPdf(null);
    setPageImageUrl("");
    setSignature(null);
    setDownloadUrl("");
    setError("");
    setCleanupMessage("");
    setOutputName("lumeo-signed.pdf");
  };

  // Drawing pad -- plain pointer events, no library. Signature ink only,
  // white/transparent background so it composites cleanly onto the page.
  function getCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;
    const context = canvas.getContext("2d");
    if (!context) return;
    const point = getCanvasPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const point = getCanvasPoint(event);
    context.lineTo(point.x, point.y);
    context.strokeStyle = "#12141a";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
    hasInkRef.current = true;
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    isDrawingRef.current = false;
    drawCanvasRef.current?.releasePointerCapture(event.pointerId);
  }

  function clearDrawCanvas() {
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
  }

  async function applyDrawnSignature() {
    const canvas = drawCanvasRef.current;
    if (!canvas || !hasInkRef.current) {
      setError("Draw a signature first.");
      return;
    }
    setError("");
    const next = await canvasToPngSignature(canvas);
    if (!next) return;
    if (signatureUrlRef.current) URL.revokeObjectURL(signatureUrlRef.current);
    signatureUrlRef.current = next.url;
    setSignature(next);
  }

  async function applyTypedSignature() {
    const text = typedText.trim();
    if (!text) {
      setError("Type a name first.");
      return;
    }
    setError("");
    const canvas = document.createElement("canvas");
    canvas.width = SIGN_CANVAS_WIDTH;
    canvas.height = SIGN_CANVAS_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#12141a";
    context.textBaseline = "middle";
    let fontSize = 56;
    context.font = `italic ${fontSize}px "Brush Script MT", "Segoe Script", cursive`;
    while (context.measureText(text).width > canvas.width - 24 && fontSize > 18) {
      fontSize -= 2;
      context.font = `italic ${fontSize}px "Brush Script MT", "Segoe Script", cursive`;
    }
    context.fillText(text, 12, canvas.height / 2 + 4);
    const next = await canvasToPngSignature(canvas);
    if (!next) return;
    if (signatureUrlRef.current) URL.revokeObjectURL(signatureUrlRef.current);
    signatureUrlRef.current = next.url;
    setSignature(next);
  }

  function clearSignature() {
    if (signatureUrlRef.current) URL.revokeObjectURL(signatureUrlRef.current);
    signatureUrlRef.current = "";
    setSignature(null);
    setDownloadUrl("");
  }

  function handleStagePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!signature) return;
    const stage = stageRef.current;
    if (!stage) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originXPct: placement.xPct,
      originYPct: placement.yPct,
    };
  }

  function handleStagePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;
    const rect = stage.getBoundingClientRect();
    const deltaXPct = ((event.clientX - drag.startX) / rect.width) * 100;
    const deltaYPct = ((event.clientY - drag.startY) / rect.height) * 100;
    setPlacement((current) => ({
      ...current,
      xPct: Math.min(100 - current.widthPct, Math.max(0, drag.originXPct + deltaXPct)),
      yPct: Math.min(96, Math.max(0, drag.originYPct + deltaYPct)),
    }));
    setDownloadUrl("");
  }

  function handleStagePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    dragStateRef.current = null;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  const signatureHeightPct = useMemo(() => {
    if (!signature || !pageDisplaySize) return 0;
    const widthPx = (placement.widthPct / 100) * pageDisplaySize.width;
    const heightPx = widthPx / signature.aspectRatio;
    return (heightPx / pageDisplaySize.height) * 100;
  }, [signature, pageDisplaySize, placement.widthPct]);

  async function generateSignedPdf() {
    if (!pdf || !signature || !pageDisplaySize) return;

    setIsGenerating(true);
    setError("");
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "sign" });

    try {
      const doc = await PDFDocument.load(copyArrayBuffer(pdf.bytes));
      const page = doc.getPages()[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const embedded = await doc.embedPng(signature.bytes);

      const widthPt = (placement.widthPct / 100) * pageWidth;
      const heightPt = widthPt / signature.aspectRatio;
      const xPt = (placement.xPct / 100) * pageWidth;
      const yPt = pageHeight - (placement.yPct / 100) * pageHeight - heightPt;

      page.drawImage(embedded, { x: xPt, y: yPt, width: widthPt, height: heightPt });

      const bytes = await doc.save();
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "application/pdf" });
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      const safeName = sanitizePdfFileName(outputName);
      setDownloadUrl(url);
      setDownloadName(safeName);
      setCleanupMessage("");
      track({ eventName: "processing_succeeded", toolSlug: "sign", durationMs: performance.now() - startedAt, success: true });
    } catch {
      setError("Signing failed. Try a smaller file or a different page.");
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
    window.setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
      downloadUrlRef.current = "";
      setDownloadUrl("");
      setCleanupMessage("Temporary file cleared from this session.");
    }, 800);
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
        <L2PrivacyNote />
        {error ? (
          <div className="mt-4 rounded-lg border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
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
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <L2FileCard
                icon={<FileIcon />}
                name={pdf.file.name}
                meta={`${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"} · ${formatFileSize(pdf.file.size)}`}
              />
              <button
                type="button"
                onClick={startNew}
                className="shrink-0 rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24 hover:text-[var(--text-primary)]"
              >
                Start new
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/60 px-3 py-2">
              <button
                type="button"
                disabled={pageIndex === 0}
                onClick={() => {
                  setPageIndex((current) => Math.max(0, current - 1));
                  setDownloadUrl("");
                }}
                className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40 disabled:opacity-35"
              >
                ← Prev page
              </button>
              <span className="text-xs font-semibold text-[var(--text-primary)]/60">
                Page {pageIndex + 1} of {pdf.pageCount}
              </span>
              <button
                type="button"
                disabled={pageIndex === pdf.pageCount - 1}
                onClick={() => {
                  setPageIndex((current) => Math.min(pdf.pageCount - 1, current + 1));
                  setDownloadUrl("");
                }}
                className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40 disabled:opacity-35"
              >
                Next page →
              </button>
            </div>
          </section>

          <section className="mt-3 rounded-xl border border-[var(--text-primary)]/12 bg-gradient-to-br from-[var(--atelier-surface-3)] via-[var(--atelier-surface-2)] to-[var(--atelier-surface-1)] p-3.5 shadow-2xl shadow-black/24">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--lumeo-gold)]">
              Place your signature
            </p>
            <p className="mb-3 text-xs text-[var(--text-primary)]/48">
              {signature ? "Drag the signature to position it." : "Create a signature below, then drag it onto the page."}
            </p>

            {pageImageUrl && pageDisplaySize ? (
              <div
                ref={stageRef}
                onPointerMove={handleStagePointerMove}
                onPointerUp={handleStagePointerUp}
                className="relative mx-auto overflow-hidden rounded-lg border border-[var(--text-primary)]/12 bg-white"
                style={{ aspectRatio: `${pageDisplaySize.width} / ${pageDisplaySize.height}`, maxWidth: "100%" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pageImageUrl} alt={`Page ${pageIndex + 1} preview`} className="pointer-events-none block h-full w-full select-none" />
                {signature ? (
                  <div
                    onPointerDown={handleStagePointerDown}
                    className="absolute cursor-grab touch-none active:cursor-grabbing"
                    style={{
                      left: `${placement.xPct}%`,
                      top: `${placement.yPct}%`,
                      width: `${placement.widthPct}%`,
                      height: `${signatureHeightPct}%`,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={signature.url} alt="Your signature" className="h-full w-full select-none" draggable={false} />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/40 text-sm text-[var(--text-primary)]/40">
                Loading page preview...
              </div>
            )}
          </section>

          {error ? (
            <div className="mt-3 rounded-lg border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
              {error}
            </div>
          ) : null}

          {cleanupMessage ? (
            <div className="mt-3 rounded-lg border border-[var(--lumeo-gold)]/18 bg-[var(--lumeo-gold)]/[0.06] p-4 text-sm font-medium text-[var(--text-primary)]">
              {cleanupMessage}
            </div>
          ) : null}
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="Signature" description="Draw or type your signature, then place it on the page.">
          <div className="flex h-full min-h-0 flex-col">
            <AuraSegmentedControl
              label="Signature type"
              options={[
                { value: "draw", label: "Draw" },
                { value: "type", label: "Type" },
              ]}
              value={mode}
              onChange={(value) => setMode(value as SignatureMode)}
            />

            <div className="mt-3">
              {mode === "draw" ? (
                <div>
                  <canvas
                    ref={drawCanvasRef}
                    width={SIGN_CANVAS_WIDTH}
                    height={SIGN_CANVAS_HEIGHT}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    className="w-full touch-none rounded-lg border border-[var(--text-primary)]/14 bg-white"
                    style={{ aspectRatio: `${SIGN_CANVAS_WIDTH} / ${SIGN_CANVAS_HEIGHT}` }}
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={clearDrawCanvas} className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/60 transition hover:border-[var(--text-primary)]/24">
                      Clear
                    </button>
                    <button type="button" onClick={() => void applyDrawnSignature()} className="rounded-full bg-[var(--lumeo-gold)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--lumeo-seal-500)]">
                      Use this signature
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    value={typedText}
                    onChange={(event) => setTypedText(event.target.value)}
                    placeholder="Type your name"
                    className="h-11 w-full rounded-lg border border-[var(--text-primary)]/14 bg-[var(--text-primary)]/[0.035] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--lumeo-gold)]/45"
                  />
                  <button type="button" onClick={() => void applyTypedSignature()} className="mt-2 rounded-full bg-[var(--lumeo-gold)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--lumeo-seal-500)]">
                    Use this signature
                  </button>
                </div>
              )}
            </div>

            {signature ? (
              <div className="mt-3 rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]/40">Signature ready</p>
                  <button type="button" onClick={clearSignature} className="text-xs font-semibold text-[var(--text-danger)]/80 hover:text-[var(--text-danger)]">
                    Remove
                  </button>
                </div>
                <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]/40">
                  Size
                  <input
                    type="range"
                    min={10}
                    max={55}
                    value={placement.widthPct}
                    onChange={(event) => {
                      setPlacement((current) => ({ ...current, widthPct: Number(event.target.value) }));
                      setDownloadUrl("");
                    }}
                    className="mt-1.5 w-full"
                  />
                </label>
              </div>
            ) : null}

            <div className="mt-3">
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
            </div>

            <div className="mt-auto pt-3">
              {downloadUrl ? (
                <L2ActionArea
                  primary={(
                    <button
                      type="button"
                      onClick={downloadSignedPdf}
                      className="lumeo-primary-action w-full rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)]"
                    >
                      Download signed PDF
                    </button>
                  )}
                />
              ) : (
                <L2ActionArea
                  primary={(
                    <button
                      type="button"
                      disabled={!signature || isGenerating}
                      onClick={() => void generateSignedPdf()}
                      className="lumeo-primary-action w-full rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {isGenerating ? "Signing..." : "Sign PDF"}
                    </button>
                  )}
                />
              )}
            </div>
          </div>
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>
    </section>
  );
}
