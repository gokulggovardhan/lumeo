"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";

type SplitMode = "extract" | "ranges" | "everyPage" | "everyN" | "remove";
type ResultKind = "pdf" | "zip";

type PdfAnalysis = {
  name: string;
  size: number;
  pageCount: number;
  pageSizeType: string;
  bytes: ArrayBuffer;
};

type SplitResult = {
  url: string;
  fileName: string;
  kind: ResultKind;
  pageCount: number;
};

const splitModes: Array<{ value: SplitMode; label: string; helper: string }> = [
  {
    value: "extract",
    label: "Extract pages",
    helper: "One PDF from selected pages.",
  },
  {
    value: "ranges",
    label: "Split ranges",
    helper: "Multiple PDFs in one ZIP.",
  },
  {
    value: "everyPage",
    label: "Every page",
    helper: "One PDF per page.",
  },
  {
    value: "everyN",
    label: "Every N pages",
    helper: "Create even document chunks.",
  },
  {
    value: "remove",
    label: "Remove pages",
    helper: "One PDF without selected pages.",
  },
];

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** power;
  return `${value >= 10 || power === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[power]}`;
}

function sanitizeFileName(name: string, fallback: string) {
  const clean = name
    .replace(/\.[^/.]+$/, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return clean || fallback;
}

function ensureExtension(name: string, extension: ".pdf" | ".zip") {
  const safe = sanitizeFileName(name.replace(/\.(pdf|zip)$/i, ""), "lumeo-split");
  return `${safe}${extension}`;
}

function classifyPageSize(width: number, height: number) {
  const portraitWidth = Math.min(width, height);
  const portraitHeight = Math.max(width, height);
  const close = (a: number, b: number) => Math.abs(a - b) <= 12;

  if (close(portraitWidth, 595.28) && close(portraitHeight, 841.89)) return "A4";
  if (close(portraitWidth, 612) && close(portraitHeight, 792)) return "Letter";
  return "Custom";
}

function pageSizeTypeFromPages(pdf: PDFDocument) {
  const pages = pdf.getPages();
  const labels = pages.map((page) => {
    const { width, height } = page.getSize();
    return `${Math.round(width)}x${Math.round(height)}:${classifyPageSize(width, height)}`;
  });
  const uniqueSizes = new Set(labels.map((label) => label.split(":")[0]));
  const uniqueLabels = new Set(labels.map((label) => label.split(":")[1]));

  if (uniqueSizes.size > 1) return "Mixed";
  return uniqueLabels.values().next().value ?? "Custom";
}

function parsePageToken(token: string, totalPages: number) {
  const trimmed = token.trim().toLowerCase();
  if (trimmed === "end") return totalPages;
  const page = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(page)) return null;
  return page;
}

function parsePageList(input: string, totalPages: number) {
  const text = input.trim();
  if (!text) throw new Error("Enter a valid page range.");
  if (text.toLowerCase() === "all") {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (text.toLowerCase() === "odd") {
    return Array.from({ length: totalPages }, (_, index) => index + 1).filter(
      (page) => page % 2 === 1,
    );
  }
  if (text.toLowerCase() === "even") {
    return Array.from({ length: totalPages }, (_, index) => index + 1).filter(
      (page) => page % 2 === 0,
    );
  }

  const pages: number[] = [];

  for (const rawPart of text.split(",")) {
    const part = rawPart.trim();
    if (!part) throw new Error("Enter a valid page range.");

    if (part.includes("-")) {
      const pieces = part.split("-").map((piece) => piece.trim());
      if (pieces.length !== 2 || !pieces[0] || !pieces[1]) {
        throw new Error("Enter a valid page range.");
      }
      const start = parsePageToken(pieces[0], totalPages);
      const end = parsePageToken(pieces[1], totalPages);
      if (start === null || end === null) throw new Error("Enter a valid page range.");
      if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
        throw new Error("Page range is outside this PDF.");
      }
      if (start > end) throw new Error("Enter a valid page range.");
      for (let page = start; page <= end; page += 1) pages.push(page);
    } else {
      const page = parsePageToken(part, totalPages);
      if (page === null) throw new Error("Enter a valid page range.");
      if (page < 1 || page > totalPages) throw new Error("Page range is outside this PDF.");
      pages.push(page);
    }
  }

  const uniquePages = Array.from(new Set(pages));
  if (!uniquePages.length) throw new Error("No pages selected.");
  return uniquePages;
}

function parseRangeGroups(input: string, totalPages: number) {
  const separator = input.includes("|") ? "|" : ",";
  const groups = input
    .split(separator)
    .map((group) => group.trim())
    .filter(Boolean)
    .map((group) => parsePageList(group, totalPages));

  if (!groups.length) throw new Error("Enter a valid page range.");
  return groups;
}

function describePages(pages: number[]) {
  if (pages.length === 1) return `page-${pages[0]}`;
  return `pages-${pages[0]}-${pages[pages.length - 1]}`;
}

async function createPdfFromPages(sourceBytes: ArrayBuffer, pages: number[]) {
  const source = await PDFDocument.load(sourceBytes);
  const output = await PDFDocument.create();
  const copied = await output.copyPages(
    source,
    pages.map((page) => page - 1),
  );
  copied.forEach((page) => output.addPage(page));
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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export default function SplitPdfTool() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [analysis, setAnalysis] = useState<PdfAnalysis | null>(null);
  const [mode, setMode] = useState<SplitMode>("extract");
  const [rangeInput, setRangeInput] = useState("1");
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [chunkSize, setChunkSize] = useState(2);
  const [outputName, setOutputName] = useState("lumeo-split");
  const [methodDrawerOpen, setMethodDrawerOpen] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Ready");
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [isSplitting, setIsSplitting] = useState(false);
  const [result, setResult] = useState<SplitResult | null>(null);

  const sourceBaseName = useMemo(
    () => sanitizeFileName(analysis?.name ?? "document", "document"),
    [analysis?.name],
  );

  const resultType: ResultKind = mode === "extract" || mode === "remove" ? "pdf" : "zip";
  const pageCount = analysis?.pageCount ?? 0;
  const largeFile = Boolean(analysis && analysis.size > 75 * 1024 * 1024);
  const selectedMode = splitModes.find((item) => item.value === mode) ?? splitModes[0];
  const usesPageSelection = mode === "extract" || mode === "remove";

  useEffect(() => {
    return () => {
      if (result?.url) URL.revokeObjectURL(result.url);
    };
  }, [result?.url]);

  function clearResult(message = "") {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setCleanupMessage(message);
  }

  function resetTool() {
    clearResult();
    setAnalysis(null);
    setMode("extract");
    setRangeInput("1");
    setSelectedPages([]);
    setChunkSize(2);
    setOutputName("lumeo-split");
    setError("");
    setStatus("Ready");
    setMethodDrawerOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function readPdfFile(file: File) {
    setError("");
    setCleanupMessage("");
    clearResult();

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please add one PDF file.");
      return;
    }

    try {
      const bytes = await file.arrayBuffer();
      const pdf = await PDFDocument.load(bytes);
      const nextAnalysis: PdfAnalysis = {
        name: file.name,
        size: file.size,
        pageCount: pdf.getPageCount(),
        pageSizeType: pageSizeTypeFromPages(pdf),
        bytes,
      };

      setAnalysis(nextAnalysis);
      setMode("extract");
      setRangeInput(nextAnalysis.pageCount > 1 ? "1-2" : "1");
      setSelectedPages(nextAnalysis.pageCount > 1 ? [1, 2] : [1]);
      setOutputName("lumeo-split");
      setStatus("Ready to split");
    } catch {
      setError("This file could not be read. It may be damaged or password-protected.");
    }
  }

  function handleFiles(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;
    void readPdfFile(file);
  }

  function applyPreset(preset: string) {
    if (!analysis) return;
    const total = analysis.pageCount;
    const half = Math.max(1, Math.ceil(total / 2));
    const setPages = (pages: number[]) => {
      setSelectedPages(pages);
      setRangeInput(pages.join(","));
      clearResult();
    };

    if (preset === "all") setPages(Array.from({ length: total }, (_, index) => index + 1));
    if (preset === "first") setPages([1]);
    if (preset === "last") setPages([total]);
    if (preset === "odd") {
      setPages(Array.from({ length: total }, (_, index) => index + 1).filter((page) => page % 2 === 1));
    }
    if (preset === "even") {
      setPages(Array.from({ length: total }, (_, index) => index + 1).filter((page) => page % 2 === 0));
    }
    if (preset === "firstHalf") setPages(Array.from({ length: half }, (_, index) => index + 1));
    if (preset === "secondHalf") {
      setPages(Array.from({ length: total - half }, (_, index) => half + index + 1));
    }
    if (preset === "halves") setRangeInput(`1-${half}, ${half + 1}-${total}`);
    if (preset === "every2") {
      setChunkSize(2);
      setRangeInput("1-2 | 3-4");
    }
    if (preset === "every5") {
      setChunkSize(5);
      setRangeInput("1-5 | 6-10");
    }
  }

  function setModeSafely(nextMode: SplitMode) {
    setMode(nextMode);
    setMethodDrawerOpen(false);
    setError("");
    clearResult();

    if (!analysis) return;
    if (nextMode === "extract") {
      const pages = analysis.pageCount > 1 ? [1, 2] : [1];
      setSelectedPages(pages);
      setRangeInput(pages.join(","));
    }
    if (nextMode === "ranges") {
      setSelectedPages([]);
      setRangeInput(`1-${Math.min(3, pageCount)}, ${Math.min(4, pageCount)}-${pageCount}`);
    }
    if (nextMode === "remove") {
      setSelectedPages([1]);
      setRangeInput("1");
    }
    if (nextMode === "everyPage" || nextMode === "everyN") {
      setSelectedPages([]);
    }
  }

  function togglePage(page: number) {
    if (!usesPageSelection) return;

    setSelectedPages((current) => {
      const next = current.includes(page)
        ? current.filter((item) => item !== page)
        : [...current, page].sort((a, b) => a - b);
      setRangeInput(next.join(","));
      clearResult();
      return next;
    });
  }

  function getGroupsForMode() {
    if (!analysis) throw new Error("Please add one PDF file.");
    const total = analysis.pageCount;

    if (mode === "extract") {
      const pages = selectedPages.length ? selectedPages : parsePageList(rangeInput, total);
      if (!pages.length) throw new Error("Choose at least one page.");
      return [pages];
    }
    if (mode === "ranges") return parseRangeGroups(rangeInput, total);
    if (mode === "everyPage") return Array.from({ length: total }, (_, index) => [index + 1]);
    if (mode === "everyN") {
      const size = Math.max(1, Math.min(total, Math.floor(chunkSize)));
      const groups: number[][] = [];
      for (let start = 1; start <= total; start += size) {
        groups.push(
          Array.from(
            { length: Math.min(size, total - start + 1) },
            (_, index) => start + index,
          ),
        );
      }
      return groups;
    }

    const pagesToRemove = selectedPages.length ? selectedPages : parsePageList(rangeInput, total);
    const removePages = new Set(pagesToRemove);
    const remaining = Array.from({ length: total }, (_, index) => index + 1).filter(
      (page) => !removePages.has(page),
    );
    if (!remaining.length) throw new Error("No pages selected.");
    return [remaining];
  }

  async function handleSplit() {
    if (!analysis) {
      setError("Please add one PDF file.");
      return;
    }

    setIsSplitting(true);
    setError("");
    setCleanupMessage("");
    clearResult();
    setStatus("Splitting in your browser...");

    try {
      const groups = getGroupsForMode();
      let blob: Blob;
      let fileName: string;

      if (resultType === "pdf") {
        const bytes = await createPdfFromPages(analysis.bytes, groups[0]);
        blob = new Blob([toArrayBuffer(bytes)], { type: "application/pdf" });
        fileName = ensureExtension(outputName || "lumeo-split", ".pdf");
      } else {
        const zip = new JSZip();

        for (let index = 0; index < groups.length; index += 1) {
          const group = groups[index];
          const bytes = await createPdfFromPages(analysis.bytes, group);
          const partName =
            mode === "everyN"
              ? `${sourceBaseName}-part-${String(index + 1).padStart(2, "0")}-${describePages(group)}.pdf`
              : mode === "ranges"
                ? `${sourceBaseName}-range-${group[0]}-${group[group.length - 1]}.pdf`
                : `${sourceBaseName}-${describePages(group)}.pdf`;
          zip.file(partName, bytes);
        }

        const zipBytes = await zip.generateAsync({ type: "blob" });
        blob = zipBytes;
        fileName = ensureExtension(outputName || "lumeo-split", ".zip");
      }

      const url = URL.createObjectURL(blob);
      setResult({
        url,
        fileName,
        kind: resultType,
        pageCount: groups.reduce((sum, group) => sum + group.length, 0),
      });
      setStatus("Download ready");
    } catch (splitError) {
      const message =
        splitError instanceof Error
          ? splitError.message
          : "Split failed. Try a smaller or valid PDF.";
      setError(
        [
          "Enter a valid page range.",
          "Page range is outside this PDF.",
          "No pages selected.",
          "Choose at least one page.",
          "Please add one PDF file.",
        ].includes(message)
          ? message
          : "Split failed. Try a smaller or valid PDF.",
      );
      setStatus("Ready");
    } finally {
      setIsSplitting(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    downloadUrl(result.url, result.fileName);
    window.setTimeout(() => {
      clearResult("Temporary file cleared from this session.");
      setStatus("Ready to split");
    }, 900);
  }

  const pageChips = analysis
    ? Array.from({ length: analysis.pageCount }, (_, index) => index + 1)
    : [];

  if (!analysis) {
    return (
      <div
        className="flex min-h-[28rem] flex-col rounded-2xl border border-[#E8DFC8]/10 bg-gradient-to-br from-[#10192A] via-[#0D1524] to-[#090F1A] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] lg:min-h-0 lg:flex-1"
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <div
          className={`flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed p-7 text-center transition sm:p-10 ${
            dragActive
              ? "border-[#C9A84C]/70 bg-[#C9A84C]/10"
              : "border-[#C9A84C]/32 bg-[#0A101C]/72"
          }`}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#C9A84C]/24 bg-[#F0EAD6]/8 text-[#C9A84C]">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none">
              <path
                d="M7 3.75h7.2L18 7.55v12.7H7z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.6"
              />
              <path
                d="M14 4v4h4M9.4 12h5.2M9.4 15.2h3.4"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.6"
              />
            </svg>
          </div>
          <h2 className="mt-5 font-serif text-4xl tracking-[-0.02em] text-[#F0EAD6]">
            Split PDF
          </h2>
          <p className="mt-2 text-sm text-[#F0EAD6]/52">
            Extract pages or separate one PDF into smaller files.
          </p>
          <p className="mt-6 text-sm font-semibold text-[#F0EAD6]/74">
            Drop one PDF here
          </p>
          <p className="mt-1 text-xs text-[#F0EAD6]/42">
            Choose file from your device
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-[#1E6B4A] px-6 text-sm font-bold text-[#F0EAD6] shadow-[0_14px_35px_rgba(30,107,74,0.28)] transition hover:-translate-y-0.5 hover:bg-[#257D58] active:scale-[0.98]"
          >
            Select PDF
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => handleFiles(event.target.files ?? [])}
          />
          {error ? <p className="mt-4 text-sm text-[#F0A8A8]">{error}</p> : null}
        </div>
        <div className="mt-4 rounded-xl border border-[#C9A84C]/18 bg-[#0A101C]/82 px-4 py-3 text-center text-xs font-semibold text-[#F0EAD6]/68">
          Private by design · Browser-only · Cleared after download
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.72fr)] lg:overflow-hidden 2xl:grid-cols-[minmax(0,1.9fr)_minmax(360px,0.72fr)]">
      <section className="flex min-h-0 flex-col rounded-2xl border border-[#E8DFC8]/10 bg-gradient-to-br from-[#10192A] via-[#0D1524] to-[#090F1A] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E8DFC8]/10 pb-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C9A84C]">
              Document tray
            </p>
            <h2 className="mt-1 truncate font-serif text-2xl text-[#F0EAD6]">
              {analysis.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={resetTool}
            className="rounded-full border border-[#E8DFC8]/12 px-3 py-2 text-xs font-bold text-[#F0EAD6]/55 transition hover:border-[#C9A84C]/35 hover:text-[#F0EAD6]"
          >
            Start new split
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {[
            ["Pages", String(analysis.pageCount)],
            ["Size", formatBytes(analysis.size)],
            ["Page type", analysis.pageSizeType],
            ["Status", status],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-[#E8DFC8]/8 bg-[#0A101C]/58 px-3 py-2"
            >
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[#F0EAD6]/34">
                {label}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-[#F0EAD6]/76">
                {value}
              </p>
            </div>
          ))}
        </div>

        {largeFile ? (
          <div className="mt-3 rounded-xl border border-[#C9A84C]/20 bg-[#C9A84C]/8 px-3 py-2 text-xs text-[#E8DFC8]/72">
            Large files may take longer because splitting happens in your browser.
          </div>
        ) : null}

        {analysis.pageSizeType === "Mixed" ? (
          <div className="mt-3 rounded-xl border border-[#C9A84C]/20 bg-[#C9A84C]/8 px-3 py-2 text-xs text-[#E8DFC8]/72">
            Mixed page sizes detected.
          </div>
        ) : null}

        <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#E8DFC8]/8 bg-[#0A101C]/50 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C9A84C]">
                Pages
              </p>
              <p className="text-xs text-[#F0EAD6]/38">
                {usesPageSelection
                  ? selectedPages.length
                    ? `Selected: ${selectedPages.length} ${selectedPages.length === 1 ? "page" : "pages"}`
                    : "No pages selected"
                  : `${analysis.pageCount} pages in this PDF`}
              </p>
            </div>
          </div>
          <div className="no-scrollbar grid max-h-[18rem] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6 lg:max-h-full lg:grid-cols-8 xl:grid-cols-10">
            {pageChips.map((page) => (
              <button
                type="button"
                key={page}
                onClick={() => togglePage(page)}
                disabled={!usesPageSelection}
                className={`rounded-lg border px-2 py-2 text-xs font-semibold transition hover:-translate-y-0.5 disabled:hover:translate-y-0 ${
                  selectedPages.includes(page)
                    ? "border-[#1E6B4A]/60 bg-[#1E6B4A]/18 text-[#F0EAD6]"
                    : "border-[#E8DFC8]/8 bg-[#F0EAD6]/[0.035] text-[#F0EAD6]/62 hover:border-[#C9A84C]/34 hover:text-[#F0EAD6] disabled:cursor-default disabled:opacity-55"
                }`}
              >
                {page}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[#C9A84C]/18 bg-[#0A101C]/82 px-4 py-3">
          <p className="text-xs font-semibold text-[#F0EAD6]/72">
            Private by design · Browser-only · Cleared after download
          </p>
          <p className="mt-1 text-xs leading-5 text-[#F0EAD6]/42">
            Files stay on your device. No server upload.
          </p>
        </div>
      </section>

      <aside className="flex min-h-0 flex-col rounded-2xl border border-[#E8DFC8]/10 bg-[#0A101C] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.26)]">
        <div className="border-b border-[#E8DFC8]/10 pb-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C9A84C]">
              Split method
            </p>
            <button
              type="button"
              onClick={() => setMethodDrawerOpen((open) => !open)}
              className="rounded-full border border-[#E8DFC8]/12 px-3 py-1.5 text-xs font-bold text-[#F0EAD6]/60 transition hover:border-[#C9A84C]/34 hover:text-[#F0EAD6]"
            >
              Change
            </button>
          </div>
          <div className="mt-3 rounded-xl border border-[#1E6B4A]/42 bg-[#1E6B4A]/14 px-3 py-2">
            <span className="block text-sm font-bold text-[#F0EAD6]">
              {selectedMode.label}
            </span>
            <span className="mt-0.5 block text-xs text-[#F0EAD6]/46">
              {selectedMode.helper}
            </span>
          </div>
          {methodDrawerOpen ? (
            <div className="mt-2 grid gap-1 rounded-xl border border-[#E8DFC8]/10 bg-[#050914]/88 p-2">
              {splitModes.map((item) => (
              <button
                type="button"
                key={item.value}
                onClick={() => setModeSafely(item.value)}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  mode === item.value
                    ? "border-[#1E6B4A]/55 bg-[#1E6B4A]/16"
                    : "border-[#E8DFC8]/8 bg-[#F0EAD6]/[0.025] hover:border-[#C9A84C]/28"
                }`}
              >
                <span className="flex items-center justify-between gap-3 text-sm font-bold text-[#F0EAD6]">
                  {item.label}
                  {mode === item.value ? (
                    <span className="text-[#A8E0C1]">✓</span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-[#F0EAD6]/42">
                  {item.helper}
                </span>
              </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto py-3">
          {mode !== "everyPage" && mode !== "everyN" ? (
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.16em] text-[#F0EAD6]/42">
                {mode === "ranges" ? "Range groups" : mode === "remove" ? "Pages to remove" : "Pages"}
              </label>
              <input
                value={rangeInput}
                onChange={(event) => {
                  const value = event.target.value;
                  setRangeInput(value);
                  if (usesPageSelection && analysis) {
                    try {
                      setSelectedPages(parsePageList(value, analysis.pageCount));
                    } catch {
                      setSelectedPages([]);
                    }
                  }
                  clearResult();
                }}
                className="mt-2 h-11 w-full rounded-xl border border-[#E8DFC8]/10 bg-[#F0EAD6]/[0.035] px-3 text-sm font-semibold text-[#F0EAD6] outline-none transition placeholder:text-[#F0EAD6]/25 focus:border-[#C9A84C]/45"
                placeholder={mode === "ranges" ? "1-3 | 4-6" : "1-3,5"}
              />
              <p className="mt-2 text-xs text-[#F0EAD6]/38">
                Examples: 1-3, 5, odd, even, all, or 1-end.
              </p>
            </div>
          ) : null}

          {mode === "everyN" ? (
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.16em] text-[#F0EAD6]/42">
                Pages per file
              </label>
              <input
                type="number"
                min={1}
                max={pageCount}
                value={chunkSize}
                onChange={(event) => {
                  setChunkSize(Number(event.target.value));
                  clearResult();
                }}
                className="mt-2 h-11 w-full rounded-xl border border-[#E8DFC8]/10 bg-[#F0EAD6]/[0.035] px-3 text-sm font-semibold text-[#F0EAD6] outline-none transition focus:border-[#C9A84C]/45"
              />
            </div>
          ) : null}

          {mode !== "everyPage" ? (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#F0EAD6]/42">
                Quick presets
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {mode === "extract" ? (
                  <>
                    <button className="preset-button" type="button" onClick={() => applyPreset("all")}>All</button>
                    <button className="preset-button" type="button" onClick={() => applyPreset("first")}>First page</button>
                    <button className="preset-button" type="button" onClick={() => applyPreset("last")}>Last page</button>
                    <button className="preset-button" type="button" onClick={() => applyPreset("odd")}>Odd pages</button>
                    <button className="preset-button" type="button" onClick={() => applyPreset("even")}>Even pages</button>
                    <button className="preset-button" type="button" onClick={() => applyPreset("firstHalf")}>First half</button>
                    <button className="preset-button" type="button" onClick={() => applyPreset("secondHalf")}>Second half</button>
                  </>
                ) : null}
                {mode === "ranges" ? (
                  <>
                    <button className="preset-button" type="button" onClick={() => applyPreset("halves")}>First half / second half</button>
                    <button className="preset-button" type="button" onClick={() => applyPreset("every2")}>Every 2 pages</button>
                    <button className="preset-button" type="button" onClick={() => applyPreset("every5")}>Every 5 pages</button>
                  </>
                ) : null}
                {mode === "remove" ? (
                  <>
                    <button className="preset-button" type="button" onClick={() => applyPreset("all")}>All</button>
                    <button className="preset-button" type="button" onClick={() => applyPreset("first")}>Remove first page</button>
                    <button className="preset-button" type="button" onClick={() => applyPreset("last")}>Remove last page</button>
                    <button className="preset-button" type="button" onClick={() => applyPreset("odd")}>Odd pages</button>
                    <button className="preset-button" type="button" onClick={() => applyPreset("even")}>Even pages</button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <label className="text-xs font-bold uppercase tracking-[0.16em] text-[#F0EAD6]/42">
              {resultType === "pdf" ? "Output file name" : "ZIP file name"}
            </label>
            <input
              value={outputName}
              onChange={(event) => setOutputName(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#E8DFC8]/10 bg-[#F0EAD6]/[0.035] px-3 text-sm font-semibold text-[#F0EAD6] outline-none transition placeholder:text-[#F0EAD6]/25 focus:border-[#C9A84C]/45"
              placeholder={resultType === "pdf" ? "lumeo-split.pdf" : "lumeo-split.zip"}
            />
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-[#F0A8A8]/20 bg-[#F0A8A8]/10 px-3 py-2 text-sm text-[#F0C0C0]">
              {error}
            </div>
          ) : null}
          {cleanupMessage ? (
            <div className="mt-4 rounded-xl border border-[#1E6B4A]/26 bg-[#1E6B4A]/12 px-3 py-2 text-sm text-[#A8E0C1]">
              {cleanupMessage}
            </div>
          ) : null}
        </div>

        <div className="border-t border-[#E8DFC8]/10 pt-3">
          {result ? (
            <div className="mb-3 rounded-xl border border-[#1E6B4A]/28 bg-[#1E6B4A]/12 p-3">
              <p className="text-sm font-bold text-[#F0EAD6]">Download ready</p>
              <p className="mt-1 text-xs text-[#F0EAD6]/45">
                {result.fileName} · {result.kind.toUpperCase()} · Created in your browser
              </p>
            </div>
          ) : (
            <p className="mb-3 text-xs text-[#F0EAD6]/42">
              Ready to split · {resultType.toUpperCase()} output
            </p>
          )}

          {result ? (
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#1E6B4A] px-5 text-sm font-bold text-[#F0EAD6] shadow-[0_14px_35px_rgba(30,107,74,0.28)] transition hover:-translate-y-0.5 hover:bg-[#257D58] active:scale-[0.98]"
            >
              Download {result.kind === "pdf" ? "PDF" : "ZIP"}
            </button>
          ) : (
            <button
              type="button"
              disabled={isSplitting}
              onClick={handleSplit}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#1E6B4A] px-5 text-sm font-bold text-[#F0EAD6] shadow-[0_14px_35px_rgba(30,107,74,0.28)] transition hover:-translate-y-0.5 hover:bg-[#257D58] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isSplitting ? "Splitting in your browser..." : "Split PDF"}
            </button>
          )}
        </div>
      </aside>

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
      `}</style>
    </div>
  );
}
