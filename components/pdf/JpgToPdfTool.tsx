"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, rgb } from "pdf-lib";
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
import { AuraSegmentedControl } from "@/components/ui/Aura";
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
const DEFAULT_COMPRESS_QUALITY = 0.8;
const SOURCE_JPEG_QUALITY_ASSUMPTION = 0.92;
const PDF_OVERHEAD_BYTES = 2048;
const PDF_PAGE_OVERHEAD_BYTES = 220;

const PAGE_SIZE_KEY = "lumeo.jpgToPdf.pageSize";
const MARGIN_KEY = "lumeo.jpgToPdf.margin";
const COMPRESS_KEY = "lumeo.jpgToPdf.compress";
const COMPRESS_QUALITY_KEY = "lumeo.jpgToPdf.compressQuality";
const PNG_TO_JPEG_KEY = "lumeo.jpgToPdf.pngToJpeg";
const PNG_TO_JPEG_ESTIMATE_FACTOR = 0.5;

const pageSizeButtons: Array<{ value: PageSizeOption; label: string; dpi: string }> = [
  { value: "a4", label: "A4", dpi: "Standard" },
  { value: "letter", label: "Letter", dpi: "US Letter" },
  { value: "matchImage", label: "Match image", dpi: "Per image" },
];

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

function readStoredPageSize(): PageSizeOption {
  if (typeof window === "undefined") return "a4";
  const stored = window.localStorage.getItem(PAGE_SIZE_KEY);
  return stored === "a4" || stored === "letter" || stored === "matchImage" ? stored : "a4";
}

function readStoredMargin(): MarginPreset {
  if (typeof window === "undefined") return "clean";
  const stored = window.localStorage.getItem(MARGIN_KEY);
  return stored === "none" ? "none" : "clean";
}

function readStoredCompress(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COMPRESS_KEY) === "true";
}

function readStoredCompressQuality(): number {
  if (typeof window === "undefined") return DEFAULT_COMPRESS_QUALITY;
  const stored = Number(window.localStorage.getItem(COMPRESS_QUALITY_KEY));
  return Number.isFinite(stored) && stored >= 0.4 && stored <= 1 ? stored : DEFAULT_COMPRESS_QUALITY;
}

function readStoredPngToJpeg(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PNG_TO_JPEG_KEY) === "true";
}

// JPEGs always start with FF D8 FF, PNGs with an 8-byte signature. Checking
// this (rather than trusting the file extension or the browser-reported
// MIME type, both spoofable) catches renamed non-image files before they
// reach the canvas decode pipeline.
function hasImageMagicBytes(buffer: ArrayBuffer, mimeType: string): boolean {
  const bytes = new Uint8Array(buffer);
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= 8 && pngSignature.every((byte, index) => bytes[index] === byte);
  }
  return false;
}

function formatEstimatedSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** power;
  return `${value >= 10 || power === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[power]}`;
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
  quality = 0.92,
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
      canvas.toBlob(resolve, mimeType, quality),
    );
    if (!blob) throw new Error("Image could not be encoded.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

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

function ImageThumbnail({
  url,
  rotation,
  name,
  onPreview,
  onRotate,
  disabled,
}: {
  url: string;
  rotation: number;
  name: string;
  onPreview?: () => void;
  onRotate?: (direction: -1 | 1) => void;
  disabled?: boolean;
}) {
  if (!url) {
    return (
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#FFFFFF]/10 bg-[#FFFFFF]/[0.045]">
        <FileIcon />
      </span>
    );
  }

  return (
    <div className="group relative h-16 w-16 shrink-0">
      <button
        type="button"
        aria-label={`Preview ${name}`}
        onClick={(event) => {
          event.stopPropagation();
          onPreview?.();
        }}
        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-[#FFFFFF]/10 bg-[#FFFFFF]/[0.045] transition hover:border-[var(--border-selected)] focus:outline-none focus:ring-2 focus:ring-[#CBA052]/45"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`${name} preview`}
          className="h-full w-full object-cover transition-transform duration-200"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
        <span className="pointer-events-none absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full border border-[#FFFFFF]/25 bg-[#0C1220]/85 text-[9px] text-[#FFFFFF]/80">
          ⤢
        </span>
      </button>

      {onRotate && !disabled ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between p-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            aria-label={`Rotate ${name} left`}
            onClick={(event) => {
              event.stopPropagation();
              onRotate(-1);
            }}
            className="pointer-events-auto grid h-5 w-5 place-items-center rounded-full border border-[#FFFFFF]/25 bg-[#0C1220]/92 text-[10px] text-[#FFFFFF] transition hover:border-[#CBA052]/60"
          >
            ↺
          </button>
          <button
            type="button"
            aria-label={`Rotate ${name} right`}
            onClick={(event) => {
              event.stopPropagation();
              onRotate(1);
            }}
            className="pointer-events-auto grid h-5 w-5 place-items-center rounded-full border border-[#FFFFFF]/25 bg-[#0C1220]/92 text-[10px] text-[#FFFFFF] transition hover:border-[#CBA052]/60"
          >
            ↻
          </button>
        </div>
      ) : null}
    </div>
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
  const [pageSizeOption, setPageSizeOption] = useState<PageSizeOption>(readStoredPageSize);
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
  const [marginPreset, setMarginPreset] = useState<MarginPreset>(readStoredMargin);
  const [compressImages, setCompressImages] = useState(readStoredCompress);
  const [compressQuality, setCompressQuality] = useState(readStoredCompressQuality);
  const [convertPngToJpeg, setConvertPngToJpeg] = useState(readStoredPngToJpeg);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const thumbnailUrlsRef = useRef<Record<string, string>>({});

  const totalSize = useMemo(
    () => files.reduce((sum, item) => sum + item.file.size, 0),
    [files],
  );

  const pageSizeLabel = getPageSizeLabel(pageSizeOption);
  const hasLargeFiles = totalSize >= LARGE_FILE_WARNING_BYTES;
  const showMarginOptions = pageSizeOption !== "matchImage";
  const hasPngFiles = files.some((item) => item.file.type === "image/png");
  const previewFile = files.find((item) => item.id === previewFileId) ?? null;

  const estimatedPdfSize = useMemo(() => {
    if (!files.length) return 0;
    const imageBytes = files.reduce((sum, item) => {
      if (compressImages && item.file.type === "image/jpeg") {
        return sum + item.file.size * (compressQuality / SOURCE_JPEG_QUALITY_ASSUMPTION);
      }
      if (compressImages && convertPngToJpeg && item.file.type === "image/png") {
        return sum + item.file.size * compressQuality * PNG_TO_JPEG_ESTIMATE_FACTOR;
      }
      return sum + item.file.size;
    }, 0);
    return imageBytes + PDF_OVERHEAD_BYTES + files.length * PDF_PAGE_OVERHEAD_BYTES;
  }, [files, compressImages, compressQuality, convertPngToJpeg]);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  useEffect(() => {
    window.localStorage.setItem(PAGE_SIZE_KEY, pageSizeOption);
  }, [pageSizeOption]);

  useEffect(() => {
    window.localStorage.setItem(MARGIN_KEY, marginPreset);
  }, [marginPreset]);

  useEffect(() => {
    window.localStorage.setItem(COMPRESS_KEY, String(compressImages));
  }, [compressImages]);

  useEffect(() => {
    window.localStorage.setItem(COMPRESS_QUALITY_KEY, String(compressQuality));
  }, [compressQuality]);

  useEffect(() => {
    window.localStorage.setItem(PNG_TO_JPEG_KEY, String(convertPngToJpeg));
  }, [convertPngToJpeg]);

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
    setPreviewFileId(null);
  };

  const clearAllFiles = () => {
    clearDownload();
    setFiles([]);
    setError("");
    setSoftWarning("");
    setStatus("Ready");
    setCleanupMessage("");
    setPreviewFileId(null);
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

    let invalidSignatureCount = 0;

    for (const file of nextFiles) {
      const duplicateKey = `${file.name}-${file.size}`;
      if (existingKeys.has(duplicateKey) || incomingKeys.has(duplicateKey)) {
        duplicateDetected = true;
      }
      incomingKeys.add(duplicateKey);

      try {
        const headerBytes = await file.slice(0, 16).arrayBuffer();
        if (!hasImageMagicBytes(headerBytes, file.type)) {
          invalidSignatureCount += 1;
          continue;
        }

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

    if (invalidSignatureCount > 0) {
      setError(
        invalidSignatureCount === nextFiles.length
          ? "These files don't look like valid JPG or PNG images."
          : "Some files don't look like valid JPG or PNG images and were skipped.",
      );
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
    setPreviewFileId((current) => (current === id ? null : current));
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
        const shouldCompressJpeg = compressImages && item.file.type === "image/jpeg";
        const shouldConvertPng = compressImages && convertPngToJpeg && item.file.type === "image/png";
        const targetMimeType = shouldConvertPng ? "image/jpeg" : item.file.type;
        let width = item.width;
        let height = item.height;
        let embedBytes: Uint8Array;

        if (netRotation !== 0 || shouldCompressJpeg || shouldConvertPng) {
          const rendered = await renderImageToBytes(
            item.file,
            netRotation,
            targetMimeType,
            shouldCompressJpeg || shouldConvertPng ? compressQuality : 0.92,
          );
          embedBytes = rendered.bytes;
          width = rendered.width;
          height = rendered.height;
        } else {
          embedBytes = new Uint8Array(await item.file.arrayBuffer());
        }

        const image =
          targetMimeType === "image/png"
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
            title="Drop images here"
            description="or choose files from your device"
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
                  {files.length} image{files.length === 1 ? "" : "s"} - {formatFileSize(totalSize)}
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
                            onPreview={() => setPreviewFileId(item.id)}
                            onRotate={(direction) => rotateFile(item.id, direction)}
                            disabled={status === "Converting in your browser..."}
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
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[#0A101C]/74 p-2.5 shadow-inner shadow-black/20">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFFFFF]/34">Output</p>

                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {pageSizeButtons.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={pageSizeOption === option.value}
                      onClick={() => updatePageSizeOption(option.value)}
                      className={`rounded-lg border px-2 py-1.5 text-center transition ${
                        pageSizeOption === option.value
                          ? "border-[var(--border-selected)] bg-[var(--surface-selected)]"
                          : "border-[#FFFFFF]/10 bg-[#FFFFFF]/[0.03] hover:border-[var(--border-selected)]"
                      }`}
                    >
                      <span className="block text-xs font-bold text-[#FFFFFF]">{option.label}</span>
                      <span className="block text-[10px] text-[#FFFFFF]/44">{option.dpi}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-[#FFFFFF]/40">
                  {pageSizeOption === "matchImage"
                    ? "Each page matches its own image size."
                    : "Clean, same-size PDF output."}
                  {estimatedPdfSize ? ` · Estimated ~${formatEstimatedSize(estimatedPdfSize)}` : ""}
                </p>

                {showMarginOptions ? (
                  <div className="mt-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFFFFF]/34">
                      Margin
                    </span>
                    <div className="mt-1.5">
                      <AuraSegmentedControl
                        label="Margin"
                        options={marginOptions.map((option) => ({ value: option.value, label: option.label }))}
                        value={marginPreset}
                        onChange={(value) => updateMarginPreset(value as MarginPreset)}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFFFFF]/34">
                      Compress images
                    </span>
                    <p className="mt-0.5 text-[11px] text-[#FFFFFF]/40">
                      Recompresses JPG images to shrink the PDF.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={compressImages}
                    aria-label="Compress images"
                    onClick={() => {
                      setCompressImages((current) => !current);
                      resetReadyState();
                    }}
                    className="relative inline-flex shrink-0 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A101C] focus-visible:ring-[#CBA052]/60"
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        backgroundColor: compressImages ? "#4D6A59" : "rgba(255, 255, 255, 0.1)",
                        borderColor: compressImages ? "transparent" : "rgba(255, 255, 255, 0.2)",
                      }}
                      className="inline-flex h-5 w-9 items-center rounded-full border transition-colors duration-200"
                    >
                      <span
                        style={{ transform: compressImages ? "translateX(18px)" : "translateX(2px)" }}
                        className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200"
                      />
                    </span>
                  </button>
                </div>

                {compressImages ? (
                  <>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFFFFF]/34">
                        Quality
                      </span>
                      <span className="text-xs font-bold text-[#FFFFFF]">{Math.round(compressQuality * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.4}
                      max={1}
                      step={0.05}
                      value={compressQuality}
                      onChange={(event) => {
                        setCompressQuality(Number(event.target.value));
                        resetReadyState();
                      }}
                      className="mt-1 w-full accent-[#CBA052]"
                      aria-label="JPG compression quality"
                      aria-valuetext={`${Math.round(compressQuality * 100)}%`}
                    />

                    {hasPngFiles ? (
                      <label className="mt-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={convertPngToJpeg}
                          onChange={(event) => {
                            setConvertPngToJpeg(event.target.checked);
                            resetReadyState();
                          }}
                          className="h-3.5 w-3.5 accent-[#CBA052]"
                        />
                        <span className="text-[11px] text-[#FFFFFF]/56">
                          Also convert PNGs to JPEG (smaller, no longer lossless)
                        </span>
                      </label>
                    ) : null}
                  </>
                ) : null}

                <label className="mt-2.5 block">
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
                    className="mt-1 w-full rounded-md border border-[#FFFFFF]/12 bg-[#0C1220]/70 px-2.5 py-1.5 text-sm font-semibold text-[#FFFFFF] outline-none transition placeholder:text-[#FFFFFF]/26 focus:border-[#CBA052]/45"
                    placeholder="lumeo-images.pdf"
                  />
                </label>
              </div>
            </div>

            <div className="mt-2 border-t border-[#FFFFFF]/10 pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#CBA052]">
                Finish
              </p>

              {downloadUrl ? (
                <div className="mt-2">
                  <p className="text-base font-semibold text-[#FFFFFF]">
                    PDF ready
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/46">
                    {downloadName} - {pageSizeLabel} - {files.length} image{files.length === 1 ? "" : "s"}
                  </p>
                  <div className="mt-2 hidden flex-col gap-2 lg:flex">
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
                <div className="mt-2">
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
                        className="lumeo-primary-action mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 active:scale-[0.98]"
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
                <p className="mt-2 text-sm leading-6 text-[#FFFFFF]/48">
                  Add an image to convert.
                </p>
              )}
            </div>
          </div>
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>

      {previewFile ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${previewFile.file.name} preview`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setPreviewFileId(null)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setPreviewFileId(null);
          }}
        >
          <div
            className="relative flex max-h-full max-w-full flex-col items-center gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="inline-flex max-h-[80dvh] max-w-[90vw] items-center justify-center overflow-hidden rounded-lg border border-[#FFFFFF]/14 bg-[#0A101C]">
              {thumbnailUrls[previewFile.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnailUrls[previewFile.id]}
                  alt={`${previewFile.file.name} full preview`}
                  className="max-h-[80dvh] max-w-[90vw] object-contain transition-transform duration-200"
                  style={{ transform: `rotate(${previewFile.userRotation}deg)` }}
                />
              ) : (
                <div className="flex h-64 w-48 items-center justify-center text-xs font-semibold text-[#F0C0C0]">
                  Preview unavailable.
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Rotate ${previewFile.file.name} left`}
                onClick={() => rotateFile(previewFile.id, -1)}
                className="grid h-9 w-9 place-items-center rounded-full border border-[#FFFFFF]/20 bg-[#0C1220]/90 text-sm text-[#FFFFFF] transition hover:border-[#CBA052]/60"
              >
                ↺
              </button>
              <button
                type="button"
                onClick={() => setPreviewFileId(null)}
                className="rounded-full border border-[#FFFFFF]/20 bg-[#0C1220]/90 px-4 py-2 text-xs font-semibold text-[#FFFFFF] transition hover:border-[#CBA052]/60"
              >
                Close
              </button>
              <button
                type="button"
                aria-label={`Rotate ${previewFile.file.name} right`}
                onClick={() => rotateFile(previewFile.id, 1)}
                className="grid h-9 w-9 place-items-center rounded-full border border-[#FFFFFF]/20 bg-[#0C1220]/90 text-sm text-[#FFFFFF] transition hover:border-[#CBA052]/60"
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
