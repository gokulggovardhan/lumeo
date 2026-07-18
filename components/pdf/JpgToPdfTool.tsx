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
import { AuraIconButton, AuraOptionCard, AuraSegmentedControl } from "@/components/ui/Aura";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";

type ConvertStatus = "Ready" | "Converting in your browser..." | "Download ready";
type CleanupMessage = "" | "Temporary file cleared from this session.";
type PageSizeOption = "a4" | "letter" | "matchImage";
type MarginPreset = "clean" | "none";

type SelectedImage = {
  id: string;
  file: File;
  width: number;
  height: number;
  userRotation: number;
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
}> = [
  { value: "clean", label: "Clean", points: 24, description: "Small white border." },
  { value: "none", label: "None", points: 0, description: "Image fills the page edge-to-edge." },
];

function normalizeRotation(value: number) {
  return ((value % 360) + 360) % 360;
}

function readJpegExifOrientation(bytes: ArrayBuffer): number {
  const view = new DataView(bytes);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    if (marker === 0xffd9 || marker === 0xffda) break;
    const segmentLength = view.getUint16(offset + 2);
    if (marker === 0xffe1 && offset + 4 + segmentLength <= view.byteLength) {
      const segmentStart = offset + 4;
      if (
        view.getUint32(segmentStart) === 0x45786966 &&
        view.getUint16(segmentStart + 4) === 0x0000
      ) {
        const tiffStart = segmentStart + 6;
        const little = view.getUint16(tiffStart) === 0x4949;
        const firstIfdOffset = view.getUint32(tiffStart + 4, little);
        const ifdStart = tiffStart + firstIfdOffset;
        const entryCount = view.getUint16(ifdStart, little);
        for (let i = 0; i < entryCount; i += 1) {
          const entryOffset = ifdStart + 2 + i * 12;
          const tag = view.getUint16(entryOffset, little);
          if (tag === 0x0112) {
            const orientation = view.getUint16(entryOffset + 8, little);
            return orientation >= 1 && orientation <= 8 ? orientation : 1;
          }
        }
      }
      return 1;
    }
    offset += 2 + segmentLength;
  }
  return 1;
}

// Renders a File's decoded pixels onto a canvas, optionally applying an
// additional clockwise rotation. The browser's image decode pipeline already
// auto-applies EXIF orientation when drawing to a canvas, so re-encoding
// through this path both bakes the EXIF correction in (pdf-lib's embedJpg
// ignores EXIF entirely and embeds raw physical pixels otherwise) and covers
// mirrored orientations (2/4/5/7) that a rotation-only fix cannot.
async function renderImageToBytes(
  file: File,
  rotationDegrees: number,
  mimeType: string,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image could not be read."));
      el.src = url;
    });

    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const swapped = rotationDegrees === 90 || rotationDegrees === 270;

    const canvas = document.createElement("canvas");
    canvas.width = swapped ? naturalHeight : naturalWidth;
    canvas.height = swapped ? naturalWidth : naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported.");

    ctx.translate(canvas.width / 2, canvas.height / 2);
    if (rotationDegrees !== 0) ctx.rotate((rotationDegrees * Math.PI) / 180);
    ctx.drawImage(img, -naturalWidth / 2, -naturalHeight / 2, naturalWidth, naturalHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, 0.92),
    );
    if (!blob) throw new Error("Image could not be encoded.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const pageSizeOptions: Array<{
  value: PageSizeOption;
  label: string;
  detail: string;
  recommended?: boolean;
}> = [
  {
    value: "a4",
    label: "A4",
    detail: "Clean, same-size PDF output.",
    recommended: true,
  },
  {
    value: "letter",
    label: "Letter",
    detail: "US Letter page size for every image.",
  },
  {
    value: "matchImage",
    label: "Match image size",
    detail: "Each page matches its own image size.",
  },
];

function getPageSizeLabel(option: PageSizeOption) {
  if (option === "letter") return "Letter";
  if (option === "matchImage") return "Match image size";
  return "A4";
}

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
  const safeName = cleanName || "lumeo-images.pdf";
  return safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
}

function getDisplayDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image could not be read."));
    };
    img.src = url;
  });
}

// Detects a JPEG's EXIF orientation and, if it is anything other than
// "normal" (1), re-encodes the file through a canvas so the embedded pixel
// data matches what the browser (and the user) sees. Returns the original
// file untouched when no correction is needed, to avoid unnecessary
// recompression of the common case.
async function correctImageOrientation(file: File): Promise<File> {
  if (file.type !== "image/jpeg") return file;

  const bytes = await file.arrayBuffer();
  const orientation = readJpegExifOrientation(bytes);
  if (orientation === 1) return file;

  const rendered = await renderImageToBytes(file, 0, file.type);
  const blob = new Blob([rendered.bytes.slice()], { type: file.type });
  return new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
}

function ImageThumbnail({ url, rotation, name }: { url: string; rotation: number; name: string }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[rgb(var(--paper-rgb)/0.06)]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          aria-label={name}
          className="h-full w-full object-cover transition-transform duration-200"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      ) : (
        <FileIcon />
      )}
    </span>
  );
}

function JpgToPdfIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <rect x="4.5" y="5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8.7" cy="9.4" r="1.4" fill="currentColor" />
      <path d="M6 15l3.5-4 3 3.2L17 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12h5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M23.2 9l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 18.5h9a1 1 0 011 1v9a1 1 0 01-1 1h-9a1 1 0 01-1-1v-9a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20.5 22.5h4.5M20.5 25.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function JpgToPdfTool() {
  const { availability, track } = useAnalytics();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openedTrackedRef = useRef(false);
  const [files, setFiles] = useState<SelectedImage[]>([]);
  const [pageSizeOption, setPageSizeOption] = useState<PageSizeOption>("a4");
  const [status, setStatus] = useState<ConvertStatus>("Ready");
  const [error, setError] = useState("");
  const [softWarning, setSoftWarning] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("lumeo-images.pdf");
  const [outputName, setOutputName] = useState("lumeo-images.pdf");
  const [isDragging, setIsDragging] = useState(false);
  const [draggingFileId, setDraggingFileId] = useState("");
  const [dragOverFileId, setDragOverFileId] = useState("");
  const [cleanupMessage, setCleanupMessage] = useState<CleanupMessage>("");
  const [showPageSizeOptions, setShowPageSizeOptions] = useState(false);
  const [marginPreset, setMarginPreset] = useState<MarginPreset>("clean");
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const thumbnailUrlsRef = useRef<Record<string, string>>({});

  const totalSize = useMemo(
    () => files.reduce((sum, item) => sum + item.file.size, 0),
    [files],
  );

  const pageSizeLabel = getPageSizeLabel(pageSizeOption);
  const hasLargeFiles = totalSize >= LARGE_FILE_WARNING_BYTES;
  const showMarginOptions = pageSizeOption !== "matchImage";
  const selectedMarginOption = marginOptions.find((option) => option.value === marginPreset) ?? marginOptions[0];

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  useEffect(() => {
    const currentIds = new Set(files.map((item) => item.id));

    setThumbnailUrls((current) => {
      let changed = false;
      const next = { ...current };

      for (const id of Object.keys(next)) {
        if (!currentIds.has(id)) {
          URL.revokeObjectURL(next[id]);
          delete next[id];
          delete thumbnailUrlsRef.current[id];
          changed = true;
        }
      }

      for (const item of files) {
        if (!next[item.id]) {
          const url = URL.createObjectURL(item.file);
          next[item.id] = url;
          thumbnailUrlsRef.current[item.id] = url;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [files]);

  useEffect(() => {
    return () => {
      Object.values(thumbnailUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      thumbnailUrlsRef.current = {};
    };
  }, []);

  useEffect(() => {
    const shouldAttempt = shouldAttemptOnce({
      availability,
      alreadyAccepted: openedTrackedRef.current,
    });
    if (!shouldAttempt) return;
    const result = track({ eventName: "tool_opened", toolSlug: "jpg-to-pdf" });
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

  const startNewConversion = () => {
    clearDownload();
    setFiles([]);
    setError("");
    setSoftWarning("");
    setStatus("Ready");
    setCleanupMessage("");
    setOutputName("lumeo-images.pdf");
    setDownloadName("lumeo-images.pdf");
    setPageSizeOption("a4");
    setShowPageSizeOptions(false);
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
      (file) => file.type !== "image/jpeg" && file.type !== "image/png",
    );

    if (invalidType) {
      setError("Please choose JPG or PNG image files only.");
      return;
    }

    const readableFiles: SelectedImage[] = [];
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
        const correctedFile = await correctImageOrientation(file);
        const { width, height } = await getDisplayDimensions(correctedFile);
        readableFiles.push({
          id: createFileId(file),
          file: correctedFile,
          width,
          height,
          userRotation: 0,
        });
      } catch {
        unreadableCount += 1;
      }
    }

    if (readableFiles.length > 0) {
      setFiles((current) => [...current, ...readableFiles]);
    }

    if (unreadableCount > 0) {
      setError("This image could not be read. It may be damaged or an unsupported format.");
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

  const updatePageSizeOption = (option: PageSizeOption) => {
    setPageSizeOption(option);
    setShowPageSizeOptions(false);
    resetReadyState();
  };

  const updateMarginPreset = (preset: MarginPreset) => {
    setMarginPreset(preset);
    resetReadyState();
  };

  const rotateFile = (id: string, direction: -1 | 1) => {
    resetReadyState();
    setFiles((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, userRotation: normalizeRotation(item.userRotation + direction * 90) }
          : item,
      ),
    );
  };

  const convertToPdf = async () => {
    if (files.length < 1) {
      setError("Please add at least one image.");
      return;
    }

    setError("");
    setStatus("Converting in your browser...");
    clearDownload();

    try {
      const pdfDoc = await PDFDocument.create();
      const marginPoints = marginOptions.find((option) => option.value === marginPreset)?.points ?? 24;

      for (const item of files) {
        const netRotation = normalizeRotation(item.userRotation);
        let width = item.width;
        let height = item.height;
        let embedBytes: Uint8Array;

        if (netRotation !== 0) {
          const rendered = await renderImageToBytes(item.file, netRotation, item.file.type);
          embedBytes = rendered.bytes;
          width = rendered.width;
          height = rendered.height;
        } else {
          embedBytes = new Uint8Array(await item.file.arrayBuffer());
        }

        const image =
          item.file.type === "image/png"
            ? await pdfDoc.embedPng(embedBytes)
            : await pdfDoc.embedJpg(embedBytes);

        if (pageSizeOption === "matchImage") {
          const page = pdfDoc.addPage([width, height]);
          page.drawImage(image, {
            x: 0,
            y: 0,
            width,
            height,
          });
          continue;
        }

        const outputPageSize =
          pageSizeOption === "letter"
            ? { width: LETTER_WIDTH, height: LETTER_HEIGHT }
            : { width: A4_WIDTH, height: A4_HEIGHT };
        const availableWidth = outputPageSize.width - marginPoints * 2;
        const availableHeight = outputPageSize.height - marginPoints * 2;
        const scale = Math.min(availableWidth / width, availableHeight / height);
        const drawWidth = width * scale;
        const drawHeight = height * scale;
        const x = (outputPageSize.width - drawWidth) / 2;
        const y = (outputPageSize.height - drawHeight) / 2;
        const page = pdfDoc.addPage([outputPageSize.width, outputPageSize.height]);

        page.drawRectangle({
          x: 0,
          y: 0,
          width: outputPageSize.width,
          height: outputPageSize.height,
          color: rgb(1, 1, 1),
        });
        page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
      }

      const pdfBytes = await pdfDoc.save();
      const pdfBuffer = pdfBytes.buffer.slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([pdfBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const safeName = sanitizePdfFileName(outputName);
      setDownloadUrl(url);
      setDownloadName(safeName);
      setCleanupMessage("");
      setStatus("Download ready");
    } catch {
      setStatus("Ready");
      setError("Conversion failed. Try smaller images or remove damaged files.");
    }
  };

  const downloadPdf = () => {
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

  const readySummary = `${files.length} image${files.length === 1 ? "" : "s"} - ${pageSizeLabel}`;

  if (files.length === 0) {
    return (
      <section className="l2-tool-empty-state grid gap-4 pb-4 lg:pb-0">
        <div className="mx-auto w-full max-w-[1040px]">
          <L2UploadStage
            inputId="jpg-to-pdf-upload"
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            acceptedNote="JPG or PNG images"
            multiple
            icon={<JpgToPdfIcon />}
            privacyNote="Browser-first processing for supported live tools"
            buttonLabel="Select images"
            onFilesSelected={(selectedFiles) => {
              void addFiles(selectedFiles);
            }}
          />
        </div>

        <L2PrivacyNote />

        {error ? (
          <div className="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 p-4 text-sm font-medium text-red-100/86">
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
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <L2ToolWorkspace>
        <L2ToolMainColumn>
          <section className="min-w-0 animate-[consoleReveal_260ms_ease-out] rounded-xl border border-[#FFFFFF]/12 bg-gradient-to-br from-[#111A2B] via-[#0F1727] to-[#0C1220] p-3 shadow-2xl shadow-black/28">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#CBA052]">
                  Image tray
                </p>
                <p className="mt-0.5 text-xs text-[#FFFFFF]/48">
                  Add more images to the deck.
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
              className={`group relative overflow-hidden rounded-[24px] border px-4 py-2.5 transition-all duration-200 ${
                isDragging
                  ? "border-[var(--border-selected)] bg-[var(--surface-selected)] shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
                  : "border-[#FFFFFF]/16 bg-[#0C1220]/70 hover:border-[var(--border-selected)] hover:bg-[#0C1220]/82"
              }`}
            >
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#CBA052]/28 to-transparent opacity-0 transition group-hover:opacity-100" />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[#FFFFFF]/[0.045] text-[var(--text-secondary)] transition group-hover:bg-[#FFFFFF]/[0.08]">
                    <JpgToPdfIcon />
                  </span>
                  <div>
                    <p className="text-base font-semibold text-[#FFFFFF]">
                      Drop images here
                    </p>
                    <p className="mt-0.5 text-xs text-[#FFFFFF]/48">
                      Choose files from your device
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center justify-center rounded-full bg-[#CBA052] px-4 py-2 text-xs font-semibold text-[#F0EAD6] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#257B56] active:scale-[0.98]"
                >
                  Select images
                </button>
              </div>
            </div>
          </section>

          <section className="flex min-h-0 min-w-0 flex-1 animate-[consoleReveal_320ms_ease-out] flex-col rounded-xl border border-[#FFFFFF]/12 bg-gradient-to-br from-[#111A2B] via-[#0F1727] to-[#0C1220] p-3.5 shadow-2xl shadow-black/24">
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
                  {files.length} images - {formatFileSize(totalSize)}
                </p>
              ) : null}
            </div>

            {files.length === 0 ? (
              <div className="rounded-lg border border-[#FFFFFF]/10 bg-[#0C1220]/48 p-5 text-sm text-[#FFFFFF]/46">
                Add at least one image to begin arranging your PDF.
              </div>
            ) : (
              <div className="no-scrollbar min-h-0 space-y-2 overflow-y-auto pr-1 lg:max-h-full">
                {files.map((item, index) => (
                  <div
                    key={item.id}
                    draggable={status !== "Converting in your browser..."}
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
                    className={`flex cursor-grab items-center gap-2 rounded-lg border px-3 py-2 transition-all duration-200 active:cursor-grabbing ${
                      draggingFileId === item.id
                        ? "scale-[0.99] border-[var(--border-selected)] bg-[var(--surface-selected)] opacity-70"
                        : dragOverFileId === item.id
                          ? "border-[var(--border-selected)] bg-[var(--surface-selected)] shadow-[0_14px_38px_rgba(0,0,0,0.12)]"
                          : "border-[#FFFFFF]/10 bg-[#0A101C]/74 hover:-translate-y-0.5 hover:border-[var(--border-selected)] hover:bg-[#142034]"
                    }`}
                  >
                    <span className="hidden text-[#FFFFFF]/24 sm:inline" aria-hidden="true">
                      :::
                    </span>
                    <div className="min-w-0 flex-1">
                      <L2FileCard
                        order={index + 1}
                        icon={
                          <ImageThumbnail
                            url={thumbnailUrls[item.id] ?? ""}
                            rotation={item.userRotation}
                            name={item.file.name}
                          />
                        }
                        name={item.file.name}
                        meta={`${item.width}x${item.height} - ${formatFileSize(item.file.size)}${item.userRotation ? ` - Rotated ${item.userRotation}°` : ""}`}
                        onMoveUp={index === 0 || status === "Converting in your browser..." ? undefined : () => moveFile(index, -1)}
                        onMoveDown={index === files.length - 1 || status === "Converting in your browser..." ? undefined : () => moveFile(index, 1)}
                        onRemove={status === "Converting in your browser..." ? undefined : () => removeFile(item.id)}
                        moveUpLabel={`Move ${item.file.name} up`}
                        moveDownLabel={`Move ${item.file.name} down`}
                        removeLabel={`Remove ${item.file.name}`}
                        action={(
                          <div className="flex items-center gap-1">
                            <AuraIconButton
                              label={`Rotate ${item.file.name} left`}
                              disabled={status === "Converting in your browser..."}
                              onClick={() => rotateFile(item.id, -1)}
                              className="min-h-9 min-w-9"
                            >
                              ↺
                            </AuraIconButton>
                            <AuraIconButton
                              label={`Rotate ${item.file.name} right`}
                              disabled={status === "Converting in your browser..."}
                              onClick={() => rotateFile(item.id, 1)}
                              className="min-h-9 min-w-9"
                            >
                              ↻
                            </AuraIconButton>
                          </div>
                        )}
                      />
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
                Large images may take longer because conversion happens in your browser.
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
              <p className="lg:hidden">
                Files stay on your device. No server upload.
              </p>
            </div>
          </div>
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="JPG to PDF options" description="One combined PDF using the image order shown.">
          <div className="flex h-full min-h-0 flex-col">
            <div className="mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#CBA052]">
                Output
              </p>
              <p className="mt-0.5 text-xs text-[#FFFFFF]/48">
                Choose page size.
              </p>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[#0A101C]/74 p-3 shadow-inner shadow-black/20">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFFFFF]/34">
                    Page size
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-[#FFFFFF]">
                    {pageSizeLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-[#FFFFFF]/42">
                    {pageSizeOption === "matchImage"
                      ? "Each page matches its own image size."
                      : "Clean, same-size PDF output."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPageSizeOptions((current) => !current)}
                  aria-expanded={showPageSizeOptions}
                  className="rounded-full border border-[#FFFFFF]/14 bg-[#FFFFFF]/[0.025] px-3 py-1.5 text-xs font-semibold text-[#FFFFFF]/70 transition hover:border-[#CBA052]/32 hover:text-[#FFFFFF]"
                >
                  Change
                </button>
              </div>
            </div>

            {showPageSizeOptions ? (
              <div className="mt-2 grid gap-2 overflow-hidden rounded-lg border border-[#FFFFFF]/10 bg-[#0C1220]/74 p-2">
                {pageSizeOptions.map((option) => (
                  <AuraOptionCard
                    key={option.value}
                    label={option.label}
                    description={option.detail}
                    selected={pageSizeOption === option.value}
                    recommended={option.recommended}
                    onClick={() => updatePageSizeOption(option.value)}
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
                placeholder="lumeo-images.pdf"
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
                    PDF ready
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/46">
                    {downloadName} - {pageSizeLabel} - {files.length} image{files.length === 1 ? "" : "s"}
                  </p>
                  <div className="mt-3 hidden flex-col gap-2 lg:flex">
                    <L2ActionArea
                      primary={(
                        <button
                          type="button"
                          onClick={downloadPdf}
                          className="lumeo-primary-action rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98]"
                        >
                          Download PDF
                        </button>
                      )}
                      secondary={(
                        <button
                          type="button"
                          onClick={startNewConversion}
                          className="rounded-[var(--radius-md)] border border-[#FFFFFF]/12 px-5 py-2.5 text-sm font-semibold text-[#FFFFFF]/62 transition hover:border-[#FFFFFF]/24 hover:text-[#FFFFFF]"
                        >
                          Start new
                        </button>
                      )}
                    />
                  </div>
                </div>
              ) : files.length >= 1 ? (
                <div className="mt-3">
                  <p className="text-base font-semibold text-[#FFFFFF]">
                    Ready to convert
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/46">
                    {readySummary}
                  </p>
                  <L2ActionArea
                    primary={(
                      <button
                        type="button"
                        disabled={status === "Converting in your browser..."}
                        onClick={convertToPdf}
                        className="lumeo-primary-action mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 active:scale-[0.98]"
                      >
                        {status === "Converting in your browser..." ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#E8DFC8]/24 border-t-white" />
                            Converting in your browser...
                          </>
                        ) : (
                          "Convert to PDF"
                        )}
                      </button>
                    )}
                  />
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[#FFFFFF]/48">
                  Add an image to convert.
                </p>
              )}
            </div>
          </div>
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>
    </section>
  );
}
