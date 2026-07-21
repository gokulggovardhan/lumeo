"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
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
import { loadPdfJsModule, renderPageWithTimeout } from "@/lib/pdf/pdfjs";
import { formatBytes } from "@/lib/pdf/formatBytes";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { copyArrayBuffer } from "@/lib/pdf/arrayBuffer";
import { normalizeRotation } from "@/lib/pdf/rotation";
import {
  hasPdfMagicBytes,
  isPdfNamedFile,
  checkPdfFileSize,
  checkPdfPageCount,
} from "@/lib/pdf/uploadValidation";

type SelectionMode = "all" | "range" | "custom";
type DpiPreset = "draft" | "standard" | "print";
type OutputFormat = "jpeg" | "png" | "webp";
type ConvertStatus = "Ready" | "Preparing document" | "Converting pages" | "Download ready";

type PdfAnalysis = {
  name: string;
  size: number;
  pageCount: number;
};

type JpgPageResult = {
  page: number;
  url: string;
  blob: Blob;
  fileName: string;
  size: number;
  downloaded: boolean;
};

const LARGE_FILE_WARNING_BYTES = 40 * 1024 * 1024;
const VERY_LARGE_PAGE_COUNT = 150;
const TOOL_SLUG = "pdf-to-jpg";
const DOWNLOAD_STAGGER_MS = 300;
const THUMBNAIL_SCALE = 0.3;
const THUMBNAIL_JPEG_QUALITY = 0.7;
const PNG_SIZE_FACTOR = 2.2;
const WEBP_SIZE_FACTOR = 0.75;
const DPI_PRESET_KEY = "lumeo.pdfToJpg.dpiPreset";
const QUALITY_KEY = "lumeo.pdfToJpg.quality";
const FORMAT_KEY = "lumeo.pdfToJpg.format";

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

function readStoredDpiPreset(): DpiPreset {
  if (typeof window === "undefined") return "standard";
  const stored = window.localStorage.getItem(DPI_PRESET_KEY);
  return stored === "draft" || stored === "standard" || stored === "print" ? stored : "standard";
}

function readStoredQuality(): number {
  if (typeof window === "undefined") return 0.85;
  const stored = Number(window.localStorage.getItem(QUALITY_KEY));
  return Number.isFinite(stored) && stored >= 0.5 && stored <= 1 ? stored : 0.85;
}

function readStoredFormat(): OutputFormat {
  if (typeof window === "undefined") return "jpeg";
  const stored = window.localStorage.getItem(FORMAT_KEY);
  return stored === "png" || stored === "webp" ? stored : "jpeg";
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
  rotation: number;
  onVisible: (page: number) => void;
  onToggle: (page: number) => void;
  onFocus: (page: number) => void;
  onRotate: (page: number, direction: -1 | 1) => void;
  onPreview: (page: number) => void;
  registerRef: (page: number, node: HTMLButtonElement | null) => void;
};

function PdfToJpgThumbnail({
  page,
  selected,
  focused,
  imageUrl,
  loading,
  interactive,
  rotation,
  onVisible,
  onToggle,
  onFocus,
  onRotate,
  onPreview,
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
    <div
      role="gridcell"
      aria-selected={selected}
      className={`group relative rounded-xl border p-2 transition-all duration-200 ${
        selected
          ? "border-[var(--border-selected)] bg-[var(--surface-selected)] shadow-[0_12px_30px_rgba(0,0,0,0.12)]"
          : focused
            ? "border-[var(--border-selected)] bg-[var(--text-primary)]/[0.055]"
            : "border-[var(--text-primary)]/8 bg-[var(--text-primary)]/[0.035] hover:-translate-y-0.5 hover:border-[var(--border-selected)]"
      }`}
    >
      <button
        ref={(node) => {
          ref.current = node;
          registerRef(page, node);
        }}
        type="button"
        aria-label={`Page ${page}${interactive ? (selected ? ", selected" : ", not selected") : ""}`}
        tabIndex={focused ? 0 : -1}
        disabled={!interactive}
        onClick={() => onToggle(page)}
        onFocus={() => onFocus(page)}
        className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-[var(--lumeo-gold)]/45 disabled:cursor-default"
      >
        <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-lg border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.045]">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`Page ${page} preview`}
              className="h-full max-h-full w-full object-contain transition-opacity duration-300"
            />
          ) : (
            <div className="flex h-full w-full animate-pulse items-center justify-center bg-[var(--text-primary)]/8 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]/28">
              {loading ? "Preview" : "Page"}
            </div>
          )}
          {selected ? (
            <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border border-[var(--border-selected)] bg-[var(--atelier-surface-1)]/88 text-[10px] font-bold text-[var(--lumeo-gold)]">
              ✓
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-xs font-bold text-[var(--text-primary)]">Page {page}</p>
      </button>

      <div className="lumeo-reveal-on-interact pointer-events-none absolute inset-x-2 top-2 flex h-24 flex-col justify-between">
        <div className="flex justify-end">
          <button
            type="button"
            aria-label={`Preview page ${page}`}
            onClick={(event) => {
              event.stopPropagation();
              onPreview(page);
            }}
            className="pointer-events-auto grid h-8 w-8 place-items-center rounded-full border border-[var(--text-primary)]/20 bg-[var(--atelier-surface-1)]/90 text-[11px] text-[var(--text-primary)] transition hover:border-[var(--lumeo-gold)]/60"
          >
            ⤢
          </button>
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label={`Rotate page ${page} left`}
            onClick={(event) => {
              event.stopPropagation();
              onRotate(page, -1);
            }}
            className="pointer-events-auto grid h-8 w-8 place-items-center rounded-full border border-[var(--text-primary)]/20 bg-[var(--atelier-surface-1)]/90 text-[11px] text-[var(--text-primary)] transition hover:border-[var(--lumeo-gold)]/60"
          >
            ↺
          </button>
          {rotation ? (
            <span className="pointer-events-none rounded-full border border-[var(--text-primary)]/20 bg-[var(--atelier-surface-1)]/90 px-1.5 py-0.5 text-[9px] font-bold text-[var(--text-primary)]/70">
              {rotation}°
            </span>
          ) : null}
          <button
            type="button"
            aria-label={`Rotate page ${page} right`}
            onClick={(event) => {
              event.stopPropagation();
              onRotate(page, 1);
            }}
            className="pointer-events-auto grid h-8 w-8 place-items-center rounded-full border border-[var(--text-primary)]/20 bg-[var(--atelier-surface-1)]/90 text-[11px] text-[var(--text-primary)] transition hover:border-[var(--lumeo-gold)]/60"
          >
            ↻
          </button>
        </div>
      </div>
    </div>
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
  const rotationsRef = useRef<Record<number, number>>({});
  const previewUrlRef = useRef<string>("");
  const previewSessionRef = useRef(0);

  const [analysis, setAnalysis] = useState<PdfAnalysis | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("all");
  const [rangeInput, setRangeInput] = useState("1");
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [focusedPage, setFocusedPage] = useState<number | null>(null);
  const [dpiPreset, setDpiPreset] = useState<DpiPreset>(readStoredDpiPreset);
  const [quality, setQuality] = useState(readStoredQuality);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>(readStoredFormat);
  const [outputName, setOutputName] = useState("lumeo-pages");
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [status, setStatus] = useState<ConvertStatus>("Ready");
  const [progressDetail, setProgressDetail] = useState("");
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [error, setError] = useState("");
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [results, setResults] = useState<JpgPageResult[]>([]);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({});
  const [thumbnailLoading, setThumbnailLoading] = useState<Record<number, boolean>>({});
  const [thumbnailSizes, setThumbnailSizes] = useState<Record<number, number>>({});
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    rotationsRef.current = rotations;
  }, [rotations]);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    window.localStorage.setItem(DPI_PRESET_KEY, dpiPreset);
  }, [dpiPreset]);

  useEffect(() => {
    window.localStorage.setItem(QUALITY_KEY, String(quality));
  }, [quality]);

  useEffect(() => {
    window.localStorage.setItem(FORMAT_KEY, outputFormat);
  }, [outputFormat]);

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
    setThumbnailSizes({});
  }, []);

  const closePreview = useCallback(() => {
    previewSessionRef.current += 1;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    setPreviewUrl("");
    setPreviewSize(null);
    setPreviewPage(null);
    setPreviewLoading(false);
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
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
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
    closePreview();
    void destroyPdfJsDocument();
    setAnalysis(null);
    setSelectionMode("all");
    setRangeInput("1");
    setSelectedPages([]);
    setFocusedPage(null);
    setOutputName("lumeo-pages");
    setRotations({});
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

              const userRotation = rotationsRef.current[next] ?? 0;
              const effectiveRotation = normalizeRotation(page.rotate + userRotation);
              const viewport = page.getViewport({ scale: THUMBNAIL_SCALE, rotation: effectiveRotation });
              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d", { alpha: false });
              if (!context) return;
              canvas.width = Math.max(1, Math.floor(viewport.width));
              canvas.height = Math.max(1, Math.floor(viewport.height));
              context.fillStyle = "#FFFFFF";
              context.fillRect(0, 0, canvas.width, canvas.height);

              const task = page.render({ canvas, canvasContext: context, viewport });
              thumbnailTasksRef.current.set(next, task);
              await renderPageWithTimeout(task, next);
              thumbnailTasksRef.current.delete(next);
              if (currentSession !== sessionRef.current) return;

              const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/jpeg", THUMBNAIL_JPEG_QUALITY),
              );
              canvas.width = 0;
              canvas.height = 0;
              if (!blob || currentSession !== sessionRef.current) return;

              const url = URL.createObjectURL(blob);
              thumbnailUrlsRef.current.add(url);
              setThumbnailUrls((current) => ({ ...current, [next]: url }));
              setThumbnailSizes((current) => ({ ...current, [next]: blob.size }));
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

    if (!isPdfNamedFile(file)) {
      setStatus("Ready");
      setError("Please add one PDF file.");
      return;
    }

    const sizeError = checkPdfFileSize(file);
    if (sizeError) {
      setStatus("Ready");
      setError(sizeError);
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

      const pageCountError = checkPdfPageCount(pdfJsDoc.numPages);
      if (pageCountError) {
        await (pdfJsDoc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
        setStatus("Ready");
        setError(pageCountError);
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
      setRotations({});
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

  function rotatePage(page: number, direction: -1 | 1) {
    const nextRotation = normalizeRotation((rotationsRef.current[page] ?? 0) + direction * 90);
    rotationsRef.current = { ...rotationsRef.current, [page]: nextRotation };
    setRotations((current) => {
      const updated = { ...current };
      if (nextRotation === 0) delete updated[page];
      else updated[page] = nextRotation;
      return updated;
    });

    // Invalidate the cached thumbnail so it re-renders with the new rotation
    // the next time it scrolls into view.
    setThumbnailUrls((current) => {
      const url = current[page];
      if (!url) return current;
      URL.revokeObjectURL(url);
      thumbnailUrlsRef.current.delete(url);
      const next = { ...current };
      delete next[page];
      return next;
    });

    if (previewPage === page) void openPreview(page, nextRotation);
    clearResults();
  }

  async function openPreview(page: number, rotationOverride?: number) {
    const doc = pdfJsDocRef.current;
    if (!doc) return;

    const session = previewSessionRef.current + 1;
    previewSessionRef.current = session;
    setPreviewPage(page);
    setPreviewLoading(true);

    try {
      const pdfPage = await doc.getPage(page);
      if (session !== previewSessionRef.current) return;

      const userRotation = rotationOverride ?? rotationsRef.current[page] ?? 0;
      const effectiveRotation = normalizeRotation(pdfPage.rotate + userRotation);
      const targetLongEdge = 1100;
      const baseViewport = pdfPage.getViewport({ scale: 1, rotation: effectiveRotation });
      const scale = targetLongEdge / Math.max(baseViewport.width, baseViewport.height);
      const viewport = pdfPage.getViewport({ scale, rotation: effectiveRotation });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
      if (session !== previewSessionRef.current) return;

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      const renderedSize = { width: canvas.width, height: canvas.height };
      canvas.width = 0;
      canvas.height = 0;
      if (!blob || session !== previewSessionRef.current) return;

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewSize(renderedSize);
    } catch {
      if (session === previewSessionRef.current) setPreviewUrl("");
    } finally {
      if (session === previewSessionRef.current) setPreviewLoading(false);
    }
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

  // Rough live estimate from the already-rendered low-res thumbnails: scales
  // a sample thumbnail's JPEG size by the ratio of target-to-thumbnail pixel
  // area and quality. Approximate by nature (real compression varies with
  // page content) — labeled "Estimated" in the UI rather than exact.
  const estimatedOutputSize = useMemo(() => {
    const samples = Object.values(thumbnailSizes);
    if (!samples.length || !selectionPreview?.valid) return null;

    const avgThumbnailSize = samples.reduce((sum, size) => sum + size, 0) / samples.length;
    const thumbnailDpi = THUMBNAIL_SCALE * 72;
    const areaRatio = (selectedPreset.dpi / thumbnailDpi) ** 2;
    const qualityRatio = quality / THUMBNAIL_JPEG_QUALITY;
    const formatFactor =
      outputFormat === "png" ? PNG_SIZE_FACTOR : outputFormat === "webp" ? WEBP_SIZE_FACTOR : 1;

    const perPage = avgThumbnailSize * areaRatio * qualityRatio * formatFactor;
    return perPage * selectionPreview.count;
  }, [thumbnailSizes, selectionPreview, selectedPreset.dpi, quality, outputFormat]);

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

    // Declared outside the try block so the catch handler can revoke any
    // blob URLs already created for earlier pages if a later page in this
    // same batch fails -- those pages never reach setResults, so nothing
    // else would ever revoke them.
    const nextResults: JpgPageResult[] = [];

    try {
      const doc = pdfJsDocRef.current;
      if (!doc) throw new Error("Document is not ready. Please add the PDF again.");

      const scale = selectedPreset.dpi / 72;
      const baseName = sanitizeFileStem(outputName || "lumeo-pages", "lumeo-pages");
      const digits = String(analysis.pageCount).length;
      const extension = outputFormat === "png" ? "png" : outputFormat === "webp" ? "webp" : "jpg";
      const mimeType =
        outputFormat === "png" ? "image/png" : outputFormat === "webp" ? "image/webp" : "image/jpeg";
      let totalOutputSize = 0;

      for (let index = 0; index < pages.length; index += 1) {
        const pageNumber = pages[index];
        setProgressDetail(`Rendering page ${index + 1} of ${pages.length}.`);

        const page = await doc.getPage(pageNumber);
        // Combine the PDF's own stored /Rotate metadata with any manual
        // rotation the user applied on the picker grid, so the exported
        // image reflects both.
        const userRotation = rotationsRef.current[pageNumber] ?? 0;
        const effectiveRotation = normalizeRotation(page.rotate + userRotation);
        const viewport = page.getViewport({ scale, rotation: effectiveRotation });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas is not supported in this browser.");
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);

        const task = page.render({ canvas, canvasContext: context, viewport });
        await renderPageWithTimeout(task, pageNumber);

        const blob = await new Promise<Blob | null>((resolve) =>
          outputFormat === "png" ? canvas.toBlob(resolve, mimeType) : canvas.toBlob(resolve, mimeType, quality),
        );
        if (blob && outputFormat === "webp" && blob.type !== "image/webp") {
          throw new Error("WEBP export is not supported in this browser. Try JPG or PNG instead.");
        }
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) throw new Error(`Page ${pageNumber} could not be exported.`);

        const fileName =
          pages.length === 1
            ? `${baseName}.${extension}`
            : `${baseName}-page-${String(pageNumber).padStart(digits, "0")}.${extension}`;

        nextResults.push({
          page: pageNumber,
          url: URL.createObjectURL(blob),
          blob,
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
      // Any pages already converted in this failed batch never reached
      // setResults, so revoke their blob URLs here instead of leaking them.
      nextResults.forEach((item) => URL.revokeObjectURL(item.url));
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

  async function handleDownloadZip() {
    if (!results.length || isZipping) return;
    setIsZipping(true);

    try {
      const zip = new JSZip();
      results.forEach((item) => zip.file(item.fileName, item.blob));
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipUrl = URL.createObjectURL(zipBlob);
      const baseName = sanitizeFileStem(outputName || "lumeo-pages", "lumeo-pages");

      track({
        eventName: "download_started",
        toolSlug: TOOL_SLUG,
        outputSizeBucket: bucketFileSize(zipBlob.size),
      });
      downloadBlobUrl(zipUrl, `${baseName}.zip`);
      setResults((current) => current.map((entry) => ({ ...entry, downloaded: true })));

      window.setTimeout(() => URL.revokeObjectURL(zipUrl), 800);
    } finally {
      setIsZipping(false);
    }
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
            buttonLabel="Select PDF"
            onFilesSelected={handleFiles}
          />
        </div>

        <L2PrivacyNote />

        {error ? (
          <div role="alert" className="mt-4 rounded-lg border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
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
          <div className="flex min-h-0 flex-col gap-3 rounded-xl border border-[var(--text-primary)]/14 bg-gradient-to-br from-[var(--atelier-surface-3)] via-[var(--atelier-surface-2)] to-[var(--atelier-surface-2)] p-3 shadow-2xl shadow-black/32">
            <section className="shrink-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--lumeo-gold)]">
                    Document
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-primary)]/48">Source PDF.</p>
                </div>
                <button
                  type="button"
                  onClick={resetTool}
                  className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/56 transition hover:border-[var(--text-primary)]/22 hover:text-[var(--text-primary)]"
                >
                  Start new
                </button>
              </div>

              <div className="rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/74 px-3 py-2">
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
                  <div className="rounded-xl border border-[var(--lumeo-gold)]/20 bg-[var(--lumeo-gold)]/8 px-3 py-2 text-xs text-[var(--text-primary)]/72">
                    Large files may take longer because conversion happens in your browser.
                  </div>
                ) : null}
                {manyPages ? (
                  <div className="rounded-xl border border-[var(--lumeo-gold)]/20 bg-[var(--lumeo-gold)]/8 px-3 py-2 text-xs text-[var(--text-primary)]/72">
                    Previews render progressively for this document.
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/62 p-3">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--lumeo-gold)]">Pages</p>
                  <p className="text-xs text-[var(--text-primary)]/38">
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
                      className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/56 transition hover:border-[var(--text-primary)]/22 hover:text-[var(--text-primary)]"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={clearCustomSelection}
                      disabled={!selectedPages.length}
                      className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/56 transition hover:border-[var(--text-primary)]/22 hover:text-[var(--text-primary)] disabled:opacity-35"
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
                    rotation={rotations[page] ?? 0}
                    onVisible={scheduleThumbnailRender}
                    onToggle={togglePage}
                    onFocus={setFocusedPage}
                    onRotate={rotatePage}
                    onPreview={(pageNumber) => void openPreview(pageNumber)}
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
              <div className="rounded-lg border border-[var(--lumeo-gold)]/18 bg-[var(--lumeo-gold)]/[0.06] p-4 text-sm font-medium text-[var(--text-primary)]">
                {cleanupMessage}
              </div>
            ) : null}
          </div>
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="PDF to JPG options" description="Export selected pages as JPG images.">
          <div className="flex h-full min-h-0 flex-col">
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--atelier-surface-2)]/74 p-2.5 shadow-inner shadow-black/20">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">Page selection</p>
                <div className="mt-1.5">
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
                    className="mt-2 w-full rounded-md border border-[var(--text-primary)]/12 bg-[var(--atelier-surface-1)]/70 px-2.5 py-1.5 text-sm font-semibold text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-primary)]/26 focus:border-[var(--lumeo-gold)]/45"
                  />
                ) : null}

                {selectionPreview && !selectionPreview.valid ? (
                  <p className="mt-1.5 text-xs font-semibold text-[var(--text-danger)]">{selectionPreview.message}</p>
                ) : null}
              </div>

              <div className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--atelier-surface-2)]/74 p-2.5 shadow-inner shadow-black/20">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">Output</p>
                  <div className="flex overflow-hidden rounded-full border border-[var(--text-primary)]/12">
                    {(["jpeg", "png", "webp"] as const).map((format) => (
                      <button
                        key={format}
                        type="button"
                        aria-pressed={outputFormat === format}
                        onClick={() => {
                          setOutputFormat(format);
                          clearResults();
                        }}
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition ${
                          outputFormat === format
                            ? "bg-[var(--surface-selected)] text-[var(--lumeo-gold)]"
                            : "text-[var(--text-primary)]/48 hover:text-[var(--text-primary)]"
                        }`}
                      >
                        {format === "jpeg" ? "JPG" : format === "png" ? "PNG" : "WEBP"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
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
                          : "border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.03] hover:border-[var(--border-selected)]"
                      }`}
                    >
                      <span className="block text-xs font-bold text-[var(--text-primary)]">{preset.label}</span>
                      <span className="block text-[10px] text-[var(--text-primary)]/44">{preset.dpi} dpi</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-[var(--text-primary)]/40">
                  {selectedPreset.description}
                  {estimatedOutputSize ? ` · Estimated ~${formatBytes(estimatedOutputSize)}` : ""}
                </p>

                {outputFormat === "jpeg" || outputFormat === "webp" ? (
                  <>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">
                        Quality
                      </span>
                      <span className="text-xs font-bold text-[var(--text-primary)]">{Math.round(quality * 100)}%</span>
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
                      className="mt-1 w-full accent-[var(--lumeo-gold)]"
                      aria-label={outputFormat === "webp" ? "WEBP quality" : "JPEG quality"}
                      aria-valuetext={`${Math.round(quality * 100)}%`}
                    />
                  </>
                ) : (
                  <p className="mt-2 text-[11px] text-[var(--text-primary)]/40">PNG is lossless — no quality setting.</p>
                )}

                <label className="mt-2 block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">
                    File name
                  </span>
                  <input
                    value={outputName}
                    onChange={(event) => {
                      setOutputName(event.target.value);
                      clearResults();
                    }}
                    className="mt-1 w-full rounded-md border border-[var(--text-primary)]/12 bg-[var(--atelier-surface-1)]/70 px-2.5 py-1.5 text-sm font-semibold text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-primary)]/26 focus:border-[var(--lumeo-gold)]/45"
                    placeholder="lumeo-pages"
                  />
                </label>
              </div>
            </div>

            <div className="mt-2 border-t border-[var(--text-primary)]/10 pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--lumeo-gold)]">Finish</p>

              <div ref={statusRegionRef} tabIndex={-1} aria-live="polite" className="outline-none">
                {isConverting ? (
                  <div className="mt-2">
                    <p className="text-base font-semibold text-[var(--text-primary)]">{status}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-primary)]/46">{progressDetail}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--text-primary)]/10">
                      <div
                        className="h-full rounded-full bg-[var(--lumeo-gold)] transition-all duration-200"
                        style={{
                          width: progressTotal
                            ? `${Math.round((progressCurrent / progressTotal) * 100)}%`
                            : "8%",
                        }}
                      />
                    </div>
                  </div>
                ) : results.length ? (
                  <div className="aura-success-reveal mt-2">
                    <p className="text-base font-semibold text-[var(--text-primary)]">
                      {results.length} {outputFormat === "png" ? "PNG" : outputFormat === "webp" ? "WEBP" : "JPG"}
                      {results.length === 1 ? "" : "s"} ready
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-primary)]/46">
                      {formatBytes(totalResultSize)} total
                    </p>

                    <div className="mt-2 flex flex-col gap-2">
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
                                  ? `Download ${outputFormat === "png" ? "PNG" : outputFormat === "webp" ? "WEBP" : "JPG"}`
                                  : "Download all"}
                          </button>
                        )}
                        secondary={(
                          <>
                            {results.length > 1 ? (
                              <button
                                type="button"
                                disabled={isZipping}
                                onClick={() => void handleDownloadZip()}
                                className="rounded-[var(--radius-md)] border border-[var(--text-primary)]/12 px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)]/62 transition hover:border-[var(--text-primary)]/24 hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                {isZipping ? "Zipping…" : "Download as ZIP"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={resetTool}
                              className="rounded-[var(--radius-md)] border border-[var(--text-primary)]/12 px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)]/62 transition hover:border-[var(--text-primary)]/24 hover:text-[var(--text-primary)]"
                            >
                              Start new
                            </button>
                          </>
                        )}
                      />
                    </div>

                    {results.length > 1 ? (
                      <div className="no-scrollbar mt-2 max-h-[180px] space-y-1.5 overflow-y-auto pr-1">
                        {results.map((item) => (
                          <div
                            key={item.page}
                            className="flex items-center gap-2 rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/50 px-2.5 py-1.5"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.04]">
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
                            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--text-primary)]/80">
                              {item.fileName}
                            </span>
                            <span className="shrink-0 text-[10px] text-[var(--text-primary)]/40">{formatBytes(item.size)}</span>
                            {item.downloaded ? (
                              <span className="shrink-0 text-[10px] font-bold text-[var(--lumeo-sage-accent)]">Downloaded</span>
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
                  <div className="mt-2">
                    <p className="text-base font-semibold text-[var(--text-primary)]">Ready to convert</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-primary)]/46">
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
                          className="lumeo-primary-action mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 active:scale-[0.98]"
                        >
                          Convert to {outputFormat === "png" ? "PNG" : outputFormat === "webp" ? "WEBP" : "JPG"}
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

      {previewPage ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Page ${previewPage} preview`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={closePreview}
          onKeyDown={(event) => {
            if (event.key === "Escape") closePreview();
          }}
        >
          <div
            className="relative flex max-h-full max-w-full flex-col items-center gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="inline-flex max-h-[80dvh] max-w-[90vw] items-center justify-center overflow-hidden rounded-lg border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-2)]">
              {previewLoading && !previewUrl ? (
                <div className="flex h-64 w-48 animate-pulse items-center justify-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/40">
                  Rendering…
                </div>
              ) : previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={`Page ${previewPage} full preview`}
                  style={previewSize ? { aspectRatio: `${previewSize.width} / ${previewSize.height}` } : undefined}
                  className="max-h-[80dvh] max-w-[90vw] object-contain"
                />
              ) : (
                <div className="flex h-64 w-48 items-center justify-center text-xs font-semibold text-[var(--text-danger)]">
                  Preview failed.
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Rotate page ${previewPage} left`}
                onClick={() => rotatePage(previewPage, -1)}
                className="grid h-9 w-9 place-items-center rounded-full border border-[var(--text-primary)]/20 bg-[var(--atelier-surface-1)]/90 text-sm text-[var(--text-primary)] transition hover:border-[var(--lumeo-gold)]/60"
              >
                ↺
              </button>
              <button
                type="button"
                onClick={closePreview}
                className="rounded-full border border-[var(--text-primary)]/20 bg-[var(--atelier-surface-1)]/90 px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--lumeo-gold)]/60"
              >
                Close
              </button>
              <button
                type="button"
                aria-label={`Rotate page ${previewPage} right`}
                onClick={() => rotatePage(previewPage, 1)}
                className="grid h-9 w-9 place-items-center rounded-full border border-[var(--text-primary)]/20 bg-[var(--atelier-surface-1)]/90 text-sm text-[var(--text-primary)] transition hover:border-[var(--lumeo-gold)]/60"
              >
                ↻
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
