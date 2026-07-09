"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, rgb } from "pdf-lib";

type MergeStatus = "Ready" | "Merging in your browser..." | "Download ready";
type PageFormat = "smartA4" | "original";
type MarginPreset = "compact" | "clean" | "wide";

type SelectedPdf = {
  id: string;
  file: File;
  pageCount: number;
};

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

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
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#FF7A3D]/22 bg-[#FF5A36]/10 text-[#FFB07C]">
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
  const [pageFormat, setPageFormat] = useState<PageFormat>("smartA4");
  const [marginPreset, setMarginPreset] = useState<MarginPreset>("clean");
  const [status, setStatus] = useState<MergeStatus>("Ready");
  const [error, setError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("lumeo-merged.pdf");
  const [outputName, setOutputName] = useState("lumeo-merged.pdf");
  const [isDragging, setIsDragging] = useState(false);

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
    clearDownload();
  };

  const addFiles = async (incomingFiles: FileList | File[]) => {
    resetReadyState();

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

    for (const file of nextFiles) {
      try {
        const bytes = await file.arrayBuffer();
        const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
        readableFiles.push({
          id: createFileId(file),
          file,
          pageCount: pdf.getPageCount(),
        });
      } catch {
        unreadableCount += 1;
      }
    }

    if (readableFiles.length > 0) {
      setFiles((current) => [...current, ...readableFiles]);
    }

    if (unreadableCount > 0) {
      setError("One or more files could not be read as PDF.");
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
          const availableWidth = A4_WIDTH - selectedMargin * 2;
          const availableHeight = A4_HEIGHT - selectedMargin * 2;
          const scale = Math.min(
            availableWidth / sourceWidth,
            availableHeight / sourceHeight,
          );
          const drawWidth = sourceWidth * scale;
          const drawHeight = sourceHeight * scale;
          const x = (A4_WIDTH - drawWidth) / 2;
          const y = (A4_HEIGHT - drawHeight) / 2;
          const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);

          page.drawRectangle({
            x: 0,
            y: 0,
            width: A4_WIDTH,
            height: A4_HEIGHT,
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

  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#101018] p-5 shadow-2xl shadow-black/30 sm:p-8">
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
        className={`group relative overflow-hidden rounded-[1.75rem] border border-dashed p-8 text-center transition-all duration-300 sm:p-12 ${
          isDragging
            ? "scale-[1.01] border-[#FF7A3D]/70 bg-[#FF5A36]/12 shadow-[0_0_70px_rgba(255,90,54,0.18)]"
            : "border-[#FF7A3D]/28 bg-[#FF5A36]/[0.04] hover:-translate-y-1 hover:border-[#FF7A3D]/42 hover:bg-[#FF5A36]/[0.07] hover:shadow-[0_0_60px_rgba(255,90,54,0.10)]"
        }`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,90,54,0.14),transparent_42%)] opacity-70 transition group-hover:opacity-100" />
        <div className="relative">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-[#FF7A3D]/22 bg-[#FF5A36]/10 text-[#FFB07C] shadow-[0_0_40px_rgba(255,90,54,0.16)]">
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
            className="mt-6 rounded-full bg-[#FF5A36] px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#FF6E45] active:scale-[0.98]"
          >
            Select PDFs
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/54">
        Files stay on this device for this tool. Files are merged in your
        browser and are not uploaded.
      </div>

      <div className="mt-6 grid gap-3 rounded-[1.5rem] border border-white/10 bg-[#07070A]/62 p-4 sm:grid-cols-4 sm:p-5">
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
            {pageFormat === "smartA4" ? "Smart A4 fit" : "Original size"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/34">
            Mode
          </p>
          <p className="mt-1 text-sm font-semibold text-[#FFB07C]">
            Browser-only
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-[#07070A]/62 p-4 sm:p-5">
        <div>
          <p className="text-sm font-semibold text-white">Page format</p>
          <p className="mt-1 text-xs font-medium text-white/42">
            {pageFormat === "smartA4"
              ? "Best for scanned documents, forms, and mixed-size PDFs."
              : "Preserves each PDF page exactly as provided."}
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => updatePageFormat("smartA4")}
            className={`relative rounded-2xl border p-4 text-left transition-all duration-300 active:scale-[0.99] ${
              pageFormat === "smartA4"
                ? "border-[#FF7A3D]/50 bg-[#FF5A36]/12 shadow-[0_0_36px_rgba(255,90,54,0.12)]"
                : "border-white/10 bg-white/[0.035] hover:-translate-y-0.5 hover:border-[#FF7A3D]/24 hover:bg-white/[0.052]"
            }`}
          >
            <span
              className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset transition ${
                pageFormat === "smartA4"
                  ? "ring-[#FF7A3D]/36"
                  : "ring-transparent"
              }`}
            />
            <span className="relative flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-white">
                Smart A4 fit
              </span>
              <span className="rounded-full border border-[#FF7A3D]/24 bg-[#FF5A36]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#FFB07C]">
                Recommended
              </span>
            </span>
            <span className="relative mt-2 block text-xs leading-5 text-white/46">
              Makes every page the same clean A4 size.
            </span>
          </button>

          <button
            type="button"
            onClick={() => updatePageFormat("original")}
            className={`relative rounded-2xl border p-4 text-left transition-all duration-300 active:scale-[0.99] ${
              pageFormat === "original"
                ? "border-[#FF7A3D]/50 bg-[#FF5A36]/12 shadow-[0_0_36px_rgba(255,90,54,0.12)]"
                : "border-white/10 bg-white/[0.035] hover:-translate-y-0.5 hover:border-[#FF7A3D]/24 hover:bg-white/[0.052]"
            }`}
          >
            <span
              className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset transition ${
                pageFormat === "original"
                  ? "ring-[#FF7A3D]/36"
                  : "ring-transparent"
              }`}
            />
            <span className="relative text-sm font-semibold text-white">
              Keep original size
            </span>
            <span className="relative mt-2 block text-xs leading-5 text-white/46">
              Preserves each original page size.
            </span>
          </button>
        </div>

        {pageFormat === "smartA4" ? (
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
                  className={`rounded-2xl border p-3 text-left transition-all duration-300 active:scale-[0.99] ${
                    marginPreset === option.value
                      ? "border-[#FF7A3D]/45 bg-[#FF5A36]/12"
                      : "border-white/10 bg-white/[0.03] hover:border-[#FF7A3D]/24"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-white">
                    {option.label}
                    {option.recommended ? (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[#FFB07C]">
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

      <label className="mt-6 block rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4 sm:p-5">
        <span className="text-sm font-semibold text-white">Output file name</span>
        <input
          value={outputName}
          onChange={(event) => {
            setOutputName(event.target.value);
            setStatus("Ready");
            clearDownload();
          }}
          className="mt-3 w-full rounded-2xl border border-white/10 bg-[#07070A]/76 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-[#FF7A3D]/45 focus:ring-2 focus:ring-[#FF7A3D]/12"
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
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#111017] transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 active:scale-[0.98]"
          >
            {status === "Merging in your browser..." ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#111017]/20 border-t-[#111017]" />
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

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm font-medium text-red-100/86">
          {error}
        </div>
      ) : null}

      {downloadUrl ? (
        <div className="mt-6 rounded-[1.5rem] border border-[#FF7A3D]/24 bg-[#FF5A36]/10 p-5">
          <p className="text-lg font-semibold text-white">Merged PDF ready</p>
          <p className="mt-2 text-sm leading-6 text-white/52">
            {downloadName} -{" "}
            {pageFormat === "smartA4" ? "Smart A4 fit" : "Original size"}
          </p>
          <p className="mt-1 text-xs font-medium text-white/42">
            Created locally in your browser.
          </p>
          <a
            href={downloadUrl}
            download={downloadName}
            className="mt-5 inline-flex rounded-full bg-[#FF5A36] px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#FF6E45] active:scale-[0.98]"
          >
            Download merged PDF
          </a>
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="mt-6 space-y-3">
          {files.map((item, index) => (
            <div
              key={item.id}
              className="grid gap-3 rounded-2xl border border-white/10 bg-[#07070A]/72 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#FF7A3D]/24 hover:bg-[#0D0D13] sm:grid-cols-[auto_1fr_auto] sm:items-center"
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
                  {item.pageCount === 1 ? "" : "s"}
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
