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
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#C9A84C]/22 bg-[#1E6B4A]/10 text-[#C9A84C]">
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

  return (
    <section className="rounded-xl border border-white/10 bg-[#1A2840] p-5 shadow-2xl shadow-black/30 sm:p-8">
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

      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/34">
        Step 1 - Add PDFs
      </p>

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
        className={`group relative overflow-hidden rounded-xl border border-dashed p-8 text-center transition-all duration-300 sm:p-12 ${
          isDragging
            ? "scale-[1.01] border-[#C9A84C]/70 bg-[#1E6B4A]/12 shadow-[0_18px_55px_rgba(30,107,74,0.18)]"
            : "border-[#C9A84C]/28 bg-[#1E6B4A]/[0.04] hover:-translate-y-1 hover:border-[#C9A84C]/42 hover:bg-[#1E6B4A]/[0.07] hover:shadow-[0_18px_55px_rgba(30,107,74,0.12)]"
        }`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(201,168,76,0.13),transparent_42%)] opacity-70 transition group-hover:opacity-100" />
        <div className="relative">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl border border-[#C9A84C]/22 bg-[#1E6B4A]/10 text-[#C9A84C] shadow-[0_14px_38px_rgba(30,107,74,0.18)]">
            <MergeIcon />
          </div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">
            Drop PDF files here
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/50">
            or choose from your device.
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-6 rounded-full bg-[#1E6B4A] px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#257B56] active:scale-[0.98]"
          >
            Select PDFs
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-white/54">
        Files stay on this device for this tool. Files are merged in your
        browser and are not uploaded.
      </div>

      <div className="mt-4 rounded-lg border border-[#C9A84C]/18 bg-[#1E6B4A]/[0.055] p-4">
        <p className="text-sm font-semibold text-white">Private by design</p>
        <p className="mt-2 text-sm leading-6 text-white/54">
          Files stay on your device for this tool. Nothing is uploaded or stored
          on our servers.
        </p>
        <p className="mt-1 text-xs leading-5 text-white/38">
          Temporary browser files are cleared after download or when you start
          over.
        </p>
      </div>

      <div className="mt-6 grid gap-3 rounded-xl border border-white/10 bg-[#0C1220]/62 p-4 sm:grid-cols-4 sm:p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/34">
            Files
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {files.length}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/34">
            Pages
          </p>
          <p className="mt-1 text-sm font-semibold text-white">{totalPages}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/34">
            Output
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {outputStyleLabel}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/34">
            Mode
          </p>
          <p className="mt-1 text-sm font-semibold text-[#C9A84C]">
            Browser-only
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-[#0C1220]/62 p-4 sm:p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/34">
          Step 2 - Choose output style
        </p>
        <div>
          <p className="text-sm font-semibold text-white">Page format</p>
          <p className="mt-1 text-xs font-medium text-white/42">
            {pageFormat === "original"
              ? "Preserves each PDF page exactly as provided."
              : "Best for scanned documents, forms, and mixed-size PDFs."}
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => updatePageFormat("smartA4Portrait")}
            className={`relative rounded-lg border p-4 text-left transition-all duration-300 active:scale-[0.99] ${
              pageFormat === "smartA4Portrait"
                ? "border-[#C9A84C]/50 bg-[#1E6B4A]/12 shadow-[0_14px_38px_rgba(30,107,74,0.14)]"
                : "border-white/10 bg-white/[0.035] hover:-translate-y-0.5 hover:border-[#C9A84C]/24 hover:bg-white/[0.052]"
            }`}
          >
            <span
              className={`pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset transition ${
                pageFormat === "smartA4Portrait"
                  ? "ring-[#C9A84C]/36"
                  : "ring-transparent"
              }`}
            />
            <span className="relative flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-white">
                Smart A4 Portrait
              </span>
              <span className="rounded-full border border-[#C9A84C]/24 bg-[#1E6B4A]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#C9A84C]">
                Recommended
              </span>
            </span>
            <span className="relative mt-2 block text-xs leading-5 text-white/46">
              Makes every page the same clean A4 size.
            </span>
          </button>

          <button
            type="button"
            onClick={() => updatePageFormat("smartA4Landscape")}
            className={`relative rounded-lg border p-4 text-left transition-all duration-300 active:scale-[0.99] ${
              pageFormat === "smartA4Landscape"
                ? "border-[#C9A84C]/50 bg-[#1E6B4A]/12 shadow-[0_14px_38px_rgba(30,107,74,0.14)]"
                : "border-white/10 bg-white/[0.035] hover:-translate-y-0.5 hover:border-[#C9A84C]/24 hover:bg-white/[0.052]"
            }`}
          >
            <span
              className={`pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset transition ${
                pageFormat === "smartA4Landscape"
                  ? "ring-[#C9A84C]/36"
                  : "ring-transparent"
              }`}
            />
            <span className="relative text-sm font-semibold text-white">
              Smart A4 Landscape
            </span>
            <span className="relative mt-2 block text-xs leading-5 text-white/46">
              Useful for wide pages and presentations.
            </span>
          </button>

          <button
            type="button"
            onClick={() => updatePageFormat("matchFirst")}
            className={`relative rounded-lg border p-4 text-left transition-all duration-300 active:scale-[0.99] ${
              pageFormat === "matchFirst"
                ? "border-[#C9A84C]/50 bg-[#1E6B4A]/12 shadow-[0_14px_38px_rgba(30,107,74,0.14)]"
                : "border-white/10 bg-white/[0.035] hover:-translate-y-0.5 hover:border-[#C9A84C]/24 hover:bg-white/[0.052]"
            }`}
          >
            <span
              className={`pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset transition ${
                pageFormat === "matchFirst"
                  ? "ring-[#C9A84C]/36"
                  : "ring-transparent"
              }`}
            />
            <span className="relative text-sm font-semibold text-white">
              Match first PDF
            </span>
            <span className="relative mt-2 block text-xs leading-5 text-white/46">
              Uses the first PDF page size for all pages.
            </span>
          </button>

          <button
            type="button"
            onClick={() => updatePageFormat("original")}
            className={`relative rounded-lg border p-4 text-left transition-all duration-300 active:scale-[0.99] ${
              pageFormat === "original"
                ? "border-[#C9A84C]/50 bg-[#1E6B4A]/12 shadow-[0_14px_38px_rgba(30,107,74,0.14)]"
                : "border-white/10 bg-white/[0.035] hover:-translate-y-0.5 hover:border-[#C9A84C]/24 hover:bg-white/[0.052]"
            }`}
          >
            <span
              className={`pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset transition ${
                pageFormat === "original"
                  ? "ring-[#C9A84C]/36"
                  : "ring-transparent"
              }`}
            />
            <span className="relative text-sm font-semibold text-white">
              Keep original size
            </span>
            <span className="relative mt-2 block text-xs leading-5 text-white/46">
              Preserves every original page size.
            </span>
          </button>
        </div>

        {showMarginOptions ? (
          <div className="mt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/34">
              A4 margin
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {marginOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateMarginPreset(option.value)}
                  className={`rounded-lg border p-3 text-left transition-all duration-300 active:scale-[0.99] ${
                    marginPreset === option.value
                      ? "border-[#C9A84C]/45 bg-[#1E6B4A]/12"
                      : "border-white/10 bg-white/[0.03] hover:border-[#C9A84C]/24"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-white">
                    {option.label}
                    {option.recommended ? (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[#C9A84C]">
                        Recommended
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-white/42">
                    {option.points}pt - {option.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <label className="mt-6 block rounded-xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
        <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.18em] text-white/34">
          Step 3 - Merge & download
        </span>
        <span className="text-sm font-semibold text-white">Output file name</span>
        <input
          value={outputName}
          onChange={(event) => {
            setOutputName(event.target.value);
            setStatus("Ready");
            clearDownload();
          }}
          className="mt-3 w-full rounded-lg border border-white/10 bg-[#0C1220]/76 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-[#C9A84C]/45 focus:ring-2 focus:ring-[#C9A84C]/12"
          placeholder="lumeo-merged.pdf"
        />
        <span className="mt-2 block text-xs leading-5 text-white/38">
          If .pdf is missing, Lumeo adds it automatically.
        </span>
      </label>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white/82">Status: {status}</p>
          <p className="mt-1 text-xs font-medium text-white/40">
            {files.length} file{files.length === 1 ? "" : "s"} selected
            {files.length > 0 ? ` | ${formatFileSize(totalSize)}` : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={files.length < 2 || status === "Merging in your browser..."}
            onClick={mergePdfs}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#1C1710] transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 active:scale-[0.98]"
          >
            {status === "Merging in your browser..." ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1C1710]/20 border-t-[#1C1710]" />
                Merging in your browser...
              </>
            ) : status === "Download ready" ? (
              "Download ready"
            ) : (
              "Merge PDFs"
            )}
          </button>
        </div>
      </div>

      {files.length >= 2 ? (
        <div className="mt-5 rounded-lg border border-[#C9A84C]/18 bg-[#1E6B4A]/[0.055] p-4 text-sm font-semibold text-[#F0EAD6]">
          Ready to merge: {files.length} files - {totalPages} pages -{" "}
          {outputStyleLabel}
          {showMarginOptions
            ? ` - ${
                marginOptions.find((option) => option.value === marginPreset)
                  ?.label ?? "Clean"
              } margin`
            : ""}
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-lg border border-red-400/20 bg-red-500/10 p-4 text-sm font-medium text-red-100/86">
          {error}
        </div>
      ) : null}

      {softWarning ? (
        <div className="mt-5 rounded-lg border border-[#C9A84C]/20 bg-[#C9A84C]/10 p-4 text-sm font-medium text-[#F0EAD6]">
          {softWarning}
        </div>
      ) : null}

      {hasLargeFiles ? (
        <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm font-medium text-white/58">
          Large files may take longer because merging happens in your browser.
        </div>
      ) : null}

      {mixedPageSizesDetected ? (
        <div className="mt-5 rounded-lg border border-[#C9A84C]/18 bg-[#1E6B4A]/[0.055] p-4 text-sm font-medium text-[#F0EAD6]">
          Mixed page sizes detected - Smart fit recommended.
        </div>
      ) : null}

      {cleanupMessage ? (
        <div className="mt-5 rounded-lg border border-[#C9A84C]/18 bg-[#1E6B4A]/[0.06] p-4 text-sm font-medium text-[#F0EAD6]">
          {cleanupMessage}
        </div>
      ) : null}

      {downloadUrl ? (
        <div className="mt-6 rounded-xl border border-[#C9A84C]/24 bg-[#1E6B4A]/10 p-5">
          <p className="text-lg font-semibold text-white">Merged PDF ready</p>
          <p className="mt-2 text-sm leading-6 text-white/52">
            {downloadName} - {outputStyleLabel} - {totalPages} pages
          </p>
          <p className="mt-1 text-xs font-medium text-white/42">
            Created locally in your browser.
          </p>
          <p className="mt-1 text-xs font-medium text-white/42">
            After download, the temporary file is cleared from this session.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={downloadMergedPdf}
              className="rounded-full bg-[#1E6B4A] px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#257B56] active:scale-[0.98]"
            >
              Download merged PDF
            </button>
            <button
              type="button"
              onClick={startNewMerge}
              className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold text-white/62 transition hover:border-white/20 hover:text-white"
            >
              Start new merge
            </button>
          </div>
        </div>
      ) : null}

      {files.length > 0 && !downloadUrl ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={clearAllFiles}
            className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold text-white/52 transition hover:border-white/20 hover:text-white"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={startNewMerge}
            className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold text-white/52 transition hover:border-white/20 hover:text-white"
          >
            Start new merge
          </button>
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="mt-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/34">
            Selected PDFs
          </p>
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
              className={`grid cursor-grab gap-3 rounded-lg border p-4 transition-all duration-300 active:cursor-grabbing sm:grid-cols-[auto_1fr_auto] sm:items-center ${
                draggingFileId === item.id
                  ? "scale-[0.99] border-[#C9A84C]/45 bg-[#1E6B4A]/10 opacity-70"
                  : dragOverFileId === item.id
                    ? "border-[#C9A84C]/45 bg-[#1E6B4A]/[0.08] shadow-[0_14px_38px_rgba(30,107,74,0.12)]"
                    : "border-white/10 bg-[#0C1220]/72 hover:-translate-y-0.5 hover:border-[#C9A84C]/24 hover:bg-[#0D0D13]"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xs font-semibold text-white/58">
                  {index + 1}
                </span>
                <PdfFileIcon />
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {item.file.name}
                </p>
                <p className="mt-1 text-xs font-medium text-white/40">
                  {formatFileSize(item.file.size)} | {item.pageCount} page
                  {item.pageCount === 1 ? "" : "s"} | {item.pageSizeType}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-label={`Move ${item.file.name} up`}
                  disabled={
                    index === 0 || status === "Merging in your browser..."
                  }
                  onClick={() => moveFile(index, -1)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/58 transition-all duration-200 hover:-translate-y-0.5 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0"
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
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/58 transition-all duration-200 hover:-translate-y-0.5 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0"
                >
                  Down
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${item.file.name}`}
                  disabled={status === "Merging in your browser..."}
                  onClick={() => removeFile(item.id)}
                  className="rounded-full border border-red-300/15 px-3 py-1.5 text-xs font-semibold text-red-100/72 transition-all duration-200 hover:-translate-y-0.5 hover:border-red-300/28 hover:text-red-50 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
