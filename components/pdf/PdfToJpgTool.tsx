"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
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
import { AuraIconButton, AuraSegmentedControl, AuraStatus } from "@/components/ui/Aura";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import { bucketFileSize } from "@/lib/analytics/size-bucket";

type SelectionMode = "all" | "range" | "custom";
type DpiPreset = "draft" | "standard" | "print";
type ConvertStatus = "Ready" | "Preparing document" | "Converting pages" | "Download ready";

type PdfAnalysis = {
  name: string;
  size: number;
  pageCount: number;
};

type JpgPageResult = {
  page: number;
  url: string;
  fileName: string;
  size: number;
  downloaded: boolean;
};

const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024;
const MAX_PAGE_COUNT = 500;
const LARGE_FILE_WARNING_BYTES = 40 * 1024 * 1024;
const VERY_LARGE_PAGE_COUNT = 150;
const TOOL_SLUG = "pdf-to-jpg";
const DOWNLOAD_STAGGER_MS = 300;

const dpiPresets: Array<{ value: DpiPreset; label: string; dpi: number; description: string }> = [
  { value: "draft", label: "Draft", dpi: 72, description: "Small files, quick previews." },
  { value: "standard", label: "Standard", dpi: 150, description: "Balanced quality and size." },
  { value: "print", label: "Print", dpi: 300, description: "High quality for printing." },
];

const selectionModeOptions: Array<{ value: SelectionMode; label: string }> = [
  { value: "all", label: "All pages" },
  { value: "range", label: "Page range" },
  { value: "custom", label: "Pick pages" },
];

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

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** power;
  return `${value >= 10 || power === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[power]}`;
}

function sanitizeFileStem(name: string, fallback: string) {
  const clean = name
    .replace(/\.[^/.]+$/, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/[. ]+$/g, "")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return clean || fallback;
}

function copyArrayBuffer(buffer: ArrayBuffer) {
  const source = new Uint8Array(buffer);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy.buffer;
}

// PDFs always start with the 4-byte "%PDF" signature. Checking this (rather
// than trusting the file extension or the browser-reported MIME type, both
// of which are trivially spoofable) catches renamed non-PDF files before
// they reach pdfjs.
function hasPdfMagicBytes(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer, 0, 4);
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function parsePageToken(token: string, totalPages: number): number | null {
  const trimmed = token.trim().toLowerCase();
  if (trimmed === "end" || trimmed === "last") return totalPages;
  if (trimmed === "first") return 1;
  if (!/^\d+$/.test(trimmed)) return null;
  const page = Number.parseInt(trimmed, 10);
  return Number.isInteger(page) ? page : null;
}

function parsePageSelection(input: string, totalPages: number): number[] {
  const text = input.trim().toLowerCase();
  if (!text) throw new Error("Use a range such as 1-5, 8, or 10-end.");
  if (text === "all") return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages: number[] = [];
  const seen = new Set<number>();

  for (const rawPart of text.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;

    if (part.includes("-")) {
      const pieces = part.split("-").map((piece) => piece.trim());
      if (pieces.length !== 2 || !pieces[0] || !pieces[1]) {
        throw new Error(`"${part}" is not a valid range.`);
      }
      const start = parsePageToken(pieces[0], totalPages);
      const end = parsePageToken(pieces[1], totalPages);
      if (start === null || end === null) throw new Error(`"${part}" is not a valid range.`);
      if (start < 1 || start > totalPages || end < 1 || end > totalPages) {
        throw new Error(`Range ${part} is outside this ${totalPages}-page document.`);
      }
      if (start > end) throw new Error(`Range ${part} is reversed. Use ${end}-${start} instead.`);
      for (let page = start; page <= end; page += 1) {
        if (!seen.has(page)) {
          seen.add(page);
          pages.push(page);
        }
      }
    } else {
      const page = parsePageToken(part, totalPages);
      if (page === null) throw new Error(`"${part}" is not a valid page number.`);
      if (page < 1 || page > totalPages) {
        throw new Error(`Page ${page} is outside this ${totalPages}-page document.`);
      }
      if (!seen.has(page)) {
        seen.add(page);
        pages.push(page);
      }
    }
  }

  if (!pages.length) throw new Error("Choose at least one page.");
  return pages;
}

function downloadBlobUrl(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function PdfToJpgIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <path
        d="M8 5.5h10.5l4.5 4.5v16.5H8v-21Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path d="M18.4 6v4.4h4.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <circle cx="12.2" cy="16.6" r="1.3" fill="currentColor" />
      <path
        d="M10 22.4l3.1-3.6 2.6 2.8L20 17.6l2.9 3.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

type ThumbnailProps = {
  page: number;
  selected: boolean;
  focused: boolean;
  imageUrl?: string;
  loading: boolean;
  interactive: boolean;
  onVisible: (page: number) => void;
  onToggle: (page: number) => void;
  onFocus: (page: number) => void;
  registerRef: (page: number, node: HTMLButtonElement | null) => void;
};

function PdfToJpgThumbnail({
  page,
  selected,
  focused,
  imageUrl,
  loading,
  interactive,
  onVisible,
  onToggle,
  onFocus,
  registerRef,
}: ThumbnailProps) {
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || imageUrl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onVisible(page);
          observer.disconnect();
        }
      },
      { rootMargin: "180px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [imageUrl, onVisible, page]);

  return (
    <button
      ref={(node) => {
        ref.current = node;
        registerRef(page, node);
      }}
      type="button"
      role="gridcell"
      aria-selected={selected}
      aria-label={`Page ${page}${interactive ? (selected ? ", selected" : ", not selected") : ""}`}
      tabIndex={focused ? 0 : -1}
      disabled={!interactive}
      onClick={() => onToggle(page)}
      onFocus={() => onFocus(page)}
      className={`group rounded-xl border p-2 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#CBA052]/45 disabled:cursor-default ${
        selected
          ? "border-[var(--border-selected)] bg-[var(--surface-selected)] shadow-[0_12px_30px_rgba(0,0,0,0.12)]"
          : focused
            ? "border-[var(--border-selected)] bg-[#FFFFFF]/[0.055]"
            : "border-[#FFFFFF]/8 bg-[#FFFFFF]/[0.035] hover:-translate-y-0.5 hover:border-[var(--border-selected)]"
      }`}
    >
      <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-lg border border-[#FFFFFF]/10 bg-[#FFFFFF]/[0.045]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`Page ${page} preview`}
            className="h-full max-h-full w-full object-contain transition-opacity duration-300"
          />
        ) : (
          <div className="flex h-full w-full animate-pulse items-center justify-center bg-[#FFFFFF]/8 text-[10px] font-bold uppercase tracking-[0.18em] text-[#FFFFFF]/28">
            {loading ? "Preview" : "Page"}
          </div>
        )}
        {selected ? (
          <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border border-[var(--border-selected)] bg-[#0C1220]/88 text-[10px] font-bold text-[#CBA052]">
            ✓
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-xs font-bold text-[#FFFFFF]">Page {page}</p>
    </button>
  );
}

export default function PdfToJpgTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);
  const pdfJsDocRef = useRef<PDFDocumentProxy | null>(null);
  const sessionRef = useRef(0);
  const thumbnailTasksRef = useRef<Map<number, RenderTask>>(new Map());
  const thumbnailUrlsRef = useRef<Set<string>>(new Set());
  const renderingRef = useRef<Set<number>>(new Set());
  const pendingRenderRef = useRef<Set<number>>(new Set());
  const gridButtonsRef = useRef<Map<number, HTMLButtonElement>>(new Map());
  const statusRegionRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<JpgPageResult[]>([]);

  const [analysis, setAnalysis] = useState<PdfAnalysis | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("all");
  const [rangeInput, setRangeInput] = useState("1");
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [focusedPage, setFocusedPage] = useState<number | null>(null);
  const [dpiPreset, setDpiPreset] = useState<DpiPreset>("standard");
  const [quality, setQuality] = useState(0.85);
  const [outputName, setOutputName] = useState("lumeo-pages");
  const [status, setStatus] = useState<ConvertStatus>("Ready");
  const [progressDetail, setProgressDetail] = useState("");
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [error, setError] = useState("");
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [results, setResults] = useState<JpgPageResult[]>([]);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({});
  const [thumbnailLoading, setThumbnailLoading] = useState<Record<number, boolean>>({});

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  const pageNumbers = useMemo(
    () => (analysis ? Array.from({ length: analysis.pageCount }, (_, index) => index + 1) : []),
    [analysis],
  );

  const largeFile = Boolean(analysis && analysis.size > LARGE_FILE_WARNING_BYTES);
  const manyPages = Boolean(analysis && analysis.pageCount > VERY_LARGE_PAGE_COUNT);
  const selectedPreset = dpiPresets.find((item) => item.value === dpiPreset) ?? dpiPresets[1];

  const clearThumbnails = useCallback(() => {
    thumbnailTasksRef.current.forEach((task) => {
      try {
        task.cancel();
      } catch {
        // Best-effort render cancellation.
      }
    });
    thumbnailTasksRef.current.clear();
    pendingRenderRef.current.clear();
    renderingRef.current.clear();
    thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    thumbnailUrlsRef.current.clear();
    setThumbnailUrls({});
    setThumbnailLoading({});
  }, []);

  const destroyPdfJsDocument = useCallback(async () => {
    const doc = pdfJsDocRef.current;
    pdfJsDocRef.current = null;
    if (doc) {
      try {
        await (doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
      } catch {
        // PDF.js may already be cleaning itself up.
      }
    }
  }, []);

  const clearResults = useCallback((message = "") => {
    resultsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    setResults([]);
    setCleanupMessage(message);
  }, []);

  useEffect(() => {
    return () => {
      resultsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
      clearThumbnails();
      void destroyPdfJsDocument();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const trackResult = track({ eventName: "tool_opened", toolSlug: TOOL_SLUG });
    if (trackResult.accepted) {
      openedTrackedRef.current = true;
    }
  }, [availability, track]);

  useEffect(() => {
    if (isConverting || status === "Download ready") {
      statusRegionRef.current?.focus();
    }
  }, [isConverting, status]);

  function resetTool() {
    sessionRef.current += 1;
    clearResults();
    clearThumbnails();
    void destroyPdfJsDocument();
    setAnalysis(null);
    setSelectionMode("all");
    setRangeInput("1");
    setSelectedPages([]);
    setFocusedPage(null);
    setOutputName("lumeo-pages");
    setError("");
    setStatus("Ready");
    setProgressDetail("");
    setProgressCurrent(0);
    setProgressTotal(0);
  }

  const scheduleThumbnailRender = useCallback(
    (pageNumber: number) => {
      if (!pdfJsDocRef.current || thumbnailUrls[pageNumber] || renderingRef.current.has(pageNumber)) return;

      pendingRenderRef.current.add(pageNumber);

      const runQueue = async () => {
        const currentSession = sessionRef.current;
        while (renderingRef.current.size < 3 && pendingRenderRef.current.size > 0) {
          const next = pendingRenderRef.current.values().next().value as number | undefined;
          if (!next) return;
          pendingRenderRef.current.delete(next);
          renderingRef.current.add(next);
          setThumbnailLoading((current) => ({ ...current, [next]: true }));

          void (async () => {
            try {
              const doc = pdfJsDocRef.current;
              if (!doc) return;
              const page = await doc.getPage(next);
              if (currentSession !== sessionRef.current) return;

              const viewport = page.getViewport({ scale: 0.3 });
              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d", { alpha: false });
              if (!context) return;
              canvas.width = Math.max(1, Math.floor(viewport.width));
              canvas.height = Math.max(1, Math.floor(viewport.height));
              context.fillStyle = "#FFFFFF";
              context.fillRect(0, 0, canvas.width, canvas.height);

              const task = page.render({ canvas, canvasContext: context, viewport });
              thumbnailTasksRef.current.set(next, task);
              await task.promise;
              thumbnailTasksRef.current.delete(next);
              if (currentSession !== sessionRef.current) return;

              const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/jpeg", 0.7),
              );
              canvas.width = 0;
              canvas.height = 0;
              if (!blob || currentSession !== sessionRef.current) return;

              const url = URL.createObjectURL(blob);
              thumbnailUrlsRef.current.add(url);
              setThumbnailUrls((current) => ({ ...current, [next]: url }));
            } catch (thumbnailError) {
              const maybeError = thumbnailError as Error;
              if (maybeError.name !== "RenderingCancelledException") {
                setProgressDetail("Some previews could not be rendered.");
              }
            } finally {
              renderingRef.current.delete(next);
              setThumbnailLoading((current) => ({ ...current, [next]: false }));
              if (currentSession === sessionRef.current) void runQueue();
            }
          })();
        }
      };

      void runQueue();
    },
    [thumbnailUrls],
  );

  async function readPdfFile(file: File) {
    const nextSession = sessionRef.current + 1;
    sessionRef.current = nextSession;
    setError("");
    setCleanupMessage("");
    setProgressDetail("");
    setStatus("Preparing document");
    clearResults();
    clearThumbnails();
    await destroyPdfJsDocument();

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setStatus("Ready");
      setError("Please add one PDF file.");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatus("Ready");
      setError(`This file is too large. The limit is ${formatBytes(MAX_FILE_SIZE_BYTES)}.`);
      return;
    }

    try {
      const bytes = await file.arrayBuffer();

      if (!hasPdfMagicBytes(bytes)) {
        setStatus("Ready");
        setError("This doesn't look like a valid PDF file.");
        return;
      }

      const pdfJs = await loadPdfJsModule();
      const loadingTask = pdfJs.getDocument({
        data: new Uint8Array(copyArrayBuffer(bytes)),
        useWorkerFetch: false,
      });
      const pdfJsDoc = await loadingTask.promise;

      if (nextSession !== sessionRef.current) {
        await (pdfJsDoc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
        return;
      }

      if (pdfJsDoc.numPages === 0) {
        await (pdfJsDoc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
        setStatus("Ready");
        setError("This PDF has no pages.");
        return;
      }

      if (pdfJsDoc.numPages > MAX_PAGE_COUNT) {
        await (pdfJsDoc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
        setStatus("Ready");
        setError(`This PDF has too many pages. The limit is ${MAX_PAGE_COUNT} pages.`);
        return;
      }

      pdfJsDocRef.current = pdfJsDoc;

      const nextAnalysis: PdfAnalysis = {
        name: file.name,
        size: file.size,
        pageCount: pdfJsDoc.numPages,
      };

      setAnalysis(nextAnalysis);
      setSelectionMode("all");
      setRangeInput(`1-${nextAnalysis.pageCount}`);
      setSelectedPages([1]);
      setFocusedPage(1);
      setOutputName(sanitizeFileStem(file.name, "lumeo-pages"));
      setStatus("Ready");
      setProgressDetail(
        nextAnalysis.pageCount > VERY_LARGE_PAGE_COUNT
          ? "Large document loaded. Previews render as needed."
          : "Document ready.",
      );
    } catch (readError) {
      const isPasswordProtected =
        readError instanceof Error &&
        (readError.name === "PasswordException" || /password|encrypt/i.test(readError.message));
      setStatus("Ready");
      setError(
        isPasswordProtected
          ? "This file appears to be password-protected or encrypted."
          : "This file could not be read. It may be damaged or an unsupported PDF.",
      );
      setAnalysis(null);
    }
  }

  function handleFiles(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;
    void readPdfFile(file);
  }

  function togglePage(page: number) {
    if (selectionMode !== "custom" || !analysis) return;
    setSelectedPages((current) =>
      current.includes(page)
        ? current.filter((item) => item !== page)
        : [...current, page].sort((a, b) => a - b),
    );
    setFocusedPage(page);
    clearResults();
  }

  function selectAllCustom() {
    if (!analysis) return;
    setSelectedPages(pageNumbers);
    clearResults();
  }

  function clearCustomSelection() {
    setSelectedPages([]);
    clearResults();
  }

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!analysis || selectionMode !== "custom" || !focusedPage) return;
    const total = analysis.pageCount;
    let next = focusedPage;

    if (event.key === "ArrowRight") next = Math.min(focusedPage + 1, total);
    else if (event.key === "ArrowLeft") next = Math.max(focusedPage - 1, 1);
    else if (event.key === "Home") next = 1;
    else if (event.key === "End") next = total;
    else return;

    event.preventDefault();
    setFocusedPage(next);
    gridButtonsRef.current.get(next)?.focus();
  }

  function getSelectedPages(): number[] {
    if (!analysis) throw new Error("Please add one PDF file.");
    if (selectionMode === "all") return pageNumbers;
    if (selectionMode === "range") return parsePageSelection(rangeInput, analysis.pageCount);
    if (!selectedPages.length) throw new Error("Choose at least one page.");
    return [...selectedPages].sort((a, b) => a - b);
  }

  const selectionPreview = useMemo(() => {
    if (!analysis) return null;
    try {
      const pages = getSelectedPages();
      return { valid: true as const, count: pages.length };
    } catch (previewError) {
      return {
        valid: false as const,
        message: previewError instanceof Error ? previewError.message : "Check your page selection.",
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, rangeInput, selectedPages, selectionMode]);

  async function convertPages() {
    if (!analysis || isConverting) {
      if (!analysis) setError("Please add one PDF file.");
      return;
    }

    let pages: number[];
    try {
      pages = getSelectedPages();
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Choose at least one page.");
      return;
    }

    setIsConverting(true);
    setError("");
    setCleanupMessage("");
    clearResults();
    setStatus("Converting pages");
    setProgressCurrent(0);
    setProgressTotal(pages.length);

    const startedAt = performance.now();
    const inputSizeBucket = bucketFileSize(analysis.size);
    track({ eventName: "processing_started", toolSlug: TOOL_SLUG, inputSizeBucket });

    try {
      const doc = pdfJsDocRef.current;
      if (!doc) throw new Error("Document is not ready. Please add the PDF again.");

      const scale = selectedPreset.dpi / 72;
      const baseName = sanitizeFileStem(outputName || "lumeo-pages", "lumeo-pages");
      const digits = String(analysis.pageCount).length;
      const nextResults: JpgPageResult[] = [];
      let totalOutputSize = 0;

      for (let index = 0; index < pages.length; index += 1) {
        const pageNumber = pages[index];
        setProgressDetail(`Rendering page ${index + 1} of ${pages.length}.`);

        // pdfjs applies the page's own /Rotate entry by default when no
        // explicit rotation is passed to getViewport, so rendered pages
        // already respect the PDF's stored rotation metadata.
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas is not supported in this browser.");
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);

        const task = page.render({ canvas, canvasContext: context, viewport });
        await task.promise;

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) throw new Error(`Page ${pageNumber} could not be exported.`);

        const fileName =
          pages.length === 1 ? `${baseName}.jpg` : `${baseName}-page-${String(pageNumber).padStart(digits, "0")}.jpg`;

        nextResults.push({
          page: pageNumber,
          url: URL.createObjectURL(blob),
          fileName,
          size: blob.size,
          downloaded: false,
        });
        totalOutputSize += blob.size;
        setProgressCurrent(index + 1);
      }

      setResults(nextResults);
      setStatus("Download ready");
      setProgressDetail("Conversion complete.");

      track({
        eventName: "processing_succeeded",
        toolSlug: TOOL_SLUG,
        durationMs: Math.round(performance.now() - startedAt),
        inputSizeBucket,
        outputSizeBucket: bucketFileSize(totalOutputSize),
        success: true,
      });
    } catch (convertError) {
      const message =
        convertError instanceof Error
          ? convertError.message
          : "Conversion failed. Try a smaller PDF or fewer pages.";
      setError(message || "Conversion failed. Try a smaller PDF or fewer pages.");
      setStatus("Ready");
      setProgressDetail("");
      track({
        eventName: "processing_failed",
        toolSlug: TOOL_SLUG,
        inputSizeBucket,
        success: false,
        errorCode: "processing_error",
      });
    } finally {
      setIsConverting(false);
    }
  }

  function handleDownloadOne(item: JpgPageResult) {
    track({
      eventName: "download_started",
      toolSlug: TOOL_SLUG,
      outputSizeBucket: bucketFileSize(item.size),
    });
    downloadBlobUrl(item.url, item.fileName);
    setResults((current) =>
      current.map((entry) => (entry.page === item.page ? { ...entry, downloaded: true } : entry)),
    );
  }

  async function handleDownloadAll() {
    if (!results.length || isDownloadingAll) return;
    setIsDownloadingAll(true);

    const pending = results.filter((item) => !item.downloaded);
    for (let index = 0; index < pending.length; index += 1) {
      handleDownloadOne(pending[index]);
      if (index < pending.length - 1) await delay(DOWNLOAD_STAGGER_MS);
    }

    setIsDownloadingAll(false);
  }

  const allDownloaded = results.length > 0 && results.every((item) => item.downloaded);
  const totalResultSize = results.reduce((sum, item) => sum + item.size, 0);

  if (!analysis) {
    return (
      <section className="l2-tool-empty-state grid gap-4 pb-4 lg:pb-0">
        <div className="mx-auto w-full max-w-[1040px]">
          <L2UploadStage
            inputId="pdf-to-jpg-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · One file"
            multiple={false}
            icon={<PdfToJpgIcon />}
            privacyNote="Browser-first processing for supported live tools"
            buttonLabel="Select PDF"
            onFilesSelected={handleFiles}
          />
        </div>

        <L2PrivacyNote />

        {error ? (
          <div role="alert" className="mt-4 rounded-lg border border-[#F0A8A8]/20 bg-[#F0A8A8]/10 p-4 text-sm font-medium text-[#F0C0C0]">
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
          <div className="flex min-h-0 flex-col gap-3 rounded-xl border border-[#FFFFFF]/14 bg-gradient-to-br from-[#111A2B] via-[#0F1727] to-[#0A101C] p-3 shadow-2xl shadow-black/32">
            <section className="shrink-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#CBA052]">
                    Document
                  </p>
                  <p className="mt-0.5 text-xs text-[#FFFFFF]/48">Source PDF.</p>
                </div>
                <button
                  type="button"
                  onClick={resetTool}
                  className="rounded-full border border-[#FFFFFF]/12 px-3 py-1.5 text-xs font-semibold text-[#FFFFFF]/56 transition hover:border-[#FFFFFF]/22 hover:text-[#FFFFFF]"
                >
                  Start new
                </button>
              </div>

              <div className="rounded-lg border border-[#FFFFFF]/10 bg-[#0A101C]/74 px-3 py-2">
                <L2FileCard
                  name={analysis.name}
                  meta={`${analysis.pageCount} page${analysis.pageCount === 1 ? "" : "s"} · ${formatBytes(analysis.size)}`}
                  icon={<FileIcon />}
                  action={<AuraStatus tone="success" label={status} />}
                />
              </div>
            </section>

            {largeFile || manyPages ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {largeFile ? (
                  <div className="rounded-xl border border-[#CBA052]/20 bg-[#CBA052]/8 px-3 py-2 text-xs text-[#FFFFFF]/72">
                    Large files may take longer because conversion happens in your browser.
                  </div>
                ) : null}
                {manyPages ? (
                  <div className="rounded-xl border border-[#CBA052]/20 bg-[#CBA052]/8 px-3 py-2 text-xs text-[#FFFFFF]/72">
                    Previews render progressively for this document.
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[#FFFFFF]/10 bg-[#0A101C]/62 p-3">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#CBA052]">Pages</p>
                  <p className="text-xs text-[#FFFFFF]/38">
                    {selectionMode === "custom"
                      ? `Selected: ${selectedPages.length} ${selectedPages.length === 1 ? "page" : "pages"}`
                      : `${analysis.pageCount} pages in this PDF`}
                  </p>
                </div>
                {selectionMode === "custom" ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllCustom}
                      className="rounded-full border border-[#FFFFFF]/12 px-3 py-1.5 text-xs font-semibold text-[#FFFFFF]/56 transition hover:border-[#FFFFFF]/22 hover:text-[#FFFFFF]"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={clearCustomSelection}
                      disabled={!selectedPages.length}
                      className="rounded-full border border-[#FFFFFF]/12 px-3 py-1.5 text-xs font-semibold text-[#FFFFFF]/56 transition hover:border-[#FFFFFF]/22 hover:text-[#FFFFFF] disabled:opacity-35"
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
              </div>

              <div
                role="grid"
                aria-label="PDF pages"
                onKeyDown={handleGridKeyDown}
                className="no-scrollbar grid max-h-[420px] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
              >
                {pageNumbers.map((page) => (
                  <PdfToJpgThumbnail
                    key={page}
                    page={page}
                    selected={selectionMode === "custom" ? selectedPages.includes(page) : true}
                    focused={focusedPage === page}
                    imageUrl={thumbnailUrls[page]}
                    loading={Boolean(thumbnailLoading[page])}
                    interactive={selectionMode === "custom"}
                    onVisible={scheduleThumbnailRender}
                    onToggle={togglePage}
                    onFocus={setFocusedPage}
                    registerRef={(pageNumber, node) => {
                      if (node) gridButtonsRef.current.set(pageNumber, node);
                      else gridButtonsRef.current.delete(pageNumber);
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="no-scrollbar space-y-2 lg:max-h-[74px] lg:overflow-y-auto">
            {error ? (
              <div role="alert" className="rounded-lg border border-red-400/20 bg-red-500/10 p-4 text-sm font-medium text-red-100/86">
                {error}
              </div>
            ) : null}

            {cleanupMessage ? (
              <div className="rounded-lg border border-[#CBA052]/18 bg-[#CBA052]/[0.06] p-4 text-sm font-medium text-[#FFFFFF]">
                {cleanupMessage}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[#0A101C]/70 px-4 py-2 text-xs text-[#FFFFFF]/54 shadow-inner shadow-black/20">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <L2PrivacyNote compact />
              <p className="lg:hidden">Files stay on your device. No server upload.</p>
            </div>
          </div>
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="PDF to JPG options" description="Export selected pages as JPG images.">
          <div className="flex h-full min-h-0 flex-col">
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[#0A101C]/74 p-3 shadow-inner shadow-black/20">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFFFFF]/34">Page selection</p>
                <div className="mt-2">
                  <AuraSegmentedControl
                    label="Page selection"
                    options={selectionModeOptions}
                    value={selectionMode}
                    onChange={(value) => {
                      setSelectionMode(value as SelectionMode);
                      if (value === "custom" && !selectedPages.length && analysis) {
                        setSelectedPages([1]);
                      }
                      clearResults();
                    }}
                  />
                </div>

                {selectionMode === "range" ? (
                  <input
                    value={rangeInput}
                    onChange={(event) => {
                      setRangeInput(event.target.value);
                      clearResults();
                    }}
                    placeholder="1-3, 5, 8-end"
                    className="mt-2.5 w-full rounded-md border border-[#FFFFFF]/12 bg-[#0C1220]/70 px-2.5 py-1.5 text-sm font-semibold text-[#FFFFFF] outline-none transition placeholder:text-[#FFFFFF]/26 focus:border-[#CBA052]/45"
                  />
                ) : null}

                {selectionPreview && !selectionPreview.valid ? (
                  <p className="mt-2 text-xs font-semibold text-[#F0C0C0]">{selectionPreview.message}</p>
                ) : null}
              </div>

              <div className="mt-2.5 rounded-lg border border-[var(--border-subtle)] bg-[#0A101C]/74 p-3 shadow-inner shadow-black/20">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFFFFF]/34">Output</p>

                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {dpiPresets.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      aria-pressed={dpiPreset === preset.value}
                      onClick={() => {
                        setDpiPreset(preset.value);
                        clearResults();
                      }}
                      className={`rounded-lg border px-2 py-1.5 text-center transition ${
                        dpiPreset === preset.value
                          ? "border-[var(--border-selected)] bg-[var(--surface-selected)]"
                          : "border-[#FFFFFF]/10 bg-[#FFFFFF]/[0.03] hover:border-[var(--border-selected)]"
                      }`}
                    >
                      <span className="block text-xs font-bold text-[#FFFFFF]">{preset.label}</span>
                      <span className="block text-[10px] text-[#FFFFFF]/44">{preset.dpi} dpi</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-[#FFFFFF]/40">{selectedPreset.description}</p>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFFFFF]/34">
                    Quality
                  </span>
                  <span className="text-xs font-bold text-[#FFFFFF]">{Math.round(quality * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={1}
                  step={0.05}
                  value={quality}
                  onChange={(event) => {
                    setQuality(Number(event.target.value));
                    clearResults();
                  }}
                  className="mt-1.5 w-full accent-[#CBA052]"
                  aria-label="JPEG quality"
                  aria-valuetext={`${Math.round(quality * 100)}%`}
                />

                <label className="mt-3 block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFFFFF]/34">
                    File name
                  </span>
                  <input
                    value={outputName}
                    onChange={(event) => {
                      setOutputName(event.target.value);
                      clearResults();
                    }}
                    className="mt-1.5 w-full rounded-md border border-[#FFFFFF]/12 bg-[#0C1220]/70 px-2.5 py-1.5 text-sm font-semibold text-[#FFFFFF] outline-none transition placeholder:text-[#FFFFFF]/26 focus:border-[#CBA052]/45"
                    placeholder="lumeo-pages"
                  />
                </label>
              </div>
            </div>

            <div className="mt-2.5 border-t border-[#FFFFFF]/10 pt-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#CBA052]">Finish</p>

              <div ref={statusRegionRef} tabIndex={-1} aria-live="polite" className="outline-none">
                {isConverting ? (
                  <div className="mt-3">
                    <p className="text-base font-semibold text-[#FFFFFF]">{status}</p>
                    <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/46">{progressDetail}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#FFFFFF]/10">
                      <div
                        className="h-full rounded-full bg-[#CBA052] transition-all duration-200"
                        style={{
                          width: progressTotal
                            ? `${Math.round((progressCurrent / progressTotal) * 100)}%`
                            : "8%",
                        }}
                      />
                    </div>
                  </div>
                ) : results.length ? (
                  <div className="mt-3">
                    <p className="text-base font-semibold text-[#FFFFFF]">
                      {results.length} JPG{results.length === 1 ? "" : "s"} ready
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/46">
                      {formatBytes(totalResultSize)} total
                    </p>

                    <div className="mt-2.5 flex flex-col gap-2">
                      <L2ActionArea
                        primary={(
                          <button
                            type="button"
                            disabled={allDownloaded || isDownloadingAll}
                            onClick={() => void handleDownloadAll()}
                            className="lumeo-primary-action rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.98]"
                          >
                            {isDownloadingAll
                              ? "Downloading…"
                              : allDownloaded
                                ? "All downloaded"
                                : results.length === 1
                                  ? "Download JPG"
                                  : "Download all"}
                          </button>
                        )}
                        secondary={(
                          <button
                            type="button"
                            onClick={resetTool}
                            className="rounded-[var(--radius-md)] border border-[#FFFFFF]/12 px-5 py-2.5 text-sm font-semibold text-[#FFFFFF]/62 transition hover:border-[#FFFFFF]/24 hover:text-[#FFFFFF]"
                          >
                            Start new
                          </button>
                        )}
                      />
                    </div>

                    {results.length > 1 ? (
                      <div className="no-scrollbar mt-3 max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                        {results.map((item) => (
                          <div
                            key={item.page}
                            className="flex items-center gap-2 rounded-lg border border-[#FFFFFF]/10 bg-[#0C1220]/50 px-2.5 py-1.5"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#FFFFFF]/10 bg-[#FFFFFF]/[0.04]">
                              {thumbnailUrls[item.page] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={thumbnailUrls[item.page]}
                                  alt={`Page ${item.page} thumbnail`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <FileIcon />
                              )}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#FFFFFF]/80">
                              {item.fileName}
                            </span>
                            <span className="shrink-0 text-[10px] text-[#FFFFFF]/40">{formatBytes(item.size)}</span>
                            {item.downloaded ? (
                              <span className="shrink-0 text-[10px] font-bold text-[#8FBF9F]">Downloaded</span>
                            ) : (
                              <AuraIconButton label={`Download ${item.fileName}`} onClick={() => handleDownloadOne(item)}>
                                ↓
                              </AuraIconButton>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3">
                    <p className="text-base font-semibold text-[#FFFFFF]">Ready to convert</p>
                    <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/46">
                      {selectionPreview?.valid
                        ? `${selectionPreview.count} page${selectionPreview.count === 1 ? "" : "s"} · ${selectedPreset.label} (${selectedPreset.dpi} dpi)`
                        : "Choose pages to convert."}
                    </p>
                    <L2ActionArea
                      primary={(
                        <button
                          type="button"
                          disabled={!selectionPreview?.valid}
                          onClick={() => void convertPages()}
                          className="lumeo-primary-action mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 active:scale-[0.98]"
                        >
                          Convert to JPG
                        </button>
                      )}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>
    </section>
  );
}
