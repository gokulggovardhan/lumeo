"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

type MergeStatus = "Ready" | "Merging..." | "Download ready";

type SelectedPdf = {
  id: string;
  file: File;
};

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function createFileId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<SelectedPdf[]>([]);
  const [status, setStatus] = useState<MergeStatus>("Ready");
  const [error, setError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("lumeo-merged.pdf");
  const [isDragging, setIsDragging] = useState(false);

  const totalSize = useMemo(
    () => files.reduce((sum, item) => sum + item.file.size, 0),
    [files],
  );

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const clearDownload = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl("");
    setDownloadName("lumeo-merged.pdf");
  };

  const addFiles = (incomingFiles: FileList | File[]) => {
    setError("");
    setStatus("Ready");
    clearDownload();

    const nextFiles = Array.from(incomingFiles);
    const invalidFile = nextFiles.find(
      (file) =>
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf"),
    );

    if (invalidFile) {
      setError("Please choose PDF files only.");
      return;
    }

    if (nextFiles.length === 0) return;

    setFiles((current) => [
      ...current,
      ...nextFiles.map((file) => ({
        id: createFileId(file),
        file,
      })),
    ]);
  };

  const removeFile = (id: string) => {
    setError("");
    setStatus("Ready");
    clearDownload();
    setFiles((current) => current.filter((item) => item.id !== id));
  };

  const moveFile = (index: number, direction: -1 | 1) => {
    setError("");
    setStatus("Ready");
    clearDownload();
    setFiles((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const mergePdfs = async () => {
    if (files.length < 2) {
      setError("Choose at least two PDF files to merge.");
      return;
    }

    setError("");
    setStatus("Merging...");
    clearDownload();

    try {
      const mergedPdf = await PDFDocument.create();

      for (const item of files) {
        const bytes = await item.file.arrayBuffer();
        const sourcePdf = await PDFDocument.load(bytes, {
          ignoreEncryption: false,
        });
        const copiedPages = await mergedPdf.copyPages(
          sourcePdf,
          sourcePdf.getPageIndices(),
        );
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedBytes = await mergedPdf.save();
      const mergedBuffer = mergedBytes.buffer.slice(
        mergedBytes.byteOffset,
        mergedBytes.byteOffset + mergedBytes.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([mergedBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      setDownloadUrl(url);
      setDownloadName(`lumeo-merged-${timestamp}.pdf`);
      setStatus("Download ready");
    } catch (mergeError) {
      console.error("[Lumeo PDF] Merge failed", {
        error: mergeError,
        fileCount: files.length,
        totalSize,
      });
      setStatus("Ready");
      setError(
        "Could not merge these PDFs. Make sure the files are valid and not password protected.",
      );
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
          if (event.target.files) addFiles(event.target.files);
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
          addFiles(event.dataTransfer.files);
        }}
        className={`rounded-[1.75rem] border border-dashed p-8 text-center transition sm:p-12 ${
          isDragging
            ? "border-[#FF7A3D]/60 bg-[#FF5A36]/12"
            : "border-[#FF7A3D]/28 bg-[#FF5A36]/[0.04] hover:border-[#FF7A3D]/42 hover:bg-[#FF5A36]/[0.07]"
        }`}
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-[#FF7A3D]/22 bg-[#FF5A36]/10 text-[#FFB07C] shadow-[0_0_40px_rgba(255,90,54,0.16)]">
          <MergeIcon />
        </div>
        <h2 className="text-2xl font-semibold tracking-[-0.02em]">
          Drop PDFs here
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/50">
          Select two or more PDF files, arrange the order, then merge them into
          one document.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-6 rounded-full bg-[#FF5A36] px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#FF6E45]"
        >
          Select PDFs
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/54">
        Files are merged in your browser for this tool and are not uploaded.
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white/82">Status: {status}</p>
          <p className="mt-1 text-xs font-medium text-white/40">
            {files.length} file{files.length === 1 ? "" : "s"} selected
            {files.length > 0 ? ` · ${formatFileSize(totalSize)}` : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={files.length < 2 || status === "Merging..."}
            onClick={mergePdfs}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#111017] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
          >
            {status === "Merging..." ? "Merging..." : "Merge PDFs"}
          </button>
          {downloadUrl ? (
            <a
              href={downloadUrl}
              download={downloadName}
              className="rounded-full border border-[#FF7A3D]/28 bg-[#FF5A36]/10 px-5 py-2.5 text-center text-sm font-semibold text-[#FFB07C] transition hover:border-[#FF7A3D]/44 hover:bg-[#FF5A36]/16"
            >
              Download merged PDF
            </a>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm font-medium text-red-100/86">
          {error}
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="mt-6 space-y-3">
          {files.map((item, index) => (
            <div
              key={item.id}
              className="grid gap-3 rounded-2xl border border-white/10 bg-[#07070A]/72 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {index + 1}. {item.file.name}
                </p>
                <p className="mt-1 text-xs font-medium text-white/40">
                  {formatFileSize(item.file.size)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={index === 0 || status === "Merging..."}
                  onClick={() => moveFile(index, -1)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/58 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Up
                </button>
                <button
                  type="button"
                  disabled={index === files.length - 1 || status === "Merging..."}
                  onClick={() => moveFile(index, 1)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/58 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Down
                </button>
                <button
                  type="button"
                  disabled={status === "Merging..."}
                  onClick={() => removeFile(item.id)}
                  className="rounded-full border border-red-300/15 px-3 py-1.5 text-xs font-semibold text-red-100/72 transition hover:border-red-300/28 hover:text-red-50 disabled:cursor-not-allowed disabled:opacity-35"
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
