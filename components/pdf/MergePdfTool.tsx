"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, rgb } from "pdf-lib";

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

function PdfFileIcon() {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#CBA052]/22 bg-[#CBA052]/10 text-[#CBA052]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M6.5 3.8h7.8l3.2 3.2v13.2h-11V3.8Z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M14.1 4v3.3h3.2M8.8 11.2h6.4M8.8 14h4.6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.55"
        />
      </svg>
    </span>
  );
}

export default function MergePdfTool() {
  const inputRef = useRef<HTMLInputElement | null>(null);
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
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

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
    setShowAdvancedSettings(false);
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
    } catch (mergeError) {
      console.error("[Lumeo PDF] Merge failed", {
        error: mergeError,
        fileCount: files.length,
        totalSize,
        totalPages,
        pageFormat,
        marginPreset,
      });
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
      <section className="pb-4 lg:flex lg:h-full lg:flex-col lg:justify-center lg:pb-0">
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
          className={`lumeo-upload-surface group relative mx-auto w-full max-w-[1040px] overflow-hidden rounded-[24px] border px-5 py-7 shadow-2xl shadow-black/32 transition-all duration-300 sm:px-8 lg:px-10 lg:py-8 ${
            isDragging
              ? "border-[#CBA052]/64 bg-[#CBA052]/14 shadow-[0_24px_70px_rgba(245,158,11,0.2)]"
              : "border-[#FFFFFF]/18 bg-gradient-to-br from-[#111A2B] via-[#0F1727] to-[#0C1220] hover:-translate-y-0.5 hover:border-[#CBA052]/36"
          }`}
        >
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#CBA052]/42 to-transparent opacity-80" />


          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex max-w-2xl flex-col gap-4 sm:flex-row sm:items-center">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[#CBA052]/24 bg-[#0C1220]/64 text-[#CBA052] shadow-[0_18px_44px_rgba(0,0,0,0.24)] transition group-hover:scale-[1.02] group-hover:bg-[#CBA052]/14">
                <MergeIcon />
              </span>
              <div>
                <p className="text-2xl font-semibold tracking-[-0.02em] text-[#FFFFFF]">
                  Drop PDFs here
                </p>
                <p className="mt-2 text-base text-[#FFFFFF]/52">
                  or choose files from your device
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="lumeo-primary-action lumeo-press lumeo-focus-ring inline-flex w-full items-center justify-center rounded-full bg-[#1E6B4A] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(245,158,11,0.2)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#257B56] active:scale-[0.98] sm:w-auto"
            >
              Select PDFs
            </button>
          </div>
        </div>

        <div className="mt-4 text-center">
          <p className="text-sm font-semibold text-[#FFFFFF]/68">
            Private by design &middot; Browser-only &middot; Cleared after download
          </p>
          <p className="mt-1 text-xs text-[#FFFFFF]/38">
            Files stay on your device for this tool.
          </p>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 p-4 text-sm font-medium text-red-100/86">
            {error}
          </div>
        ) : null}

        {softWarning ? (
          <div className="mt-4 rounded-lg border border-[#CBA052]/20 bg-[#CBA052]/10 p-4 text-sm font-medium text-[#FFFFFF]">
            {softWarning}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="pb-28 lg:h-full lg:overflow-hidden lg:pb-0">
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

      <div className="grid gap-5 lg:h-full lg:grid-cols-[minmax(0,1.75fr)_minmax(340px,0.72fr)] lg:items-stretch 2xl:grid-cols-[minmax(0,1.95fr)_minmax(360px,0.72fr)]">
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <section className="animate-[consoleReveal_260ms_ease-out] rounded-xl border border-[#FFFFFF]/12 bg-gradient-to-br from-[#111A2B] via-[#0F1727] to-[#0C1220] p-3 shadow-2xl shadow-black/28">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#CBA052]">
                  Document tray
                </p>
                <p className="mt-0.5 text-xs text-[#FFFFFF]/48">
                  Add more PDFs to the deck.
                </p>
              </div>
              {files.length > 0 ? (
                <button
                  type="button"
                  onClick={clearAllFiles}
                  className="rounded-full border border-[#FFFFFF]/12 px-3 py-1.5 text-xs font-semibold text-[#FFFFFF]/58 transition hover:border-[#FFFFFF]/24 hover:text-[#FFFFFF]"
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
                  ? "border-[#CBA052]/60 bg-[#CBA052]/14 shadow-[0_18px_50px_rgba(245,158,11,0.18)]"
                  : "border-[#FFFFFF]/16 bg-[#0C1220]/70 hover:border-[#CBA052]/34 hover:bg-[#0C1220]/82"
              }`}
            >
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#CBA052]/28 to-transparent opacity-0 transition group-hover:opacity-100" />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#CBA052]/20 bg-[#FFFFFF]/[0.045] text-[#CBA052] transition group-hover:bg-[#CBA052]/16">
                    <MergeIcon />
                  </span>
                  <div>
                    <p className="text-base font-semibold text-[#FFFFFF]">
                      Drop PDFs here
                    </p>
                    <p className="mt-0.5 text-xs text-[#FFFFFF]/48">
                      Choose files from your device
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center justify-center rounded-full bg-[#CBA052] px-4 py-2 text-xs font-semibold text-[#F0EAD6] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#257B56] active:scale-[0.98]"
                >
                  Select PDFs
                </button>
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-1 animate-[consoleReveal_320ms_ease-out] flex-col rounded-xl border border-[#FFFFFF]/12 bg-gradient-to-br from-[#111A2B] via-[#0F1727] to-[#0C1220] p-3.5 shadow-2xl shadow-black/24">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#CBA052]">
                  Arrange
                </p>
                <p className="mt-0.5 text-xs text-[#FFFFFF]/48">
                  Drag to reorder.
                </p>
              </div>
              {files.length > 0 ? (
                <p className="text-xs font-semibold text-[#FFFFFF]/44">
                  {files.length} files - {totalPages} pages - {formatFileSize(totalSize)}
                </p>
              ) : null}
            </div>

            {files.length === 0 ? (
              <div className="rounded-lg border border-[#FFFFFF]/10 bg-[#0C1220]/48 p-5 text-sm text-[#FFFFFF]/46">
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
                    className={`grid cursor-grab gap-2 rounded-lg border px-3 py-2 transition-all duration-300 active:cursor-grabbing sm:grid-cols-[auto_auto_1fr_auto] sm:items-center ${
                      draggingFileId === item.id
                        ? "scale-[0.99] border-[#CBA052]/45 bg-[#CBA052]/10 opacity-70"
                        : dragOverFileId === item.id
                          ? "border-[#CBA052]/45 bg-[#CBA052]/[0.08] shadow-[0_14px_38px_rgba(245,158,11,0.12)]"
                          : "border-[#FFFFFF]/10 bg-[#0A101C]/74 hover:-translate-y-0.5 hover:border-[#CBA052]/22 hover:bg-[#142034]"
                    }`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#FFFFFF]/12 bg-[#FFFFFF]/[0.035] text-[11px] font-semibold text-[#FFFFFF]/58">
                      {index + 1}
                    </span>
                    <span className="hidden text-[#FFFFFF]/24 sm:inline" aria-hidden="true">
                      :::
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <PdfFileIcon />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#FFFFFF]">
                            {item.file.name}
                          </p>
                          <p className="mt-1 text-xs font-medium text-[#FFFFFF]/42">
                            {item.pageCount} page{item.pageCount === 1 ? "" : "s"} - {formatFileSize(item.file.size)} - {item.pageSizeType}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 sm:justify-end">
                      <button
                        type="button"
                        aria-label={`Move ${item.file.name} up`}
                        disabled={index === 0 || status === "Merging in your browser..."}
                        onClick={() => moveFile(index, -1)}
                        className="rounded-full border border-[#FFFFFF]/10 px-2.5 py-1.5 text-xs font-semibold text-[#FFFFFF]/56 transition hover:border-[#FFFFFF]/22 hover:text-[#FFFFFF] disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${item.file.name} down`}
                        disabled={
                          index === files.length - 1 ||
                          status === "Merging in your browser..."
                        }
                        onClick={() => moveFile(index, 1)}
                        className="rounded-full border border-[#FFFFFF]/10 px-2.5 py-1.5 text-xs font-semibold text-[#FFFFFF]/56 transition hover:border-[#FFFFFF]/22 hover:text-[#FFFFFF] disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${item.file.name}`}
                        disabled={status === "Merging in your browser..."}
                        onClick={() => removeFile(item.id)}
                        className="rounded-full border border-red-300/14 px-2.5 py-1.5 text-xs font-semibold text-red-100/70 transition hover:border-red-300/28 hover:text-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="no-scrollbar space-y-2 lg:max-h-[74px] lg:overflow-y-auto">
            {error ? (
              <div className="rounded-lg border border-red-400/20 bg-red-500/10 p-4 text-sm font-medium text-red-100/86">
                {error}
              </div>
            ) : null}

            {softWarning ? (
              <div className="rounded-lg border border-[#CBA052]/20 bg-[#CBA052]/10 p-4 text-sm font-medium text-[#FFFFFF]">
                {softWarning}
              </div>
            ) : null}

            {hasLargeFiles ? (
              <div className="rounded-lg border border-[#FFFFFF]/10 bg-[#0C1220]/50 p-4 text-sm font-medium text-[#FFFFFF]/56">
                Large files may take longer because merging happens in your browser.
              </div>
            ) : null}

            {mixedPageSizesDetected ? (
              <div className="rounded-lg border border-[#CBA052]/18 bg-[#CBA052]/[0.055] p-4 text-sm font-medium text-[#FFFFFF]">
                Mixed page sizes detected - Smart fit recommended.
              </div>
            ) : null}

            {cleanupMessage ? (
              <div className="rounded-lg border border-[#CBA052]/18 bg-[#CBA052]/[0.06] p-4 text-sm font-medium text-[#FFFFFF]">
                {cleanupMessage}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-[#CBA052]/20 bg-[#0A101C]/70 px-4 py-2 text-xs text-[#FFFFFF]/54 shadow-inner shadow-black/20">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-semibold text-[#FFFFFF]/74">
                Private by design &middot; Browser-only &middot; Cleared after download
              </p>
              <p className="lg:hidden">
                Files stay on your device. No server upload.
              </p>
            </div>
          </div>
        </div>

        <aside className="lg:min-h-0">
          <div className="flex h-full min-h-0 flex-col rounded-xl border border-[#FFFFFF]/14 bg-gradient-to-br from-[#111A2B] via-[#0F1727] to-[#0A101C] p-3 shadow-2xl shadow-black/32">
            <div className="mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#CBA052]">
                Output
              </p>
              <p className="mt-0.5 text-xs text-[#FFFFFF]/48">
                Choose finish.
              </p>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="rounded-lg border border-[#CBA052]/22 bg-[#0A101C]/74 p-3 shadow-inner shadow-black/20">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFFFFF]/34">
                    Output style
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-[#FFFFFF]">
                    {outputStyleLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-[#FFFFFF]/42">
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
                  className="rounded-full border border-[#FFFFFF]/14 bg-[#FFFFFF]/[0.025] px-3 py-1.5 text-xs font-semibold text-[#FFFFFF]/70 transition hover:border-[#CBA052]/32 hover:text-[#FFFFFF]"
                >
                  Change
                </button>
              </div>
            </div>

            {showOutputOptions ? (
              <div className="mt-2 overflow-hidden rounded-lg border border-[#FFFFFF]/10 bg-[#0C1220]/74">
                {outputFormatOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updatePageFormat(option.value)}
                    className={`flex w-full items-center justify-between gap-3 border-b border-[#FFFFFF]/8 px-3 py-2 text-left last:border-b-0 transition ${
                      pageFormat === option.value
                        ? "bg-[#CBA052]/12"
                        : "hover:bg-[#FFFFFF]/[0.035]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#FFFFFF]">
                        {option.label}
                        {option.recommended ? (
                          <span className="rounded-full bg-[#CBA052]/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#CBA052]">
                            Recommended
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-[#FFFFFF]/42">
                        {option.detail}
                      </span>
                    </span>
                    {pageFormat === option.value ? (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#CBA052] text-[#F0EAD6]">
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 16 16"
                          className="h-3.5 w-3.5"
                          fill="none"
                        >
                          <path
                            d="m4 8.2 2.4 2.4L12.2 5"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                          />
                        </svg>
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}

            {showMarginOptions ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedSettings((current) => !current)}
                  aria-expanded={showAdvancedSettings}
                  className="flex w-full items-center justify-between rounded-lg border border-[#FFFFFF]/10 bg-[#0C1220]/46 px-3 py-2 text-left transition hover:border-[#CBA052]/22"
                >
                  <span>
                    <span className="block text-sm font-semibold text-[#FFFFFF]">
                      Advanced settings
                    </span>
                    <span className="mt-0.5 block text-xs text-[#FFFFFF]/40">
                      Margin: {selectedMarginOption.label}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-[#CBA052]">
                    {showAdvancedSettings ? "Hide" : "Open"}
                  </span>
                </button>

                {showAdvancedSettings ? (
                  <div className="mt-2 rounded-full border border-[#FFFFFF]/10 bg-[#0C1220]/50 p-1">
                    <div className="grid grid-cols-3 gap-1">
                      {marginOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateMarginPreset(option.value)}
                          className={`rounded-full px-3 py-2 text-xs font-semibold transition-all duration-300 ${
                            marginPreset === option.value
                              ? "bg-[#CBA052] text-[#F0EAD6] shadow-[0_10px_26px_rgba(245,158,11,0.22)]"
                              : "text-[#FFFFFF]/56 hover:text-[#FFFFFF]"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <label className="mt-2.5 block rounded-lg border border-[#FFFFFF]/10 bg-[#0C1220]/50 p-2.5">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFFFFF]/34">
                File name
              </span>
              <input
                value={outputName}
                onChange={(event) => {
                  setOutputName(event.target.value);
                  setStatus("Ready");
                  clearDownload();
                }}
                className="mt-1.5 w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm font-semibold text-[#FFFFFF] outline-none transition placeholder:text-[#FFFFFF]/26 focus:border-b-[#CBA052]/45"
                placeholder="lumeo-merged.pdf"
              />
            </label>

            </div>

            <div className="mt-2.5 border-t border-[#FFFFFF]/10 pt-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#CBA052]">
                Finish
              </p>

              {downloadUrl ? (
                <div className="mt-3">
                  <p className="text-base font-semibold text-[#FFFFFF]">
                    Merged PDF ready
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/46">
                    {downloadName} - {outputStyleLabel} - {totalPages} pages
                  </p>
                  <div className="mt-3 hidden flex-col gap-2 lg:flex">
                    <button
                      type="button"
                      onClick={downloadMergedPdf}
                      className="rounded-full bg-[#CBA052] px-5 py-2.5 text-sm font-semibold text-[#F0EAD6] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#257B56] active:scale-[0.98]"
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={startNewMerge}
                      className="rounded-full border border-[#FFFFFF]/12 px-5 py-2.5 text-sm font-semibold text-[#FFFFFF]/62 transition hover:border-[#FFFFFF]/24 hover:text-[#FFFFFF]"
                    >
                      Start new
                    </button>
                  </div>
                </div>
              ) : files.length >= 2 ? (
                <div className="mt-3">
                  <p className="text-base font-semibold text-[#FFFFFF]">
                    Ready to merge
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/46">
                    {readySummary}
                  </p>
                  <button
                    type="button"
                    disabled={status === "Merging in your browser..."}
                    onClick={mergePdfs}
                    className="mt-3 hidden w-full items-center justify-center gap-2 rounded-full bg-[#CBA052] px-5 py-2.5 text-sm font-semibold text-[#F0EAD6] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#257B56] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 active:scale-[0.98] lg:inline-flex"
                  >
                    {status === "Merging in your browser..." ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#E8DFC8]/24 border-t-white" />
                        Merging in your browser...
                      </>
                    ) : (
                      "Merge PDFs"
                    )}
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[#FFFFFF]/48">
                  Add one more PDF to merge.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {files.length >= 2 || downloadUrl ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3 lg:hidden">
          <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-[#CBA052]/24 bg-[#0C1220]/95 p-3 shadow-2xl shadow-black/40 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            {downloadUrl ? (
              <>
                <div>
                  <p className="text-sm font-semibold text-[#FFFFFF]">
                    Merged PDF ready
                  </p>
                  <p className="mt-1 text-xs text-[#FFFFFF]/46">
                    {downloadName} - {outputStyleLabel}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={downloadMergedPdf}
                    className="rounded-full bg-[#CBA052] px-5 py-2.5 text-sm font-semibold text-[#F0EAD6]"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={startNewMerge}
                    className="rounded-full border border-[#FFFFFF]/12 px-5 py-2.5 text-sm font-semibold text-[#FFFFFF]/62"
                  >
                    Start new
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm font-semibold text-[#FFFFFF]">
                    Ready to merge
                  </p>
                  <p className="mt-1 text-xs text-[#FFFFFF]/46">
                    {readySummary}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={status === "Merging in your browser..."}
                  onClick={mergePdfs}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#CBA052] px-5 py-2.5 text-sm font-semibold text-[#F0EAD6] disabled:opacity-45"
                >
                  {status === "Merging in your browser..." ? "Merging..." : "Merge PDFs"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
