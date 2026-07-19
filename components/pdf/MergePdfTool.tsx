"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, rgb } from "pdf-lib";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2ActionArea,
  L2AdvancedDisclosure,
  L2FileCard,
  L2PrivacyNote,
  L2ToolMainColumn,
  L2ToolSettingsPanel,
  L2ToolWorkspace,
  L2UploadStage,
} from "@/components/pdf/workspace/ToolWorkspace";
import { AuraOptionCard, AuraSegmentedControl } from "@/components/ui/Aura";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";

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

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function createFileId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;
}

function sanitizePdfFileName(value: string) {
  const cleanName = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const safeName = cleanName || "lumeo-merged.pdf";
  return safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
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

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

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
  };

  const clearAllFiles = () => {
    clearDownload();
    setFiles([]);
    setError("");
    setSoftWarning("");
    setStatus("Ready");
    setCleanupMessage("");
  };

  const addFiles = async (incomingFiles: FileList | File[]) => {
    resetReadyState();
    setSoftWarning("");

    const nextFiles = Array.from(incomingFiles);
    if (nextFiles.length === 0) return;

    const invalidType = nextFiles.find(
      (file) =>
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf"),
    );

    if (invalidType) {
      setError("Please choose PDF files only.");
      return;
    }

    const readableFiles: SelectedPdf[] = [];
    let unreadableCount = 0;
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
        });
      } catch {
        unreadableCount += 1;
      }
    }

    if (readableFiles.length > 0) {
      setFiles((current) => [...current, ...readableFiles]);
    }

    if (unreadableCount > 0) {
      setError(
        "This file could not be read. It may be damaged or password-protected.",
      );
    }

    if (duplicateDetected) {
      setSoftWarning("Duplicate file detected.");
    }
  };

  const removeFile = (id: string) => {
    resetReadyState();
    setFiles((current) => current.filter((item) => item.id !== id));
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

    try {
      const mergedPdf = await PDFDocument.create();

      for (const item of files) {
        const bytes = await item.file.arrayBuffer();
        const sourcePdf = await PDFDocument.load(bytes, {
          ignoreEncryption: false,
        });
        const outputPageSize = getOutputPageSize(pageFormat, firstPageSize);

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
          const { width: sourceWidth, height: sourceHeight } =
            sourcePage.getSize();
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
          const page = mergedPdf.addPage([
            outputPageSize.width,
            outputPageSize.height,
          ]);

          page.drawRectangle({
            x: 0,
            y: 0,
            width: outputPageSize.width,
            height: outputPageSize.height,
            color: rgb(1, 1, 1),
          });
          page.drawPage(embeddedPage, {
            x,
            y,
            width: drawWidth,
            height: drawHeight,
          });
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
    } catch {
      setStatus("Ready");
      setError("Merge failed. Try smaller files or remove damaged PDFs.");
    }
  };

  const downloadMergedPdf = () => {
    if (!downloadUrl) return;

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

  if (files.length === 0) {
    return (
      <section className="l2-tool-empty-state grid gap-4 pb-4 lg:pb-0">
        <div className="mx-auto w-full max-w-[1040px]">
          <L2UploadStage
            inputId="merge-pdf-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · Minimum two files"
            multiple
            icon={<MergeIcon />}
            privacyNote="Browser-first processing for supported live tools"
            buttonLabel="Select PDFs"
            onFilesSelected={(selectedFiles) => {
              void addFiles(selectedFiles);
            }}
          />
        </div>

        <L2PrivacyNote />

        {error ? (
          <div className="mt-4 rounded-lg border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
            {error}
          </div>
        ) : null}

        {softWarning ? (
          <div className="mt-4 rounded-[var(--radius-md)] border border-[rgba(var(--atelier-brass-rgb),0.2)] bg-[rgba(var(--atelier-brass-rgb),0.1)] p-4 text-sm font-medium text-[var(--text-primary)]">
            {softWarning}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="l2-tool-deep-workspace pb-4 lg:pb-0">
      <style>{`
        @keyframes consoleReveal {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
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

      <L2ToolWorkspace>
        <L2ToolMainColumn>
          <section className="animate-[consoleReveal_260ms_ease-out] rounded-xl border border-[var(--text-primary)]/12 bg-gradient-to-br from-[var(--atelier-surface-3)] via-[var(--atelier-surface-2)] to-[var(--atelier-surface-1)] p-3 shadow-2xl shadow-black/28">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--lumeo-gold)]">
                  Document tray
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-primary)]/48">
                  Add more PDFs to the deck.
                </p>
              </div>
              {files.length > 0 ? (
                <button
                  type="button"
                  onClick={clearAllFiles}
                  className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24 hover:text-[var(--text-primary)]"
                >
                  Clear all
                </button>
              ) : null}
            </div>

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
              className={`group relative overflow-hidden rounded-[24px] border px-4 py-2.5 transition-all duration-300 ${
                isDragging
                  ? "border-[var(--border-selected)] bg-[var(--surface-selected)] shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
                  : "border-[var(--text-primary)]/16 bg-[var(--atelier-surface-1)]/70 hover:border-[var(--border-selected)] hover:bg-[var(--atelier-surface-1)]/82"
              }`}
            >
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--lumeo-gold)]/28 to-transparent opacity-0 transition group-hover:opacity-100" />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--text-primary)]/[0.045] text-[var(--text-secondary)] transition group-hover:bg-[var(--text-primary)]/[0.08]">
                    <MergeIcon />
                  </span>
                  <div>
                    <p className="text-base font-semibold text-[var(--text-primary)]">
                      Drop PDFs here
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-primary)]/48">
                      Choose files from your device
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--lumeo-gold)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--lumeo-seal-500)] active:scale-[0.98]"
                >
                  Select PDFs
                </button>
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-1 animate-[consoleReveal_320ms_ease-out] flex-col rounded-xl border border-[var(--text-primary)]/12 bg-gradient-to-br from-[var(--atelier-surface-3)] via-[var(--atelier-surface-2)] to-[var(--atelier-surface-1)] p-3.5 shadow-2xl shadow-black/24">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--lumeo-gold)]">
                  Arrange
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-primary)]/48">
                  Drag to reorder.
                </p>
              </div>
              {files.length > 0 ? (
                <p className="text-xs font-semibold text-[var(--text-primary)]/44">
                  {files.length} files - {totalPages} pages - {formatFileSize(totalSize)}
                </p>
              ) : null}
            </div>

            {files.length === 0 ? (
              <div className="rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/48 p-5 text-sm text-[var(--text-primary)]/46">
                Add at least two PDFs to begin arranging your merge.
              </div>
            ) : (
              <div className="no-scrollbar min-h-0 space-y-2 overflow-y-auto pr-1 lg:max-h-full">
                {files.map((item, index) => (
                  <div
                    key={item.id}
                    draggable={status !== "Merging in your browser..."}
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
                    className={`flex cursor-grab items-center gap-2 rounded-lg border px-3 py-2 transition-all duration-300 active:cursor-grabbing ${
                      draggingFileId === item.id
                        ? "scale-[0.99] border-[var(--border-selected)] bg-[var(--surface-selected)] opacity-70"
                        : dragOverFileId === item.id
                          ? "border-[var(--border-selected)] bg-[var(--surface-selected)] shadow-[0_14px_38px_rgba(0,0,0,0.12)]"
                          : "border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/74 hover:-translate-y-0.5 hover:border-[var(--border-selected)] hover:bg-[var(--atelier-surface-3)]"
                    }`}
                  >
                    <span className="hidden text-[var(--text-primary)]/24 sm:inline" aria-hidden="true">
                      :::
                    </span>
                    <div className="min-w-0 flex-1">
                      <L2FileCard
                        order={index + 1}
                        icon={<FileIcon />}
                        name={item.file.name}
                        meta={`${item.pageCount} page${item.pageCount === 1 ? "" : "s"} - ${formatFileSize(item.file.size)} - ${item.pageSizeType}`}
                        onMoveUp={index === 0 || status === "Merging in your browser..." ? undefined : () => moveFile(index, -1)}
                        onMoveDown={index === files.length - 1 || status === "Merging in your browser..." ? undefined : () => moveFile(index, 1)}
                        onRemove={status === "Merging in your browser..." ? undefined : () => removeFile(item.id)}
                        moveUpLabel={`Move ${item.file.name} up`}
                        moveDownLabel={`Move ${item.file.name} down`}
                        removeLabel={`Remove ${item.file.name}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="no-scrollbar space-y-2 lg:max-h-[74px] lg:overflow-y-auto">
            {error ? (
              <div className="rounded-lg border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
                {error}
              </div>
            ) : null}

            {softWarning ? (
              <div className="rounded-lg border border-[var(--lumeo-gold)]/20 bg-[var(--lumeo-gold)]/10 p-4 text-sm font-medium text-[var(--text-primary)]">
                {softWarning}
              </div>
            ) : null}

            {hasLargeFiles ? (
              <div className="rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/50 p-4 text-sm font-medium text-[var(--text-primary)]/56">
                Large files may take longer because merging happens in your browser.
              </div>
            ) : null}

            {mixedPageSizesDetected ? (
              <div className="rounded-lg border border-[var(--lumeo-gold)]/18 bg-[var(--lumeo-gold)]/[0.055] p-4 text-sm font-medium text-[var(--text-primary)]">
                Mixed page sizes detected - Smart fit recommended.
              </div>
            ) : null}

            {cleanupMessage ? (
              <div className="rounded-lg border border-[var(--lumeo-gold)]/18 bg-[var(--lumeo-gold)]/[0.06] p-4 text-sm font-medium text-[var(--text-primary)]">
                {cleanupMessage}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--atelier-surface-2)]/70 px-4 py-2 text-xs text-[var(--text-primary)]/54 shadow-inner shadow-black/20">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <L2PrivacyNote compact />
              <p className="lg:hidden">
                Files stay on your device. No server upload.
              </p>
            </div>
          </div>
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="Merge options" description="One combined PDF using the file order shown.">
          <div className="flex h-full min-h-0 flex-col">
            <div className="mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--lumeo-gold)]">
                Output
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-primary)]/48">
                Choose finish.
              </p>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--atelier-surface-2)]/74 p-3 shadow-inner shadow-black/20">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">
                    Output style
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">
                    {outputStyleLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-[var(--text-primary)]/42">
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
                  className="rounded-full border border-[var(--text-primary)]/14 bg-[var(--text-primary)]/[0.025] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/32 hover:text-[var(--text-primary)]"
                >
                  Change
                </button>
              </div>
            </div>

            {showOutputOptions ? (
              <div className="mt-2 grid gap-2 overflow-hidden rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/74 p-2">
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

            <label className="mt-2.5 block rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/50 p-2.5">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">
                File name
              </span>
              <input
                value={outputName}
                onChange={(event) => {
                  setOutputName(event.target.value);
                  setStatus("Ready");
                  clearDownload();
                }}
                className="mt-1.5 w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm font-semibold text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-primary)]/26 focus:border-b-[var(--lumeo-gold)]/45"
                placeholder="lumeo-merged.pdf"
              />
            </label>

            </div>

            <div className="mt-2.5 border-t border-[var(--text-primary)]/10 pt-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--lumeo-gold)]">
                Finish
              </p>

              {downloadUrl ? (
                <div className="mt-3">
                  <p className="text-base font-semibold text-[var(--text-primary)]">
                    Merged PDF ready
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-primary)]/46">
                    {downloadName} - {outputStyleLabel} - {totalPages} pages
                  </p>
                  <div className="mt-3 hidden flex-col gap-2 lg:flex">
                    <L2ActionArea
                      primary={(
                        <button
                          type="button"
                          onClick={downloadMergedPdf}
                          className="lumeo-primary-action rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98]"
                        >
                          Download merged PDF
                        </button>
                      )}
                      secondary={(
                        <button
                          type="button"
                          onClick={startNewMerge}
                          className="rounded-[var(--radius-md)] border border-[var(--text-primary)]/12 px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)]/62 transition hover:border-[var(--text-primary)]/24 hover:text-[var(--text-primary)]"
                        >
                          Start new
                        </button>
                      )}
                    />
                  </div>
                </div>
              ) : files.length >= 2 ? (
                <div className="mt-3">
                  <p className="text-base font-semibold text-[var(--text-primary)]">
                    Ready to merge
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-primary)]/46">
                    {readySummary}
                  </p>
                  <L2ActionArea
                    primary={(
                      <button
                        type="button"
                        disabled={status === "Merging in your browser..."}
                        onClick={mergePdfs}
                        className="lumeo-primary-action mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 active:scale-[0.98]"
                      >
                        {status === "Merging in your browser..." ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--lumeo-paper-200)]/24 border-t-white" />
                            Merging in your browser...
                          </>
                        ) : (
                          "Merge PDFs"
                        )}
                      </button>
                    )}
                  />
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--text-primary)]/48">
                  Add one more PDF to merge.
                </p>
              )}
            </div>
          </div>
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>
    </section>
  );
}
