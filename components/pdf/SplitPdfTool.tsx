"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { degrees, PDFDocument } from "pdf-lib";
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
import { AuraOptionCard, AuraStatus } from "@/components/ui/Aura";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import { loadPdfJsModule } from "@/lib/pdf/pdfjs";
import { formatBytes } from "@/lib/pdf/formatBytes";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { copyArrayBuffer, toArrayBuffer } from "@/lib/pdf/arrayBuffer";
import { normalizeRotation } from "@/lib/pdf/rotation";
import {
  hasPdfMagicBytes,
  isPdfNamedFile,
  checkPdfFileSize,
} from "@/lib/pdf/uploadValidation";

type SplitMode = "extract" | "ranges" | "everyPage" | "everyN" | "remove" | "reorder" | "duplicate";
type ResultKind = "pdf" | "zip";
type ThumbnailDensity = "compact" | "comfortable" | "large";
type ProgressStage =
  | "Ready"
  | "Preparing document"
  | "Rendering previews"
  | "Validating pages"
  | "Creating PDF"
  | "Packaging ZIP"
  | "Finalizing download"
  | "Download ready";

type PageInfo = {
  page: number;
  width: number;
  height: number;
  label: string;
  orientation: "Portrait" | "Landscape";
};

type PdfAnalysis = {
  name: string;
  size: number;
  pageCount: number;
  pageSizeType: string;
  bytes: ArrayBuffer;
  pages: PageInfo[];
};

type SplitResult = {
  url: string;
  fileName: string;
  kind: ResultKind;
  pageCount: number;
  outputCount: number;
  size: number;
  methodLabel: string;
};

type ParsedRange = {
  pages: number[];
  duplicates: number[];
  overlaps: string[];
  normalized: string;
};

type UiHistoryState = {
  mode: SplitMode;
  rangeInput: string;
  selectedPages: number[];
  focusedPage: number | null;
  chunkSize: number;
  outputName: string;
  rotations: Record<number, number>;
  pageOrder: number[];
};

const splitModes: Array<{ value: SplitMode; label: string; helper: string }> = [
  { value: "extract", label: "Extract pages", helper: "Create one PDF from selected pages." },
  { value: "ranges", label: "Split ranges", helper: "Create separate PDFs from ranges." },
  { value: "everyPage", label: "Every page", helper: "Create one PDF per page." },
  { value: "everyN", label: "Every N pages", helper: "Create equal document chunks." },
  { value: "remove", label: "Remove pages", helper: "Create one PDF without selected pages." },
  { value: "reorder", label: "Reorder pages", helper: "Drag pages into a new order." },
  { value: "duplicate", label: "Duplicate pages", helper: "Insert a copy of each selected page right after it." },
];

const densityClasses: Record<ThumbnailDensity, string> = {
  compact: "grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-9",
  comfortable: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7",
  large: "grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
};

const densityPreviewClasses: Record<ThumbnailDensity, string> = {
  compact: "h-20",
  comfortable: "h-28",
  large: "h-36",
};

const THUMBNAIL_DENSITY_KEY = "lumeo.split.thumbnailDensity";
const MAX_HISTORY = 30;



function ensureExtension(name: string, extension: ".pdf" | ".zip") {
  const safe = sanitizeFileStem(name.replace(/\.(pdf|zip)$/i, ""), "lumeo-split");
  return `${safe}${extension}`;
}

function uniqueName(name: string, usedNames: Set<string>) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }

  const extension = name.endsWith(".zip") ? ".zip" : ".pdf";
  const stem = name.slice(0, -extension.length);
  let index = 2;
  let next = `${stem}-${index}${extension}`;

  while (usedNames.has(next)) {
    index += 1;
    next = `${stem}-${index}${extension}`;
  }

  usedNames.add(next);
  return next;
}

function classifyPageSize(width: number, height: number) {
  const portraitWidth = Math.min(width, height);
  const portraitHeight = Math.max(width, height);
  const close = (a: number, b: number) => Math.abs(a - b) <= 12;

  if (close(portraitWidth, 595.28) && close(portraitHeight, 841.89)) return "A4";
  if (close(portraitWidth, 612) && close(portraitHeight, 792)) return "Letter";
  return "Custom";
}

function pageSizeTypeFromInfos(pages: PageInfo[]) {
  const uniqueSizes = new Set(pages.map((page) => `${Math.round(page.width)}x${Math.round(page.height)}`));
  const uniqueLabels = new Set(pages.map((page) => page.label));

  if (uniqueSizes.size > 1) return "Mixed";
  return uniqueLabels.values().next().value ?? "Custom";
}

function parsePageToken(token: string, totalPages: number) {
  const trimmed = token.trim().toLowerCase();
  if (trimmed === "end" || trimmed === "last") return totalPages;
  if (trimmed === "first") return 1;
  if (!/^\d+$/.test(trimmed)) return null;

  const page = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(page)) return null;
  return page;
}

function friendlyPageError(page: number, totalPages: number) {
  if (page === 0) return "Page 0 is not valid. Page numbering starts at 1.";
  if (page < 0) return "Negative page numbers are not valid.";
  if (page > totalPages) return `Page ${page} is outside this ${totalPages}-page document.`;
  return "Use pages like 1-3, 5, or 10-end.";
}

function compressPagesToRange(pages: number[]) {
  if (!pages.length) return "";
  const sorted = [...pages].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (const page of sorted.slice(1)) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = page;
    previous = page;
  }

  ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  return ranges.join(", ");
}

function parsePageList(input: string, totalPages: number): ParsedRange {
  const text = input.trim().toLowerCase();
  if (!text) throw new Error("Use a range such as 1-5, 8, or 10-end.");

  if (text === "all") {
    const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
    return { pages, duplicates: [], overlaps: [], normalized: `1-${totalPages}` };
  }

  if (text === "odd" || text === "even") {
    const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter((page) =>
      text === "odd" ? page % 2 === 1 : page % 2 === 0,
    );
    return { pages, duplicates: [], overlaps: [], normalized: text };
  }

  const pages: number[] = [];
  const duplicates = new Set<number>();
  const spans: Array<{ start: number; end: number; label: string }> = [];
  const seen = new Set<number>();
  const parts = text.split(",");

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) throw new Error("Use a range such as 1-5, 8, or 10-end.");

    if (part.includes("-")) {
      const pieces = part.split("-").map((piece) => piece.trim());
      if (pieces.length !== 2 || !pieces[0] || !pieces[1]) {
        throw new Error("Use a range such as 1-5, 8, or 10-end.");
      }

      const start = parsePageToken(pieces[0], totalPages);
      const end = parsePageToken(pieces[1], totalPages);

      if (start === null || end === null) throw new Error("Use a range such as 1-5, 8, or 10-end.");
      if (start < 1 || start > totalPages) throw new Error(friendlyPageError(start, totalPages));
      if (end < 1 || end > totalPages) throw new Error(friendlyPageError(end, totalPages));
      if (start > end) throw new Error(`Range ${part} is reversed. Use ${end}-${start} instead.`);

      spans.push({ start, end, label: part });
      for (let page = start; page <= end; page += 1) {
        if (seen.has(page)) duplicates.add(page);
        seen.add(page);
        pages.push(page);
      }
    } else {
      const page = parsePageToken(part, totalPages);
      if (page === null) throw new Error("Use a range such as 1-5, 8, or 10-end.");
      if (page < 1 || page > totalPages) throw new Error(friendlyPageError(page, totalPages));
      if (seen.has(page)) duplicates.add(page);
      seen.add(page);
      pages.push(page);
    }
  }

  const overlaps: string[] = [];
  for (let a = 0; a < spans.length; a += 1) {
    for (let b = a + 1; b < spans.length; b += 1) {
      const first = spans[a];
      const second = spans[b];
      if (first.start <= second.end && second.start <= first.end) {
        overlaps.push(`${first.label} and ${second.label}`);
      }
    }
  }

  const uniquePages = Array.from(new Set(pages));
  if (!uniquePages.length) throw new Error("Choose at least one page.");

  return {
    pages: uniquePages,
    duplicates: Array.from(duplicates).sort((a, b) => a - b),
    overlaps,
    normalized: compressPagesToRange(uniquePages),
  };
}

function parseRangeGroups(input: string, totalPages: number) {
  const text = input.trim();
  if (!text) throw new Error("Use ranges like 1-3 | 4-6.");

  const separator = text.includes("|") ? "|" : ",";
  const groups = text
    .split(separator)
    .map((group) => group.trim())
    .filter(Boolean)
    .map((group) => parsePageList(group, totalPages));

  if (!groups.length) throw new Error("Use ranges like 1-3 | 4-6.");
  return groups;
}

function describePages(pages: number[]) {
  if (pages.length === 1) return `page-${pages[0]}`;
  return `pages-${pages[0]}-${pages[pages.length - 1]}`;
}

async function createPdfFromPages(
  sourceBytes: ArrayBuffer,
  pages: number[],
  rotations: Record<number, number>,
) {
  const source = await PDFDocument.load(copyArrayBuffer(sourceBytes));
  const output = await PDFDocument.create();
  const copied = await output.copyPages(
    source,
    pages.map((page) => page - 1),
  );

  copied.forEach((page, index) => {
    const sourcePageNumber = pages[index];
    const existing = page.getRotation().angle;
    const requested = rotations[sourcePageNumber] ?? 0;
    page.setRotation(degrees(normalizeRotation(existing + requested)));
    output.addPage(page);
  });

  return output.save();
}

function downloadUrl(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function SplitIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <path
        d="M8 6.5h10.5l2.5 2.5v16.5H8v-19Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M18.4 7v3.2h3.2M12 15.8h8M16 11.8v8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M5.5 13.5H3.8M5.5 18.5H3.8M28.2 13.5h-1.7M28.2 18.5h-1.7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function selectedSummary(selected: number[]) {
  if (!selected.length) return "No pages selected";
  return `Selected: ${selected.length} ${selected.length === 1 ? "page" : "pages"}`;
}

function getSuggestions(value: string) {
  const text = value.trim().toLowerCase();
  if (!text) return ["all", "odd", "even", "1-end"];
  if (text === "1-") return ["1-end"];
  if (text === "o") return ["odd"];
  if (text === "e") return ["even", "end"];
  if (text.endsWith("-")) return [`${text}end`];
  return [];
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function CompletionCheck() {
  return (
    <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[rgb(var(--emerald-rgb)/0.36)] bg-[var(--surface-success)] text-[var(--text-success)]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="m6.5 12.4 3.3 3.3 7.7-8.1"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </span>
  );
}

type ThumbnailProps = {
  page: PageInfo;
  selected: boolean;
  focused: boolean;
  disabled: boolean;
  rotation: number;
  density: ThumbnailDensity;
  imageUrl?: string;
  loading: boolean;
  onVisible: (page: number) => void;
  onClick: (event: React.MouseEvent<HTMLButtonElement>, page: number) => void;
  onFocus: (page: number) => void;
};

function SplitPageThumbnail({
  page,
  selected,
  focused,
  disabled,
  rotation,
  density,
  imageUrl,
  loading,
  onVisible,
  onClick,
  onFocus,
}: ThumbnailProps) {
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || imageUrl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onVisible(page.page);
          observer.disconnect();
        }
      },
      { rootMargin: "180px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [imageUrl, onVisible, page.page]);

  return (
    <button
      ref={ref}
      type="button"
      role="gridcell"
      aria-selected={selected}
      aria-label={`Page ${page.page}${selected ? ", selected" : ""}`}
      disabled={disabled}
      onClick={(event) => onClick(event, page.page)}
      onFocus={() => onFocus(page.page)}
      className={`group rounded-xl border p-2 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--lumeo-gold)]/45 disabled:cursor-default ${
        selected
          ? "border-[var(--border-selected)] bg-[var(--surface-selected)] shadow-[0_12px_30px_rgba(0,0,0,0.12)]"
          : focused
            ? "border-[var(--border-selected)] bg-[var(--text-primary)]/[0.055]"
            : "border-[var(--text-primary)]/8 bg-[var(--text-primary)]/[0.035] hover:-translate-y-0.5 hover:border-[var(--border-selected)]"
      }`}
    >
      <div
        className={`${densityPreviewClasses[density]} relative flex items-center justify-center overflow-hidden rounded-lg border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.045]`}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-full max-h-full w-full object-contain transition-opacity duration-300"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        ) : (
          <div className="flex h-full w-full animate-pulse items-center justify-center bg-[var(--text-primary)]/8 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]/28">
            {loading ? "Preview" : "Page"}
          </div>
        )}
        {rotation ? (
          <span className="absolute right-1.5 top-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--atelier-surface-1)]/88 px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
            {rotation}°
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-col gap-0.5">
        <span className="text-xs font-bold text-[var(--text-primary)]">Page {page.page}</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)]/36">
          {page.orientation}
        </span>
      </div>
      <p className="mt-0.5 text-[10px] font-medium text-[var(--text-primary)]/32">
        {page.label} · {Math.round(page.width)}×{Math.round(page.height)}
      </p>
    </button>
  );
}

export default function SplitPdfTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);
  const pdfJsDocRef = useRef<PDFDocumentProxy | null>(null);
  const sessionRef = useRef(0);
  const thumbnailTasksRef = useRef<Map<number, RenderTask>>(new Map());
  const thumbnailUrlsRef = useRef<Set<string>>(new Set());
  const renderingRef = useRef<Set<number>>(new Set());
  const pendingRenderRef = useRef<Set<number>>(new Set());

  const [analysis, setAnalysis] = useState<PdfAnalysis | null>(null);
  const [mode, setMode] = useState<SplitMode>("extract");
  const [rangeInput, setRangeInput] = useState("1");
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [focusedPage, setFocusedPage] = useState<number | null>(null);
  const [chunkSize, setChunkSize] = useState(2);
  const [outputName, setOutputName] = useState("lumeo-split");
  const [methodDrawerOpen, setMethodDrawerOpen] = useState(false);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<ProgressStage>("Ready");
  const [progressDetail, setProgressDetail] = useState("");
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [isSplitting, setIsSplitting] = useState(false);
  const [result, setResult] = useState<SplitResult | null>(null);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [draggingPage, setDraggingPage] = useState<number | null>(null);
  const [dragOverPage, setDragOverPage] = useState<number | null>(null);
  const [thumbnailDensity, setThumbnailDensity] = useState<ThumbnailDensity>(() => {
    if (typeof window === "undefined") return "comfortable";
    const stored = window.localStorage.getItem(THUMBNAIL_DENSITY_KEY);
    return stored === "compact" || stored === "comfortable" || stored === "large"
      ? stored
      : "comfortable";
  });
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({});
  const [thumbnailLoading, setThumbnailLoading] = useState<Record<number, boolean>>({});
  const [undoStack, setUndoStack] = useState<UiHistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<UiHistoryState[]>([]);

  const sourceBaseName = useMemo(
    () => sanitizeFileStem(analysis?.name ?? "document", "document"),
    [analysis?.name],
  );

  const resultType: ResultKind =
    mode === "extract" || mode === "remove" || mode === "reorder" || mode === "duplicate"
      ? "pdf"
      : "zip";
  const pageCount = analysis?.pageCount ?? 0;
  const largeFile = Boolean(analysis && analysis.size > 75 * 1024 * 1024);
  const veryLargeDocument = Boolean(analysis && analysis.pageCount > 150);
  const selectedMode = splitModes.find((item) => item.value === mode) ?? splitModes[0];
  const usesPageSelection = mode === "extract" || mode === "remove" || mode === "duplicate";

  const captureUiState = useCallback(
    (): UiHistoryState => ({
      mode,
      rangeInput,
      selectedPages,
      focusedPage,
      chunkSize,
      outputName,
      rotations,
      pageOrder,
    }),
    [chunkSize, focusedPage, mode, outputName, pageOrder, rangeInput, rotations, selectedPages],
  );

  const restoreUiState = useCallback((state: UiHistoryState) => {
    setMode(state.mode);
    setRangeInput(state.rangeInput);
    setSelectedPages(state.selectedPages);
    setFocusedPage(state.focusedPage);
    setChunkSize(state.chunkSize);
    setOutputName(state.outputName);
    setRotations(state.rotations);
    setPageOrder(state.pageOrder);
    setError("");
    setCleanupMessage("");
    setMethodDrawerOpen(false);
  }, []);

  const pushHistory = useCallback(() => {
    setUndoStack((current) => [...current.slice(-(MAX_HISTORY - 1)), captureUiState()]);
    setRedoStack([]);
  }, [captureUiState]);

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

  const clearResult = useCallback(
    (message = "") => {
      if (result?.url) URL.revokeObjectURL(result.url);
      setResult(null);
      setCleanupMessage(message);
    },
    [result],
  );

  useEffect(() => {
    return () => {
      if (result?.url) URL.revokeObjectURL(result.url);
      clearThumbnails();
      void destroyPdfJsDocument();
    };
  }, [clearThumbnails, destroyPdfJsDocument, result?.url]);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const result = track({ eventName: "tool_opened", toolSlug: "split" });
    if (result.accepted) {
      openedTrackedRef.current = true;
    }
  }, [availability, track]);

  function resetEditableState(total = 1) {
    setMode("extract");
    const initial = total > 1 ? [1, 2] : [1];
    setRangeInput(initial.join(","));
    setSelectedPages(initial);
    setFocusedPage(initial[0]);
    setChunkSize(Math.min(2, total));
    setOutputName("lumeo-split");
    setRotations({});
    setPageOrder(Array.from({ length: total }, (_, index) => index + 1));
    setUndoStack([]);
    setRedoStack([]);
    setMethodDrawerOpen(false);
    setShortcutOpen(false);
  }

  function resetTool() {
    sessionRef.current += 1;
    clearResult();
    clearThumbnails();
    void destroyPdfJsDocument();
    setAnalysis(null);
    resetEditableState();
    setError("");
    setStatus("Ready");
    setProgressDetail("");
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

              const viewport = page.getViewport({ scale: 0.32 });
              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d", { alpha: false });
              if (!context) return;
              canvas.width = Math.max(1, Math.floor(viewport.width));
              canvas.height = Math.max(1, Math.floor(viewport.height));
              context.fillStyle = "#F8F3E4";
              context.fillRect(0, 0, canvas.width, canvas.height);

              const task = page.render({ canvas, canvasContext: context, viewport });
              thumbnailTasksRef.current.set(next, task);
              await task.promise;
              thumbnailTasksRef.current.delete(next);
              if (currentSession !== sessionRef.current) return;

              const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/png", 0.74),
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
    clearResult();
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

      const pdf = await PDFDocument.load(copyArrayBuffer(bytes));
      const pages = pdf.getPages().map((page, index) => {
        const { width, height } = page.getSize();
        return {
          page: index + 1,
          width,
          height,
          label: classifyPageSize(width, height),
          orientation: width > height ? "Landscape" : "Portrait",
        } satisfies PageInfo;
      });

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
      pdfJsDocRef.current = pdfJsDoc;

      const nextAnalysis: PdfAnalysis = {
        name: file.name,
        size: file.size,
        pageCount: pdf.getPageCount(),
        pageSizeType: pageSizeTypeFromInfos(pages),
        bytes,
        pages,
      };

      setAnalysis(nextAnalysis);
      resetEditableState(nextAnalysis.pageCount);
      setStatus("Ready");
      setProgressDetail(nextAnalysis.pageCount > 60 ? "Large document loaded. Previews render as needed." : "Document ready.");
    } catch (readError) {
      const message =
        readError instanceof Error && /password|encrypt/i.test(readError.message)
          ? "This file appears to be password-protected or encrypted."
          : "This file could not be read. It may be damaged or password-protected.";
      setStatus("Ready");
      setError(message);
      setAnalysis(null);
    }
  }

  function handleFiles(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;
    void readPdfFile(file);
  }

  function updateSelection(nextPages: number[], nextFocused?: number | null, nextRange?: string) {
    const sorted = Array.from(new Set(nextPages)).sort((a, b) => a - b);
    setSelectedPages(sorted);
    setFocusedPage(nextFocused ?? sorted[sorted.length - 1] ?? focusedPage);
    setRangeInput(nextRange ?? sorted.join(","));
    clearResult();
  }

  function applyPreset(preset: string) {
    if (!analysis) return;
    pushHistory();
    const total = analysis.pageCount;
    const half = Math.max(1, Math.ceil(total / 2));

    if (preset === "all") updateSelection(Array.from({ length: total }, (_, index) => index + 1), 1, "all");
    if (preset === "first") updateSelection([1], 1, "first");
    if (preset === "last") updateSelection([total], total, "last");
    if (preset === "odd") {
      updateSelection(
        Array.from({ length: total }, (_, index) => index + 1).filter((page) => page % 2 === 1),
        1,
        "odd",
      );
    }
    if (preset === "even") {
      updateSelection(
        Array.from({ length: total }, (_, index) => index + 1).filter((page) => page % 2 === 0),
        2,
        "even",
      );
    }
    if (preset === "firstFive") {
      const pages = Array.from({ length: Math.min(5, total) }, (_, index) => index + 1);
      updateSelection(pages, 1, compressPagesToRange(pages));
    }
    if (preset === "lastFive") {
      const start = Math.max(1, total - 4);
      const pages = Array.from({ length: total - start + 1 }, (_, index) => start + index);
      updateSelection(pages, start, compressPagesToRange(pages));
    }
    if (preset === "firstHalf") updateSelection(Array.from({ length: half }, (_, index) => index + 1), 1, `1-${half}`);
    if (preset === "secondHalf") {
      updateSelection(
        Array.from({ length: total - half }, (_, index) => half + index + 1),
        half + 1,
        `${half + 1}-end`,
      );
    }
    if (preset === "halves") {
      setRangeInput(`1-${half} | ${half + 1}-end`);
      clearResult();
    }
    if (preset === "every2") {
      setChunkSize(2);
      setRangeInput("1-2 | 3-4");
      clearResult();
    }
    if (preset === "every5") {
      setChunkSize(5);
      setRangeInput("1-5 | 6-10");
      clearResult();
    }
  }

  function setModeSafely(nextMode: SplitMode) {
    if (!analysis) return;
    pushHistory();
    setMode(nextMode);
    setMethodDrawerOpen(false);
    setError("");
    clearResult();

    const total = analysis.pageCount;
    if (nextMode === "extract") {
      const pages = total > 1 ? [1, 2] : [1];
      updateSelection(pages, pages[0], pages.join(","));
    }
    if (nextMode === "ranges") {
      setSelectedPages([]);
      setFocusedPage(null);
      setRangeInput(`1-${Math.min(3, total)} | ${Math.min(4, total)}-end`);
    }
    if (nextMode === "remove" || nextMode === "duplicate") {
      updateSelection([1], 1, "1");
    }
    if (nextMode === "everyPage" || nextMode === "everyN") {
      setSelectedPages([]);
      setFocusedPage(null);
    }
    if (nextMode === "reorder") {
      setSelectedPages([]);
      setFocusedPage(null);
      setPageOrder(Array.from({ length: total }, (_, index) => index + 1));
    }
  }

  function reorderPages(draggedPage: number, targetPage: number) {
    if (draggedPage === targetPage) return;
    pushHistory();
    setPageOrder((current) => {
      const draggedIndex = current.indexOf(draggedPage);
      const targetIndex = current.indexOf(targetPage);
      if (draggedIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [draggedItem] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedItem);
      return next;
    });
    clearResult();
  }

  function togglePage(event: React.MouseEvent<HTMLButtonElement>, page: number) {
    if (!usesPageSelection || !analysis) return;
    pushHistory();

    if (event.shiftKey && focusedPage) {
      const start = Math.min(focusedPage, page);
      const end = Math.max(focusedPage, page);
      const range = Array.from({ length: end - start + 1 }, (_, index) => start + index);
      updateSelection(Array.from(new Set([...selectedPages, ...range])), page);
      return;
    }

    if (event.ctrlKey || event.metaKey || selectedPages.includes(page)) {
      updateSelection(
        selectedPages.includes(page)
          ? selectedPages.filter((item) => item !== page)
          : [...selectedPages, page],
        page,
      );
      return;
    }

    updateSelection([...selectedPages, page], page);
  }

  function selectAllPages() {
    if (!analysis || !usesPageSelection) return;
    pushHistory();
    updateSelection(Array.from({ length: analysis.pageCount }, (_, index) => index + 1), 1, "all");
  }

  function clearSelection() {
    if (!usesPageSelection) return;
    pushHistory();
    updateSelection([], focusedPage, "");
  }

  function invertSelection() {
    if (!analysis || !usesPageSelection) return;
    pushHistory();
    const selected = new Set(selectedPages);
    const next = Array.from({ length: analysis.pageCount }, (_, index) => index + 1).filter(
      (page) => !selected.has(page),
    );
    updateSelection(next, next[0] ?? null, compressPagesToRange(next));
  }

  function rotatePages(direction: "left" | "right" | "reset") {
    if (!analysis) return;
    const targetPages = selectedPages.length
      ? selectedPages
      : focusedPage
        ? [focusedPage]
        : [1];
    pushHistory();
    setRotations((current) => {
      const next = { ...current };
      for (const page of targetPages) {
        if (direction === "reset") {
          delete next[page];
        } else {
          const delta = direction === "right" ? 90 : -90;
          const value = normalizeRotation((next[page] ?? 0) + delta);
          if (value === 0) delete next[page];
          else next[page] = value;
        }
      }
      return next;
    });
    clearResult();
  }

  function getGroupsForMode() {
    if (!analysis) throw new Error("Please add one PDF file.");
    const total = analysis.pageCount;

    if (mode === "extract") {
      const pages = selectedPages.length ? selectedPages : parsePageList(rangeInput, total).pages;
      if (!pages.length) throw new Error("Choose at least one page.");
      return [pages];
    }
    if (mode === "ranges") return parseRangeGroups(rangeInput, total).map((group) => group.pages);
    if (mode === "everyPage") return Array.from({ length: total }, (_, index) => [index + 1]);
    if (mode === "reorder") {
      if (pageOrder.length !== total) throw new Error("Page order is out of sync. Reload the document.");
      return [pageOrder];
    }
    if (mode === "everyN") {
      if (!Number.isInteger(chunkSize)) throw new Error("Pages per file must be a whole number.");
      if (chunkSize < 1) throw new Error("Pages per file must be at least 1.");
      if (chunkSize > total) throw new Error(`Pages per file cannot be greater than ${total}.`);
      const groups: number[][] = [];
      for (let start = 1; start <= total; start += chunkSize) {
        groups.push(
          Array.from(
            { length: Math.min(chunkSize, total - start + 1) },
            (_, index) => start + index,
          ),
        );
      }
      return groups;
    }

    if (mode === "duplicate") {
      const pagesToDuplicate = selectedPages.length
        ? selectedPages
        : parsePageList(rangeInput, total).pages;
      if (!pagesToDuplicate.length) throw new Error("Choose at least one page to duplicate.");
      const duplicateSet = new Set(pagesToDuplicate);
      const withDuplicates: number[] = [];
      for (let page = 1; page <= total; page += 1) {
        withDuplicates.push(page);
        if (duplicateSet.has(page)) withDuplicates.push(page);
      }
      return [withDuplicates];
    }

    const pagesToRemove = selectedPages.length ? selectedPages : parsePageList(rangeInput, total).pages;
    const removePages = new Set(pagesToRemove);
    const remaining = Array.from({ length: total }, (_, index) => index + 1).filter(
      (page) => !removePages.has(page),
    );
    if (!remaining.length) throw new Error("Removing every page would create an empty PDF.");
    return [remaining];
  }

  const outputPreview = useMemo(() => {
    if (!analysis) return null;
    try {
      const groups = getGroupsForMode();
      const totalPages = groups.reduce((sum, group) => sum + group.length, 0);
      const outputCount = groups.length;
      const zipRequired = resultType === "zip";
      return {
        valid: true,
        outputCount,
        totalPages,
        zipRequired,
        label:
          mode === "extract"
            ? `${totalPages} selected ${totalPages === 1 ? "page" : "pages"}`
            : mode === "remove"
              ? `${totalPages} pages remaining`
              : mode === "duplicate"
                ? `${totalPages} pages total after duplicating`
                : mode === "reorder"
                  ? `${totalPages} pages reordered`
                : mode === "ranges"
                  ? `${outputCount} PDFs from ranges`
                  : mode === "everyPage"
                    ? `${outputCount} PDFs`
                    : `${outputCount} PDFs · ${chunkSize} pages each`,
        rangeLabel:
          mode === "ranges"
            ? groups
                .slice(0, 4)
                .map((group) => compressPagesToRange(group))
                .join(" · ")
            : "",
      };
    } catch (previewError) {
      return {
        valid: false,
        message: previewError instanceof Error ? previewError.message : "Check your split settings.",
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, chunkSize, mode, rangeInput, resultType, selectedPages]);

  const parserNotice = useMemo(() => {
    if (!analysis || mode === "everyPage" || mode === "everyN" || !rangeInput.trim()) return null;
    try {
      if (mode === "ranges") {
        const groups = parseRangeGroups(rangeInput, analysis.pageCount);
        const overlaps = groups.flatMap((group) => group.overlaps);
        const duplicates = groups.flatMap((group) => group.duplicates);
        if (overlaps.length) return `Ranges ${overlaps[0]} overlap.`;
        if (duplicates.length) return `Duplicate page detected: ${duplicates[0]}.`;
      } else {
        const parsed = parsePageList(rangeInput, analysis.pageCount);
        if (parsed.overlaps.length) return `Ranges ${parsed.overlaps[0]} overlap.`;
        if (parsed.duplicates.length) return `Duplicate page detected: ${parsed.duplicates[0]}.`;
      }
      return null;
    } catch (noticeError) {
      return noticeError instanceof Error ? noticeError.message : null;
    }
  }, [analysis, mode, rangeInput]);

  const selectedShare = analysis?.pageCount
    ? Math.round(((mode === "remove" ? selectedPages.length : selectedPages.length) / analysis.pageCount) * 100)
    : 0;

  async function handleSplit() {
    if (!analysis || isSplitting) {
      if (!analysis) setError("Please add one PDF file.");
      return;
    }

    setIsSplitting(true);
    setError("");
    setCleanupMessage("");
    clearResult();
    setStatus("Validating pages");
    setProgressDetail("Checking split settings.");

    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "split" });

    try {
      const groups = getGroupsForMode();
      const usedNames = new Set<string>();
      let blob: Blob;
      let fileName: string;

      if (resultType === "pdf") {
        setStatus("Creating PDF");
        setProgressDetail("Creating PDF 1 of 1.");
        const bytes = await createPdfFromPages(analysis.bytes, groups[0], rotations);
        blob = new Blob([toArrayBuffer(bytes)], { type: "application/pdf" });
        fileName = uniqueName(ensureExtension(outputName || "lumeo-split", ".pdf"), usedNames);
      } else {
        const zip = new JSZip();
        for (let index = 0; index < groups.length; index += 1) {
          const group = groups[index];
          setStatus("Creating PDF");
          setProgressDetail(`Creating PDF ${index + 1} of ${groups.length}.`);
          const bytes = await createPdfFromPages(analysis.bytes, group, rotations);
          const partName =
            mode === "everyN"
              ? `${sourceBaseName}-part-${String(index + 1).padStart(2, "0")}-${describePages(group)}.pdf`
              : mode === "ranges"
                ? `${sourceBaseName}-range-${group[0]}-${group[group.length - 1]}.pdf`
                : `${sourceBaseName}-${describePages(group)}.pdf`;
          zip.file(uniqueName(partName, usedNames), bytes);
        }

        setStatus("Packaging ZIP");
        setProgressDetail("Packaging ZIP.");
        blob = await zip.generateAsync({ type: "blob" });
        fileName = ensureExtension(outputName || "lumeo-split", ".zip");
      }

      setStatus("Finalizing download");
      const url = URL.createObjectURL(blob);
      setResult({
        url,
        fileName,
        kind: resultType,
        pageCount: groups.reduce((sum, group) => sum + group.length, 0),
        outputCount: groups.length,
        size: blob.size,
        methodLabel: selectedMode.label,
      });
      setStatus("Download ready");
      setProgressDetail("Split complete.");
      track({
        eventName: "processing_succeeded",
        toolSlug: "split",
        durationMs: performance.now() - startedAt,
        success: true,
      });
    } catch (splitError) {
      const message =
        splitError instanceof Error
          ? splitError.message
          : "Split failed. Try a smaller or valid PDF.";
      setError(message || "Split failed. Try a smaller or valid PDF.");
      setStatus("Ready");
      setProgressDetail("");
      track({
        eventName: "processing_failed",
        toolSlug: "split",
        durationMs: performance.now() - startedAt,
        success: false,
        errorCode: "processing_error",
      });
    } finally {
      setIsSplitting(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    track({ eventName: "download_started", toolSlug: "split" });
    downloadUrl(result.url, result.fileName);
    window.setTimeout(() => {
      clearResult("Temporary file cleared from this session.");
      setStatus("Ready");
      setProgressDetail("");
    }, 900);
  }

  function handleUndo() {
    setUndoStack((current) => {
      const previous = current[current.length - 1];
      if (!previous) return current;
      setRedoStack((redo) => [...redo.slice(-(MAX_HISTORY - 1)), captureUiState()]);
      restoreUiState(previous);
      clearResult();
      return current.slice(0, -1);
    });
  }

  function handleRedo() {
    setRedoStack((current) => {
      const next = current[current.length - 1];
      if (!next) return current;
      setUndoStack((undo) => [...undo.slice(-(MAX_HISTORY - 1)), captureUiState()]);
      restoreUiState(next);
      clearResult();
      return current.slice(0, -1);
    });
  }

  useEffect(() => {
    if (!analysis) return;
    const activeAnalysis = analysis;

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;

      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "a" && usesPageSelection) {
        event.preventDefault();
        selectAllPages();
      }
      if (event.key === "Escape") {
        if (methodDrawerOpen || shortcutOpen) {
          setMethodDrawerOpen(false);
          setShortcutOpen(false);
        } else if (usesPageSelection) {
          clearSelection();
        }
      }
      if (command && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        handleRedo();
      } else if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        handleUndo();
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        handleRedo();
      }
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && focusedPage) {
        event.preventDefault();
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const next = Math.min(Math.max(focusedPage + delta, 1), activeAnalysis.pageCount);
        if (event.shiftKey && usesPageSelection) {
          const start = Math.min(focusedPage, next);
          const end = Math.max(focusedPage, next);
          const range = Array.from({ length: end - start + 1 }, (_, index) => start + index);
          updateSelection(Array.from(new Set([...selectedPages, ...range])), next);
        } else {
          setFocusedPage(next);
        }
      }
      if ((event.key === "Delete" || event.key === "Backspace") && usesPageSelection) {
        event.preventDefault();
        clearSelection();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    analysis,
    focusedPage,
    methodDrawerOpen,
    selectedPages,
    shortcutOpen,
    undoStack,
    redoStack,
    usesPageSelection,
  ]);

  const pageChips = analysis?.pages ?? [];
  const orderedPageChips =
    mode === "reorder"
      ? (pageOrder.map((page) => pageChips.find((chip) => chip.page === page)).filter(Boolean) as PageInfo[])
      : pageChips;
  const rangeSuggestions = getSuggestions(rangeInput);
  const rotatedCount = Object.keys(rotations).length;

  if (!analysis) {
    return (
      <section className="l2-tool-empty-state grid gap-4 pb-4 lg:pb-0">
        <div className="mx-auto w-full max-w-[1040px]">
          <L2UploadStage
            inputId="split-pdf-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · One file"
            multiple={false}
            icon={<SplitIcon />}
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
                  Document tray
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-primary)]/48">
                  Source PDF.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!undoStack.length}
                  className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/56 transition hover:border-[var(--text-primary)]/22 hover:text-[var(--text-primary)] disabled:opacity-35"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={!redoStack.length}
                  className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/56 transition hover:border-[var(--text-primary)]/22 hover:text-[var(--text-primary)] disabled:opacity-35"
                >
                  Redo
                </button>
                <button
                  type="button"
                  onClick={resetTool}
                  className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/56 transition hover:border-[var(--text-primary)]/22 hover:text-[var(--text-primary)]"
                >
                  Start new
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/74 px-3 py-2 transition-all duration-300">
              <L2FileCard
                name={analysis.name}
                meta={`${analysis.pageCount} page${analysis.pageCount === 1 ? "" : "s"} · ${formatBytes(analysis.size)} · ${analysis.pageSizeType}`}
                icon={<FileIcon />}
                action={<AuraStatus tone="success" label={status} />}
              />
            </div>
          </section>

          {largeFile || veryLargeDocument || analysis.pageSizeType === "Mixed" ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {largeFile ? (
                <div className="rounded-xl border border-[var(--lumeo-gold)]/20 bg-[var(--lumeo-gold)]/8 px-3 py-2 text-xs text-[var(--text-primary)]/72">
                  Large files may take longer because splitting happens in your browser.
                </div>
              ) : null}
              {veryLargeDocument ? (
                <div className="rounded-xl border border-[var(--lumeo-gold)]/20 bg-[var(--lumeo-gold)]/8 px-3 py-2 text-xs text-[var(--text-primary)]/72">
                  Previews render progressively for this document.
                </div>
              ) : null}
              {analysis.pageSizeType === "Mixed" ? (
                <div className="rounded-xl border border-[var(--lumeo-gold)]/20 bg-[var(--lumeo-gold)]/8 px-3 py-2 text-xs text-[var(--text-primary)]/72">
                  Mixed page sizes detected.
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/62 p-3">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--lumeo-gold)]">
                  Pages
                </p>
                <p className="text-xs text-[var(--text-primary)]/38">
                  {usesPageSelection
                    ? selectedSummary(selectedPages)
                    : mode === "reorder"
                      ? "Drag a page onto another to swap its place."
                      : `${analysis.pageCount} pages in this PDF`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(["compact", "comfortable", "large"] as ThumbnailDensity[]).map((density) => (
                  <button
                    type="button"
                    key={density}
                    onClick={() => {
                      setThumbnailDensity(density);
                      window.localStorage.setItem(THUMBNAIL_DENSITY_KEY, density);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-bold capitalize transition ${
                      thumbnailDensity === density
                        ? "border-[var(--border-selected)] bg-[var(--surface-selected)] text-[var(--lumeo-mint-subtle)]"
                        : "border-[var(--text-primary)]/10 text-[var(--text-primary)]/44 hover:border-[var(--lumeo-gold)]/30 hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {density}
                  </button>
                ))}
              </div>
            </div>

            {usesPageSelection ? (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={selectAllPages}>Select all</button>
                <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={clearSelection}>Clear</button>
                <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={invertSelection}>Invert</button>
                <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => applyPreset("odd")}>Odd</button>
                <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => applyPreset("even")}>Even</button>
                <span className="mx-1 h-5 w-px bg-[var(--text-primary)]/10" />
                <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => rotatePages("left")}>Rotate left</button>
                <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => rotatePages("right")}>Rotate right</button>
                <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => rotatePages("reset")}>Reset rotation</button>
              </div>
            ) : (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => rotatePages("left")}>Rotate focused left</button>
                <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => rotatePages("right")}>Rotate focused right</button>
                <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => rotatePages("reset")}>Reset focused rotation</button>
              </div>
            )}

            <div
              role="grid"
              aria-label="PDF pages"
              className={`no-scrollbar grid max-h-[18rem] gap-2 overflow-y-auto pr-1 lg:max-h-full ${densityClasses[thumbnailDensity]}`}
            >
              {orderedPageChips.map((page) =>
                mode === "reorder" ? (
                  <div
                    key={page.page}
                    draggable
                    onDragStart={(event) => {
                      setDraggingPage(page.page);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(page.page));
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (dragOverPage !== page.page) setDragOverPage(page.page);
                    }}
                    onDragLeave={() => {
                      if (dragOverPage === page.page) setDragOverPage(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const draggedFromData = Number(event.dataTransfer.getData("text/plain"));
                      const draggedPage = draggedFromData || draggingPage;
                      if (draggedPage) reorderPages(draggedPage, page.page);
                      setDraggingPage(null);
                      setDragOverPage(null);
                    }}
                    onDragEnd={() => {
                      setDraggingPage(null);
                      setDragOverPage(null);
                    }}
                    className={`cursor-grab rounded-xl transition active:cursor-grabbing ${
                      draggingPage === page.page
                        ? "scale-[0.97] opacity-60"
                        : dragOverPage === page.page
                          ? "ring-2 ring-[var(--border-selected)]"
                          : ""
                    }`}
                  >
                    <SplitPageThumbnail
                      page={page}
                      selected={false}
                      focused={focusedPage === page.page}
                      disabled
                      rotation={rotations[page.page] ?? 0}
                      density={thumbnailDensity}
                      imageUrl={thumbnailUrls[page.page]}
                      loading={thumbnailLoading[page.page] ?? false}
                      onVisible={scheduleThumbnailRender}
                      onClick={() => {}}
                      onFocus={setFocusedPage}
                    />
                  </div>
                ) : (
                  <SplitPageThumbnail
                    key={page.page}
                    page={page}
                    selected={selectedPages.includes(page.page)}
                    focused={focusedPage === page.page}
                    disabled={!usesPageSelection}
                    rotation={rotations[page.page] ?? 0}
                    density={thumbnailDensity}
                    imageUrl={thumbnailUrls[page.page]}
                    loading={thumbnailLoading[page.page] ?? false}
                    onVisible={scheduleThumbnailRender}
                    onClick={togglePage}
                    onFocus={setFocusedPage}
                  />
                ),
              )}
            </div>
          </div>
        </div>
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="Split options" description="Choose the split mode, page selection, and output name.">
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-[var(--text-primary)]/10 pb-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--lumeo-gold)]">
                  Split method
                </p>
                <button
                  type="button"
                  onClick={() => setMethodDrawerOpen((open) => !open)}
                  className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-bold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/34 hover:text-[var(--text-primary)]"
                >
                  Change
                </button>
              </div>
              <div className="mt-3 rounded-xl border border-[var(--border-selected)] bg-[var(--surface-selected)] px-3 py-2">
                <span className="block text-sm font-bold text-[var(--text-primary)]">
                  {selectedMode.label}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--text-primary)]/46">
                  {selectedMode.helper}
                </span>
              </div>
              {methodDrawerOpen ? (
                <div className="mt-2 grid gap-1 rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/88 p-2">
                  {splitModes.map((item) => (
                    <AuraOptionCard
                      key={item.value}
                      label={item.label}
                      description={item.helper}
                      selected={mode === item.value}
                      onClick={() => setModeSafely(item.value)}
                    />
                  ))}
                </div>
              ) : null}
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto py-3">
              {mode !== "everyPage" && mode !== "everyN" && mode !== "reorder" ? (
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]/42">
                    {mode === "ranges"
                      ? "Range groups"
                      : mode === "remove"
                        ? "Pages to remove"
                        : mode === "duplicate"
                          ? "Pages to duplicate"
                          : "Pages"}
                  </label>
                  <input
                    value={rangeInput}
                    onChange={(event) => {
                      const value = event.target.value;
                      pushHistory();
                      setRangeInput(value);
                      if (usesPageSelection && analysis) {
                        try {
                          setSelectedPages(parsePageList(value, analysis.pageCount).pages);
                        } catch {
                          setSelectedPages([]);
                        }
                      }
                      clearResult();
                    }}
                    className="mt-2 h-11 w-full rounded-xl border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.035] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-primary)]/25 focus:border-[var(--lumeo-gold)]/45"
                    placeholder={mode === "ranges" ? "1-3 | 4-6" : "1-3,5"}
                  />
                  {rangeSuggestions.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {rangeSuggestions.map((suggestion) => (
                        <button
                          type="button"
                          key={suggestion}
                          onClick={() => {
                            pushHistory();
                            setRangeInput(suggestion);
                            if (usesPageSelection) {
                              try {
                                setSelectedPages(parsePageList(suggestion, analysis.pageCount).pages);
                              } catch {
                                setSelectedPages([]);
                              }
                            }
                          }}
                          className="rounded-full border border-[var(--lumeo-gold)]/18 px-2.5 py-1 text-[11px] font-bold text-[var(--lumeo-gold)]/78 transition hover:border-[var(--lumeo-gold)]/40 hover:text-[var(--lumeo-gold)]"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-2 text-xs text-[var(--text-primary)]/38">
                    Examples: 1-3, 5, odd, even, all, or 1-end.
                  </p>
                </div>
              ) : null}

              {mode === "everyN" ? (
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]/42">
                    Pages per file
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={pageCount}
                    step={1}
                    value={chunkSize}
                    onChange={(event) => {
                      pushHistory();
                      setChunkSize(Number(event.target.value));
                      clearResult();
                    }}
                    className="mt-2 h-11 w-full rounded-xl border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.035] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none transition focus:border-[var(--lumeo-gold)]/45"
                  />
                </div>
              ) : null}

              {mode !== "everyPage" && mode !== "reorder" ? (
                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]/42">
                    Quick presets
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mode === "extract" || mode === "remove" || mode === "duplicate" ? (
                      <>
                        <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => applyPreset("all")}>All</button>
                        <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => applyPreset("first")}>First</button>
                        <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => applyPreset("last")}>Last</button>
                        <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => applyPreset("firstFive")}>First 5</button>
                        <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => applyPreset("lastFive")}>Last 5</button>
                        <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => applyPreset("firstHalf")}>First half</button>
                        <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => applyPreset("secondHalf")}>Second half</button>
                      </>
                    ) : null}
                    {mode === "ranges" ? (
                      <>
                        <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => applyPreset("halves")}>Halves</button>
                        <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => applyPreset("every2")}>Every 2</button>
                        <button className="preset-button lumeo-press lumeo-focus-ring" type="button" onClick={() => applyPreset("every5")}>Every 5</button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/66 p-3" aria-live="polite">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--lumeo-gold)]">
                  Live output
                </p>
                {outputPreview?.valid ? (
                  <div className="mt-2 grid gap-2 text-xs text-[var(--text-primary)]/52">
                    <div className="flex justify-between gap-3">
                      <span>Output</span>
                      <span className="font-bold text-[var(--text-primary)]/82">
                        {outputPreview.outputCount} {outputPreview.outputCount === 1 ? "PDF" : "PDFs"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Pages</span>
                      <span className="font-bold text-[var(--text-primary)]/82">{outputPreview.totalPages}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Type</span>
                      <span className="font-bold text-[var(--text-primary)]/82">
                        {outputPreview.zipRequired ? "ZIP download" : "PDF download"}
                      </span>
                    </div>
                    {outputPreview.rangeLabel ? (
                      <p className="truncate text-[var(--text-primary)]/42">Ranges: {outputPreview.rangeLabel}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[var(--text-danger)]/78">
                    {outputPreview?.message ?? "Check your split settings."}
                  </p>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/66 p-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--lumeo-gold)]">
                  Inspector
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-[var(--text-primary)]/8 bg-[var(--text-primary)]/[0.035] px-2 py-2">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{selectedPages.length}</p>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-primary)]/34">
                      Selected
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--text-primary)]/8 bg-[var(--text-primary)]/[0.035] px-2 py-2">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{selectedShare}%</p>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-primary)]/34">
                      Share
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--text-primary)]/8 bg-[var(--text-primary)]/[0.035] px-2 py-2">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{rotatedCount}</p>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-primary)]/34">
                      Rotated
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]/42">
                  {resultType === "pdf" ? "Output file name" : "ZIP file name"}
                </label>
                <input
                  value={outputName}
                  onChange={(event) => {
                    setOutputName(event.target.value);
                    clearResult();
                  }}
                  className="mt-2 h-11 w-full rounded-xl border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.035] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-primary)]/25 focus:border-[var(--lumeo-gold)]/45"
                  placeholder={resultType === "pdf" ? "lumeo-split.pdf" : "lumeo-split.zip"}
                />
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShortcutOpen((open) => !open)}
                  className="text-xs font-bold text-[var(--text-primary)]/44 underline decoration-[var(--lumeo-gold)]/24 underline-offset-4 transition hover:text-[var(--text-primary)]/80"
                >
                  Keyboard shortcuts
                </button>
                {shortcutOpen ? (
                  <div className="mt-2 rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/72 p-3 text-xs text-[var(--text-primary)]/48">
                    Ctrl/Cmd+A selects pages. Shift+Arrow extends selection. Ctrl/Cmd+Z undoes. Escape closes panels or clears selection.
                  </div>
                ) : null}
              </div>

              {parserNotice ? (
                <div role="alert" className="mt-4 rounded-xl border border-[var(--lumeo-gold)]/22 bg-[var(--lumeo-gold)]/10 px-3 py-2 text-sm text-[var(--text-primary)]/78">
                  {parserNotice}
                </div>
              ) : null}
              {error ? (
                <div role="alert" className="mt-4 rounded-xl border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 px-3 py-2 text-sm text-[var(--text-danger)]">
                  {error}
                </div>
              ) : null}
              {cleanupMessage ? (
                <div className="mt-4 rounded-xl border border-[rgb(var(--emerald-rgb)/0.36)] bg-[var(--surface-success)] px-3 py-2 text-sm text-[var(--text-success)]">
                  {cleanupMessage}
                </div>
              ) : null}
              {progressDetail ? (
                <div className="mt-4 rounded-xl border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.035] px-3 py-2 text-xs text-[var(--text-primary)]/48">
                  {progressDetail}
                </div>
              ) : null}
            </div>

            <div className="border-t border-[var(--text-primary)]/10 pt-3">
              {result ? (
                <div className="aura-success-reveal mb-3 rounded-xl border border-[var(--lumeo-gold)]/28 bg-[var(--lumeo-gold)]/12 p-3">
                  <div className="flex items-start gap-3">
                    <CompletionCheck />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)]">Split complete</p>
                      <p className="mt-1 text-xs text-[var(--text-primary)]/45">
                        {result.outputCount} {result.outputCount === 1 ? "PDF" : "PDFs"} created · {result.pageCount} pages processed · {formatBytes(result.size)} total
                      </p>
                      <p className="mt-1 truncate text-xs text-[var(--text-primary)]/38">
                        {result.fileName} · Created in your browser
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mb-3 text-xs text-[var(--text-primary)]/42">
                  {outputPreview?.valid ? `Ready to split · ${outputPreview.label}` : "Choose pages to split"}
                </p>
              )}

              {result ? (
                <div className="grid gap-2">
                  <L2ActionArea
                    primary={(
                      <button
                        type="button"
                        onClick={handleDownload}
                        className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] shadow-[var(--shadow-success)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98]"
                      >
                        Download {result.kind === "pdf" ? "PDF" : "ZIP"}
                      </button>
                    )}
                    secondary={(
                      <button
                        type="button"
                        onClick={resetTool}
                        className="inline-flex h-10 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--text-primary)]/12 px-5 text-sm font-bold text-[var(--text-primary)]/62 transition hover:border-[var(--lumeo-gold)]/30 hover:text-[var(--text-primary)]"
                      >
                        Clear and start new split
                      </button>
                    )}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isSplitting || !outputPreview?.valid}
                  onClick={handleSplit}
                  className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] shadow-[var(--shadow-success)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {isSplitting
                    ? "Working in your browser..."
                    : mode === "reorder"
                      ? "Save reordered PDF"
                      : mode === "duplicate"
                        ? "Save PDF with duplicates"
                        : "Split PDF"}
                </button>
              )}
            </div>
          </div>
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>

      <style jsx>{`
        .preset-button {
          border-radius: 9999px;
          border: 1px solid rgba(232, 223, 200, 0.1);
          background: rgba(240, 234, 214, 0.035);
          padding: 0.45rem 0.7rem;
          font-size: 0.72rem;
          font-weight: 700;
          color: rgba(240, 234, 214, 0.62);
          transition: all 180ms ease;
        }

        .preset-button:hover {
          border-color: rgba(201, 168, 76, 0.34);
          color: rgba(240, 234, 214, 0.92);
          transform: translateY(-1px);
        }

        @media (prefers-reduced-motion: reduce) {
          .preset-button,
          button {
            transition: none !important;
          }
        }
      `}</style>
    </section>
  );
}
