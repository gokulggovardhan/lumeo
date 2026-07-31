"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, rgb } from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2AdvancedDisclosure,
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
import { AuraOptionCard, AuraSegmentedControl } from "@/components/ui/Aura";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import { openPdfJsDocument } from "@/lib/pdf/pdfjs";
import { recordRecentFile } from "@/lib/recent-files";
import { formatBytes as formatFileSize } from "@/lib/pdf/formatBytes";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { normalizeRotation } from "@/lib/pdf/rotation";
import {
  hasPdfMagicBytes,
  isPdfNamedFile,
  checkPdfFileSize,
} from "@/lib/pdf/uploadValidation";

function destroyPdfJsDoc(doc: unknown) {
  void (doc as { destroy?: () => Promise<void> | void }).destroy?.();
}

async function renderPdfPageToBlobUrl(file: File, scale: number, rotation: number): Promise<string | null> {
  const bytes = await file.arrayBuffer();
  const doc = await openPdfJsDocument(bytes);
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale, rotation });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    context.fillStyle = "#F8F3E4";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    canvas.width = 0;
    canvas.height = 0;
    return blob ? URL.createObjectURL(blob) : null;
  } finally {
    destroyPdfJsDoc(doc);
  }
}

// Rasterizes a single page of an already-open pdfjs document so it can be
// embedded as an image on the merged page -- pdf-lib's own page-rotation
// mechanisms (setRotation's /Rotate entry vs. drawPage's content-matrix
// rotate) use different angle conventions and don't compose cleanly with the
// scale-to-fit-and-center math already used for unrotated pages. Takes an
// open document rather than a File so a multi-page rotated source is parsed
// once and reused across all of its pages, not re-decoded per page.
async function renderOpenDocPageToImageBytes(
  doc: PDFDocumentProxy,
  pageNumber: number,
  rotation: number,
  scale: number,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  const width = canvas.width;
  const height = canvas.height;
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) return null;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

type MergeStatus = "Ready" | "Merging in your browser..." | "Download ready";
type CleanupMessage = "" | "Temporary file cleared from this session.";
type PageFormat =
  | "smartA4Portrait"
  | "smartA4Landscape"
  | "matchFirst"
  | "original";
type MarginPreset = "compact" | "clean" | "wide";
type PageSizeType = "A4" | "Letter" | "Custom" | "Mixed";

type PageSize = {
  width: number;
  height: number;
};

type SelectedPdf = {
  id: string;
  file: File;
  pageCount: number;
  pageSizes: PageSize[];
  pageSizeType: PageSizeType;
  rotation: number;
};

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const LARGE_FILE_WARNING_BYTES = 80 * 1024 * 1024;

const marginOptions: Array<{
  value: MarginPreset;
  label: string;
  points: number;
  description: string;
  recommended?: boolean;
}> = [
  {
    value: "compact",
    label: "Compact",
    points: 12,
    description: "More room for the page.",
  },
  {
    value: "clean",
    label: "Clean",
    points: 24,
    description: "Balanced spacing for most documents.",
    recommended: true,
  },
  {
    value: "wide",
    label: "Wide",
    points: 36,
    description: "Extra breathing room.",
  },
];

function createFileId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;
}

function sanitizePdfFileName(value: string, fallback = "lumeo-merged") {
  const stem = sanitizeFileStem(value.replace(/\.pdf$/i, ""), fallback);
  return `${stem}.pdf`;
}

function sizesMatch(a: PageSize, b: PageSize, tolerance = 8) {
  return (
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

function matchesKnownSize(
  size: PageSize,
  width: number,
  height: number,
  tolerance = 12,
) {
  const portraitMatch =
    Math.abs(size.width - width) <= tolerance &&
    Math.abs(size.height - height) <= tolerance;
  const landscapeMatch =
    Math.abs(size.width - height) <= tolerance &&
    Math.abs(size.height - width) <= tolerance;
  return portraitMatch || landscapeMatch;
}

function getPageSizeType(pageSizes: PageSize[]): PageSizeType {
  if (pageSizes.length === 0) return "Custom";

  const firstSize = pageSizes[0];
  const hasMixedSizes = pageSizes.some((size) => !sizesMatch(size, firstSize));
  if (hasMixedSizes) return "Mixed";

  if (matchesKnownSize(firstSize, A4_WIDTH, A4_HEIGHT)) return "A4";
  if (matchesKnownSize(firstSize, LETTER_WIDTH, LETTER_HEIGHT)) return "Letter";
  return "Custom";
}

function getSizeSignature(size: PageSize) {
  return `${Math.round(size.width)}x${Math.round(size.height)}`;
}

function getOutputStyleLabel(format: PageFormat) {
  if (format === "smartA4Portrait") return "Smart A4 Portrait";
  if (format === "smartA4Landscape") return "Smart A4 Landscape";
  if (format === "matchFirst") return "Match first PDF";
  return "Keep original size";
}

function getOutputPageSize(format: PageFormat, firstPageSize?: PageSize) {
  if (format === "smartA4Landscape") {
    return { width: A4_HEIGHT, height: A4_WIDTH };
  }

  if (format === "matchFirst" && firstPageSize) {
    return { width: firstPageSize.width, height: firstPageSize.height };
  }

  return { width: A4_WIDTH, height: A4_HEIGHT };
}

function isSmartFitFormat(format: PageFormat) {
  return format !== "original";
}

function MergeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <path
        d="M7 6.5h9.2l2.3 2.3v11.7H7v-14Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M13.5 12.2h10.2l1.8 1.8v11.5h-12v-13.3Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M21 6.5h4M25 6.5v4M5 25.5h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function PdfThumbnail({
  url,
  name,
  onPreview,
  onRotate,
  disabled,
}: {
  url: string;
  name: string;
  onPreview: () => void;
  onRotate: (direction: -1 | 1) => void;
  disabled?: boolean;
}) {
  return (
    <div className="group relative h-16 w-14 shrink-0">
      <button
        type="button"
        aria-label={`Preview ${name}`}
        onClick={(event) => {
          event.stopPropagation();
          onPreview();
        }}
        className="flex h-16 w-14 items-center justify-center overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--text-primary)]/[0.045] transition hover:border-[var(--border-selected)] focus:outline-none focus:ring-2 focus:ring-[var(--lumeo-gold)]/45"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${name} page 1 preview`} className="h-full w-full object-cover" />
        ) : (
          <FileIcon />
        )}
      </button>

      {url ? (
        <div className="lumeo-reveal-on-interact pointer-events-none absolute inset-x-0 bottom-0 flex justify-between p-1">
          <button
            type="button"
            aria-label={`Rotate ${name} left`}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onRotate(-1);
            }}
            className="pointer-events-auto grid h-6 w-6 place-items-center rounded-full border border-[var(--text-primary)]/25 bg-[var(--atelier-surface-1)]/92 text-[11px] text-[var(--text-primary)] transition hover:border-[var(--lumeo-gold)]/60 disabled:opacity-40"
          >
            ↺
          </button>
          <button
            type="button"
            aria-label={`Rotate ${name} right`}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onRotate(1);
            }}
            className="pointer-events-auto grid h-6 w-6 place-items-center rounded-full border border-[var(--text-primary)]/25 bg-[var(--atelier-surface-1)]/92 text-[11px] text-[var(--text-primary)] transition hover:border-[var(--lumeo-gold)]/60 disabled:opacity-40"
          >
            ↻
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function MergePdfTool() {
  const { availability, track } = useAnalytics();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openedTrackedRef = useRef(false);
  const [files, setFiles] = useState<SelectedPdf[]>([]);
  const [pageFormat, setPageFormat] = useState<PageFormat>("smartA4Portrait");
  const [marginPreset, setMarginPreset] = useState<MarginPreset>("clean");
  const [status, setStatus] = useState<MergeStatus>("Ready");
  const [error, setError] = useState("");
  const [softWarning, setSoftWarning] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("lumeo-merged.pdf");
  const [outputName, setOutputName] = useState("lumeo-merged.pdf");
  const [isDragging, setIsDragging] = useState(false);
  const [draggingFileId, setDraggingFileId] = useState("");
  const [dragOverFileId, setDragOverFileId] = useState("");
  const [cleanupMessage, setCleanupMessage] = useState<CleanupMessage>("");
  const [showOutputOptions, setShowOutputOptions] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const thumbnailUrlsRef = useRef<Record<string, string>>({});
  const thumbnailSignatureRef = useRef<Record<string, string>>({});
  const renderingThumbnailIdsRef = useRef<Set<string>>(new Set());
  const previewUrlRef = useRef("");
  const previewSessionRef = useRef(0);

  const totalSize = useMemo(
    () => files.reduce((sum, item) => sum + item.file.size, 0),
    [files],
  );

  const totalPages = useMemo(
    () => files.reduce((sum, item) => sum + item.pageCount, 0),
    [files],
  );

  const selectedMargin =
    marginOptions.find((option) => option.value === marginPreset)?.points ?? 24;

  const firstPageSize = files[0]?.pageSizes[0];
  const outputStyleLabel = getOutputStyleLabel(pageFormat);
  const showMarginOptions = isSmartFitFormat(pageFormat);
  const selectedMarginOption =
    marginOptions.find((option) => option.value === marginPreset) ??
    marginOptions[1];
  const hasLargeFiles = totalSize >= LARGE_FILE_WARNING_BYTES;
  const mixedPageSizesDetected = useMemo(() => {
    const pageSizeSignatures = new Set<string>();

    for (const item of files) {
      if (item.pageSizeType === "Mixed") return true;
      for (const size of item.pageSizes) {
        pageSizeSignatures.add(getSizeSignature(size));
      }
    }

    return pageSizeSignatures.size > 1;
  }, [files]);

  const previewFile = files.find((item) => item.id === previewFileId) ?? null;

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  // Generates a page-1 thumbnail for every file (regenerated when its rotation
  // changes) and drops thumbnails for files no longer selected.
  useEffect(() => {
    const currentIds = new Set(files.map((item) => item.id));

    for (const id of Object.keys(thumbnailUrlsRef.current)) {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(thumbnailUrlsRef.current[id]);
        delete thumbnailUrlsRef.current[id];
        delete thumbnailSignatureRef.current[id];
        renderingThumbnailIdsRef.current.delete(id);
        setThumbnailUrls((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
    }

    // Only re-render a file's thumbnail when that file's own id:rotation
    // signature changed, not whenever any file in the list changes rotation.
    // File ids are globally unique (createFileId mixes in a random UUID), so
    // a render that resolves after this effect's cleanup has already fired
    // (React Strict Mode intentionally does mount-cleanup-mount in dev, and
    // concurrent rendering can do similar re-runs in production) is still
    // valid to apply -- there is no "stale" id it could clobber. The
    // signature is recorded only on success, so a render that never
    // completes (StrictMode's discarded first pass, or a thrown error)
    // simply gets retried on the next effect run instead of being silently
    // marked "done" while no thumbnail was ever produced.
    for (const item of files) {
      const signature = `${item.id}:${item.rotation}`;
      if (thumbnailSignatureRef.current[item.id] === signature) continue;
      if (renderingThumbnailIdsRef.current.has(item.id)) continue;
      renderingThumbnailIdsRef.current.add(item.id);

      void (async () => {
        try {
          const url = await renderPdfPageToBlobUrl(item.file, 0.24, item.rotation);
          if (!url) return;
          const previous = thumbnailUrlsRef.current[item.id];
          if (previous) URL.revokeObjectURL(previous);
          thumbnailUrlsRef.current[item.id] = url;
          thumbnailSignatureRef.current[item.id] = signature;
          setThumbnailUrls((current) => ({ ...current, [item.id]: url }));
        } catch {
          // Thumbnail is a convenience preview; leave the file usable without
          // one -- signature stays unmarked so it's retried next effect run.
        } finally {
          renderingThumbnailIdsRef.current.delete(item.id);
        }
      })();
    }
  }, [files]);

  useEffect(() => {
    return () => {
      Object.values(thumbnailUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      thumbnailUrlsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!previewFile) return;

    let cancelled = false;
    const session = ++previewSessionRef.current;
    void (async () => {
      try {
        const url = await renderPdfPageToBlobUrl(previewFile.file, 1.1, previewFile.rotation);
        if (cancelled || session !== previewSessionRef.current || !url) return;
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setPreviewUrl(url);
      } catch {
        // Preview render failure just leaves the lightbox showing its fallback state.
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewFile?.id, previewFile?.rotation]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const openPreview = (id: string) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
    setPreviewUrl("");
    setPreviewFileId(id);
  };

  const closePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
    setPreviewUrl("");
    setPreviewFileId(null);
  };

  useEffect(() => {
    const shouldAttempt = shouldAttemptOnce({
      availability,
      alreadyAccepted: openedTrackedRef.current,
    });
    if (!shouldAttempt) return;
    const result = track({ eventName: "tool_opened", toolSlug: "merge" });
    if (result.accepted) {
      openedTrackedRef.current = true;
    }
  }, [availability, track]);

  const clearDownload = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl("");
    setDownloadName(sanitizePdfFileName(outputName));
  };

  const resetReadyState = () => {
    setError("");
    setStatus("Ready");
    setCleanupMessage("");
    clearDownload();
  };

  const startNewMerge = () => {
    clearDownload();
    setFiles([]);
    setError("");
    setSoftWarning("");
    setStatus("Ready");
    setCleanupMessage("");
    setOutputName("lumeo-merged.pdf");
    setDownloadName("lumeo-merged.pdf");
    setPageFormat("smartA4Portrait");
    setMarginPreset("clean");
    setShowOutputOptions(false);
    closePreview();
  };

  const clearAllFiles = () => {
    clearDownload();
    setFiles([]);
    setError("");
    setSoftWarning("");
    setStatus("Ready");
    setCleanupMessage("");
    closePreview();
  };

  const addFiles = async (incomingFiles: FileList | File[]) => {
    resetReadyState();
    setSoftWarning("");

    const nextFiles = Array.from(incomingFiles);
    if (nextFiles.length === 0) return;

    const invalidType = nextFiles.find((file) => !isPdfNamedFile(file));

    if (invalidType) {
      setError("Please choose PDF files only.");
      return;
    }

    const oversized = nextFiles.find((file) => checkPdfFileSize(file) !== null);
    if (oversized) {
      setError(checkPdfFileSize(oversized) ?? "One of these files is too large.");
      return;
    }

    const readableFiles: SelectedPdf[] = [];
    const problemFileNames: string[] = [];
    let duplicateDetected = false;
    const existingKeys = new Set(
      files.map((item) => `${item.file.name}-${item.file.size}`),
    );
    const incomingKeys = new Set<string>();

    for (const file of nextFiles) {
      const duplicateKey = `${file.name}-${file.size}`;
      if (existingKeys.has(duplicateKey) || incomingKeys.has(duplicateKey)) {
        duplicateDetected = true;
      }
      incomingKeys.add(duplicateKey);

      try {
        const bytes = await file.arrayBuffer();

        if (!hasPdfMagicBytes(bytes)) {
          problemFileNames.push(file.name);
          continue;
        }

        const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
        const pageSizes = pdf.getPages().map((page) => {
          const { width, height } = page.getSize();
          return { width, height };
        });

        readableFiles.push({
          id: createFileId(file),
          file,
          pageCount: pdf.getPageCount(),
          pageSizes,
          pageSizeType: getPageSizeType(pageSizes),
          rotation: 0,
        });
      } catch {
        problemFileNames.push(file.name);
      }
    }

    if (readableFiles.length > 0) {
      setFiles((current) => [...current, ...readableFiles]);
    }

    if (problemFileNames.length > 0) {
      setError(
        problemFileNames.length === 1
          ? `"${problemFileNames[0]}" could not be read. It may be damaged, password-protected, or not a valid PDF.`
          : `${problemFileNames.length} files could not be read (damaged, password-protected, or not valid PDFs): ${problemFileNames.join(", ")}`,
      );
    }

    if (duplicateDetected) {
      setSoftWarning("Duplicate file detected.");
    }
  };

  const removeFile = (id: string) => {
    resetReadyState();
    setFiles((current) => current.filter((item) => item.id !== id));
    if (previewFileId === id) closePreview();
  };

  const rotateFile = (id: string, direction: -1 | 1) => {
    resetReadyState();
    setFiles((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, rotation: normalizeRotation(item.rotation + direction * 90) }
          : item,
      ),
    );
  };

  const moveFile = (index: number, direction: -1 | 1) => {
    resetReadyState();
    setFiles((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const reorderFilesById = (draggedId: string, targetId: string) => {
    if (!draggedId || !targetId || draggedId === targetId) return;

    resetReadyState();
    setFiles((current) => {
      const draggedIndex = current.findIndex((item) => item.id === draggedId);
      const targetIndex = current.findIndex((item) => item.id === targetId);
      if (draggedIndex < 0 || targetIndex < 0) return current;

      const next = [...current];
      const [draggedItem] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedItem);
      return next;
    });
  };

  const updatePageFormat = (format: PageFormat) => {
    setPageFormat(format);
    setShowOutputOptions(false);
    resetReadyState();
  };

  const updateMarginPreset = (preset: MarginPreset) => {
    setMarginPreset(preset);
    resetReadyState();
  };

  const mergePdfs = async () => {
    if (files.length < 2) {
      setError("Please add at least two PDF files.");
      return;
    }

    setError("");
    setStatus("Merging in your browser...");
    clearDownload();

    const RASTER_SCALE = 2;
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "merge" });

    try {
      const mergedPdf = await PDFDocument.create();

      for (const item of files) {
        try {
        const outputPageSize = getOutputPageSize(pageFormat, firstPageSize);
        const rotation = normalizeRotation(item.rotation);

        if (rotation === 0) {
          const bytes = await item.file.arrayBuffer();
          const sourcePdf = await PDFDocument.load(bytes, {
            ignoreEncryption: false,
          });

          if (pageFormat === "original") {
            const copiedPages = await mergedPdf.copyPages(
              sourcePdf,
              sourcePdf.getPageIndices(),
            );
            copiedPages.forEach((page) => mergedPdf.addPage(page));
            continue;
          }

          for (const sourcePage of sourcePdf.getPages()) {
            const embeddedPage = await mergedPdf.embedPage(sourcePage);
            const { width: sourceWidth, height: sourceHeight } = sourcePage.getSize();
            const availableWidth = outputPageSize.width - selectedMargin * 2;
            const availableHeight = outputPageSize.height - selectedMargin * 2;
            const scale = Math.min(
              availableWidth / sourceWidth,
              availableHeight / sourceHeight,
            );
            const drawWidth = sourceWidth * scale;
            const drawHeight = sourceHeight * scale;
            const x = (outputPageSize.width - drawWidth) / 2;
            const y = (outputPageSize.height - drawHeight) / 2;
            const page = mergedPdf.addPage([outputPageSize.width, outputPageSize.height]);

            page.drawRectangle({
              x: 0,
              y: 0,
              width: outputPageSize.width,
              height: outputPageSize.height,
              color: rgb(1, 1, 1),
            });
            page.drawPage(embeddedPage, { x, y, width: drawWidth, height: drawHeight });
          }
          continue;
        }

        // Rotated file: rasterize each page at the rotated orientation (pdfjs's
        // viewport rotation already swaps width/height correctly) and embed as
        // an image. Sidesteps pdf-lib's page-rotation angle conventions, which
        // don't compose cleanly with the existing scale-to-fit-and-center math.
        // The source document is decoded once and reused across every page,
        // not re-parsed per page.
        const sourceBytes = await item.file.arrayBuffer();
        const openDoc = await openPdfJsDocument(sourceBytes);
        try {
          for (let pageNumber = 1; pageNumber <= item.pageCount; pageNumber += 1) {
            const rendered = await renderOpenDocPageToImageBytes(openDoc, pageNumber, rotation, RASTER_SCALE);
            if (!rendered) continue;
            const image = await mergedPdf.embedJpg(rendered.bytes);
            const sourceWidth = rendered.width / RASTER_SCALE;
            const sourceHeight = rendered.height / RASTER_SCALE;

            if (pageFormat === "original") {
              const page = mergedPdf.addPage([sourceWidth, sourceHeight]);
              page.drawImage(image, { x: 0, y: 0, width: sourceWidth, height: sourceHeight });
              continue;
            }

            const availableWidth = outputPageSize.width - selectedMargin * 2;
            const availableHeight = outputPageSize.height - selectedMargin * 2;
            const scale = Math.min(
              availableWidth / sourceWidth,
              availableHeight / sourceHeight,
            );
            const drawWidth = sourceWidth * scale;
            const drawHeight = sourceHeight * scale;
            const x = (outputPageSize.width - drawWidth) / 2;
            const y = (outputPageSize.height - drawHeight) / 2;
            const page = mergedPdf.addPage([outputPageSize.width, outputPageSize.height]);

            page.drawRectangle({
              x: 0,
              y: 0,
              width: outputPageSize.width,
              height: outputPageSize.height,
              color: rgb(1, 1, 1),
            });
            page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
          }
        } finally {
          destroyPdfJsDoc(openDoc);
        }
        } catch (itemError) {
          throw new Error(
            `"${item.file.name}" could not be merged. ${itemError instanceof Error ? itemError.message : "It may be damaged or password-protected."}`,
          );
        }
      }

      const mergedBytes = await mergedPdf.save();
      const mergedBuffer = mergedBytes.buffer.slice(
        mergedBytes.byteOffset,
        mergedBytes.byteOffset + mergedBytes.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([mergedBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const safeName = sanitizePdfFileName(outputName);
      setDownloadUrl(url);
      setDownloadName(safeName);
      setCleanupMessage("");
      setStatus("Download ready");
      track({
        eventName: "processing_succeeded",
        toolSlug: "merge",
        durationMs: performance.now() - startedAt,
        success: true,
      });
      recordRecentFile({ tool: "merge", filename: safeName, fileSize: blob.size, pageCount: totalPages });
    } catch (mergeError) {
      setStatus("Ready");
      setError(
        mergeError instanceof Error
          ? mergeError.message
          : "Merge failed. Try smaller files or remove damaged PDFs.",
      );
      track({
        eventName: "processing_failed",
        toolSlug: "merge",
        durationMs: performance.now() - startedAt,
        success: false,
        errorCode: "processing_error",
      });
    }
  };

  const downloadMergedPdf = () => {
    if (!downloadUrl) return;

    track({ eventName: "download_started", toolSlug: "merge" });
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl("");
      setStatus("Ready");
      setCleanupMessage("Temporary file cleared from this session.");
    }, 800);
  };

  const outputFormatOptions: Array<{
    value: PageFormat;
    label: string;
    detail: string;
    recommended?: boolean;
  }> = [
    {
      value: "smartA4Portrait",
      label: "Smart A4 Portrait",
      detail: "Clean, same-size PDF output.",
      recommended: true,
    },
    {
      value: "smartA4Landscape",
      label: "Smart A4 Landscape",
      detail: "Same-size output for wide pages.",
    },
    {
      value: "matchFirst",
      label: "Match first PDF",
      detail: "Use the first page as the reference.",
    },
    {
      value: "original",
      label: "Keep original size",
      detail: "Preserve every source page size.",
    },
  ];

  const readySummary = `${files.length} file${files.length === 1 ? "" : "s"} - ${totalPages} pages - ${outputStyleLabel}`;

  const isMerging = status === "Merging in your browser...";

  if (files.length === 0) {
    return (
      <section className="l2-workspace grid gap-5 pb-4 lg:pb-0">
        <L2WorkspaceHeader title="Merge PDF" description="Combine PDFs into one clean, ordered document." />

        <div className="aura-glass-regular mx-auto w-full max-w-[720px] rounded-[var(--radius-2xl)] p-2 shadow-[var(--v2-elevation-3)]">
          <L2UploadStage
            inputId="merge-pdf-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · Minimum two files"
            multiple
            icon={<MergeIcon />}
            buttonLabel="Select PDFs"
            onFilesSelected={(selectedFiles) => {
              void addFiles(selectedFiles);
            }}
          />
        </div>

        <L2PrivacyNote />

        {error ? (
          <div className="mx-auto w-full max-w-[720px] rounded-[var(--radius-lg)] border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
            {error}
          </div>
        ) : null}

        {softWarning ? (
          <div className="mx-auto w-full max-w-[720px] rounded-[var(--radius-md)] border border-[rgba(var(--atelier-brass-rgb),0.2)] bg-[rgba(var(--atelier-brass-rgb),0.1)] p-4 text-sm font-medium text-[var(--text-primary)]">
            {softWarning}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="l2-workspace-deep grid gap-4 pb-28 lg:pb-6">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <L2WorkspaceHeader title="Merge PDF" description={readySummary} />

      <L2WorkspaceToolbar>
        <L2ToolbarButton variant="primary" onClick={() => inputRef.current?.click()}>
          + Add PDFs
        </L2ToolbarButton>
        <L2ToolbarButton onClick={clearAllFiles}>Clear all</L2ToolbarButton>
        <span className="ml-auto text-xs font-bold text-[var(--text-subtle)]">
          {files.length} file{files.length === 1 ? "" : "s"} · {totalPages} pages · {formatFileSize(totalSize)}
        </span>
      </L2WorkspaceToolbar>

      <L2WorkspaceGrid
        queue={
          <L2WorkspacePanel variant="flat">
            <L2PanelLabel title="Document tray" description="Drop more PDFs here, or use Add PDFs above." />
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                void addFiles(event.dataTransfer.files);
              }}
              className={`mt-3 flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-xl)] border-2 border-dashed p-4 text-center transition duration-[var(--v2-motion-normal)] ${
                isDragging
                  ? "border-[var(--border-selected)] bg-[var(--surface-selected)]"
                  : "border-[var(--border-subtle)] hover:border-[var(--border-selected)]"
              }`}
            >
              <MergeIcon />
              <p className="text-xs font-bold text-[var(--text-secondary)]">Drop PDFs here</p>
            </div>
          </L2WorkspacePanel>
        }
        main={
          <L2WorkspacePanel className="l2-workspace-arrange">
            <div className="mb-3">
              <L2PanelLabel title="Arrange" description="Drag to reorder the final document." />
            </div>

            <div className="no-scrollbar aura-scrollbar min-h-0 space-y-2 overflow-y-auto pr-1 lg:max-h-[52vh]">
              {files.map((item, index) => (
                <div
                  key={item.id}
                  draggable={!isMerging}
                  onDragStart={(event) => {
                    setDraggingFileId(item.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", item.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (dragOverFileId !== item.id) setDragOverFileId(item.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverFileId === item.id) setDragOverFileId("");
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedId =
                      event.dataTransfer.getData("text/plain") || draggingFileId;
                    reorderFilesById(draggedId, item.id);
                    setDraggingFileId("");
                    setDragOverFileId("");
                  }}
                  onDragEnd={() => {
                    setDraggingFileId("");
                    setDragOverFileId("");
                  }}
                  className={`flex cursor-grab items-center gap-2 rounded-[var(--radius-lg)] border px-3 py-2 transition-all duration-[var(--v2-motion-normal)] active:cursor-grabbing ${
                    draggingFileId === item.id
                      ? "scale-[0.99] border-[var(--border-selected)] bg-[var(--surface-selected)] opacity-70"
                      : dragOverFileId === item.id
                        ? "border-[var(--border-selected)] bg-[var(--surface-selected)] shadow-[var(--v2-elevation-2)]"
                        : "border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.03)] hover:-translate-y-0.5 hover:border-[var(--border-selected)]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="hidden shrink-0 text-[var(--text-subtle)] sm:inline"
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
                      <circle cx="5" cy="4" r="1.2" />
                      <circle cx="5" cy="8" r="1.2" />
                      <circle cx="5" cy="12" r="1.2" />
                      <circle cx="11" cy="4" r="1.2" />
                      <circle cx="11" cy="8" r="1.2" />
                      <circle cx="11" cy="12" r="1.2" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <L2FileCard
                      order={index + 1}
                      icon={
                        <PdfThumbnail
                          url={thumbnailUrls[item.id] ?? ""}
                          name={item.file.name}
                          onPreview={() => openPreview(item.id)}
                          onRotate={(direction) => rotateFile(item.id, direction)}
                          disabled={isMerging}
                        />
                      }
                      name={item.file.name}
                      meta={`${item.pageCount} page${item.pageCount === 1 ? "" : "s"} - ${formatFileSize(item.file.size)} - ${item.pageSizeType}${item.rotation ? ` - Rotated ${item.rotation}°` : ""}`}
                      onMoveUp={index === 0 || isMerging ? undefined : () => moveFile(index, -1)}
                      onMoveDown={index === files.length - 1 || isMerging ? undefined : () => moveFile(index, 1)}
                      onRemove={isMerging ? undefined : () => removeFile(item.id)}
                      moveUpLabel={`Move ${item.file.name} up`}
                      moveDownLabel={`Move ${item.file.name} down`}
                      removeLabel={`Remove ${item.file.name}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-2">
              {error ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-3 text-sm font-medium text-[var(--text-danger)]">
                  {error}
                </div>
              ) : null}
              {softWarning ? (
                <div className="rounded-[var(--radius-lg)] border border-[rgba(var(--atelier-brass-rgb),0.2)] bg-[rgba(var(--atelier-brass-rgb),0.1)] p-3 text-sm font-medium text-[var(--text-primary)]">
                  {softWarning}
                </div>
              ) : null}
              {hasLargeFiles ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.04)] p-3 text-sm font-medium text-[var(--text-secondary)]">
                  Large files may take longer because merging happens in your browser.
                </div>
              ) : null}
              {mixedPageSizesDetected ? (
                <div className="rounded-[var(--radius-lg)] border border-[rgba(var(--atelier-brass-rgb),0.18)] bg-[rgba(var(--atelier-brass-rgb),0.055)] p-3 text-sm font-medium text-[var(--text-primary)]">
                  Mixed page sizes detected - Smart fit recommended.
                </div>
              ) : null}
              {cleanupMessage ? (
                <div className="rounded-[var(--radius-lg)] border border-[rgba(var(--atelier-brass-rgb),0.18)] bg-[rgba(var(--atelier-brass-rgb),0.06)] p-3 text-sm font-medium text-[var(--text-primary)]">
                  {cleanupMessage}
                </div>
              ) : null}
            </div>
          </L2WorkspacePanel>
        }
        inspector={
          <L2WorkspaceInspector title="Merge options" description="One combined PDF using the file order shown.">

            <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.04)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                    Output style
                  </p>
                  <p className="mt-1.5 text-sm font-bold text-[var(--text-primary)]">
                    {outputStyleLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-[var(--text-secondary)]">
                    {pageFormat === "original"
                      ? "Preserves every source page size."
                      : pageFormat === "matchFirst"
                        ? "Fits every page to the first PDF size."
                        : "Clean, same-size PDF output."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOutputOptions((current) => !current)}
                  aria-expanded={showOutputOptions}
                  className="rounded-[var(--radius-pill)] border border-[var(--border-default)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition duration-[var(--v2-motion-fast)] hover:text-[var(--text-primary)]"
                >
                  Change
                </button>
              </div>
            </div>

            {showOutputOptions ? (
              <div className="mt-2 grid gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.03)] p-2">
                {outputFormatOptions.map((option) => (
                  <AuraOptionCard
                    key={option.value}
                    label={option.label}
                    description={option.detail}
                    selected={pageFormat === option.value}
                    recommended={option.recommended}
                    onClick={() => updatePageFormat(option.value)}
                  />
                ))}
              </div>
            ) : null}

            {showMarginOptions ? (
              <div className="mt-2">
                <L2AdvancedDisclosure title="Advanced settings" description={`Margin: ${selectedMarginOption.label}`}>
                  <AuraSegmentedControl
                    label="Margin"
                    options={marginOptions.map((option) => ({ value: option.value, label: option.label }))}
                    value={marginPreset}
                    onChange={(value) => updateMarginPreset(value as MarginPreset)}
                  />
                </L2AdvancedDisclosure>
              </div>
            ) : null}

            <label className="mt-3 block rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.03)] p-3">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                File name
              </span>
              <input
                value={outputName}
                onChange={(event) => {
                  setOutputName(event.target.value);
                  setStatus("Ready");
                  clearDownload();
                }}
                className="mt-1.5 w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-0 py-1 text-sm font-bold text-[var(--text-primary)] outline-none transition duration-[var(--v2-motion-fast)] placeholder:text-[var(--text-subtle)] focus:border-b-[var(--border-focus)]"
                placeholder="lumeo-merged.pdf"
              />
            </label>
          </L2WorkspaceInspector>
        }
      />

      <ToolActionBar>
        {downloadUrl ? (
          <>
            <span className="mr-auto text-xs font-bold text-[var(--text-secondary)]">
              {downloadName} · {outputStyleLabel} · {totalPages} pages
            </span>
            <button
              type="button"
              onClick={startNewMerge}
              className="lumeo-press inline-flex h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] px-5 text-sm font-bold text-[var(--text-secondary)] transition duration-[var(--v2-motion-fast)] hover:text-[var(--text-primary)]"
            >
              Start new
            </button>
            <button
              type="button"
              onClick={downloadMergedPdf}
              className="lumeo-primary-action inline-flex h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition-all duration-[var(--v2-motion-normal)] hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98]"
            >
              Download merged PDF
            </button>
          </>
        ) : files.length >= 2 ? (
          <>
            <span className="mr-auto text-xs font-bold text-[var(--text-secondary)]">{readySummary}</span>
            <button
              type="button"
              disabled={isMerging}
              onClick={mergePdfs}
              className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition-all duration-[var(--v2-motion-normal)] hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-[var(--v2-interactive-disabled-opacity)] disabled:hover:translate-y-0 active:scale-[0.98] sm:w-auto"
            >
              {isMerging ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--lumeo-paper-200)]/24 border-t-white" />
                  Merging in your browser...
                </>
              ) : (
                "Merge PDFs"
              )}
            </button>
          </>
        ) : (
          <span className="text-sm font-bold text-[var(--text-secondary)]">Add one more PDF to merge.</span>
        )}
      </ToolActionBar>

      {previewFile ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${previewFile.file.name} preview`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--v2-surface-overlay)] p-6"
          onClick={closePreview}
          onKeyDown={(event) => {
            if (event.key === "Escape") closePreview();
          }}
        >
          <div
            className="relative flex max-h-full max-w-full flex-col items-center gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="aura-glass-thick flex max-h-[72vh] max-w-[90vw] items-center justify-center overflow-hidden rounded-[var(--radius-lg)]">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={`${previewFile.file.name} page 1 full preview`}
                  className="max-h-[72vh] max-w-[90vw] object-contain"
                />
              ) : (
                <div className="flex h-64 w-48 items-center justify-center text-xs font-semibold text-[var(--text-danger)]">
                  Preview unavailable.
                </div>
              )}
            </div>
            <p className="text-xs font-semibold text-[var(--text-primary)]/70">
              {previewFile.file.name} - page 1 of {previewFile.pageCount}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Rotate ${previewFile.file.name} left`}
                onClick={() => rotateFile(previewFile.id, -1)}
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
                aria-label={`Rotate ${previewFile.file.name} right`}
                onClick={() => rotateFile(previewFile.id, 1)}
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
