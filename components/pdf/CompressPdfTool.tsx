"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, rgb } from "pdf-lib";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  compressionProfiles as profiles,
  type ColourMode,
  type CompressProfile,
  type ImageQuality,
  type MetadataMode,
} from "@/lib/compressionProfiles";
import {
  MAX_TARGET_PASSES,
  chooseBetterTargetCandidate,
  chooseTargetOutcome,
  createTargetCompressionRequest,
  initialTargetParameters,
  nextTargetStrength,
  parametersForStrength,
  qualityOutlookForTarget,
  requiredReductionPercent,
  targetValueToBytes,
  validateTargetBytes,
  type CompressionMode,
  type TargetCompressionAttempt,
  type TargetOutcome,
  type TargetQualityOutlook,
  type TargetUnit,
} from "@/lib/compressionTarget";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import { shouldAttemptOnce } from "@/lib/analytics/state";

type ResolutionPreset = "dpi220" | "dpi150" | "dpi96";
type ExpertMode = "profile" | "custom";
type TargetPreset = "100" | "200" | "400" | "custom";
type CompressStage =
  | "Ready"
  | "Analysing document"
  | "Preparing compression plan"
  | "Processing images"
  | "Rebuilding document"
  | "Validating output"
  | "Finalising download"
  | "Download ready";
type Opportunity = "Low" | "Moderate" | "High";
type ResultTone = "success" | "limited" | "larger";

type PageInfo = {
  page: number;
  width: number;
  height: number;
  orientation: "Portrait" | "Landscape";
  label: "A4" | "Letter" | "Custom";
};

type DocumentRisk = {
  title: string;
  description: string;
};

type CompressAnalysis = {
  name: string;
  size: number;
  pageCount: number;
  bytes: ArrayBuffer;
  pageSizeType: "A4" | "Letter" | "Custom" | "Mixed";
  pages: PageInfo[];
  averageBytesPerPage: number;
  estimatedImageHeavyRatio: number;
  opportunity: Opportunity;
  recommendation: CompressProfile;
  risks: DocumentRisk[];
  samplePage: number;
};

type CompressResult = {
  url: string;
  fileName: string;
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  savedPercent: number;
  pageCount: number;
  mode: CompressionMode;
  profile?: CompressProfile;
  grayscale: boolean;
  tone: ResultTone;
  target?: {
    outcome: TargetOutcome;
    requestedBytes: number;
    attempts: TargetCompressionAttempt[];
    qualityOutlook: TargetQualityOutlook;
  };
};

type PdfJsModule = typeof import("pdfjs-dist");

const LARGE_FILE_WARNING_BYTES = 80 * 1024 * 1024;
const MAX_RENDER_SCALE = 2.35;
const MIN_RENDER_SCALE = 0.75;

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

async function loadPdfJsModule() {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import("pdfjs-dist").then((module) => {
      if (!module.GlobalWorkerOptions.workerSrc) {
        module.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();
      }
      return module;
    });
  }

  return pdfJsModulePromise;
}

const resolutionOptions: Array<{ value: ResolutionPreset; label: string; dpi: number; helper: string }> = [
  { value: "dpi220", label: "Print quality", dpi: 220, helper: "Sharper output for detailed review." },
  { value: "dpi150", label: "Profile default", dpi: 150, helper: "Suitable for most office documents." },
  { value: "dpi96", label: "Compact", dpi: 96, helper: "Best for smaller files where high-resolution printing is not required." },
];

const qualityOptions: Array<{ value: ImageQuality; label: string; quality: number }> = [
  { value: "high", label: "Higher clarity", quality: 0.86 },
  { value: "balanced", label: "Profile default", quality: 0.74 },
  { value: "compact", label: "Smaller output", quality: 0.58 },
];

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** power;
  return `${value >= 10 || power === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[power]}`;
}

function sanitizePdfFileName(value: string, fallback = "lumeo-compressed.pdf") {
  const cleanName = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
  const safeName = cleanName || fallback;
  return safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
}

function sourceOutputName(name: string) {
  return sanitizePdfFileName(
    `${name.replace(/\.[^/.]+$/, "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")}-compressed.pdf`,
  );
}

function copyArrayBuffer(buffer: ArrayBuffer) {
  const source = new Uint8Array(buffer);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy.buffer;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function classifyPageSize(width: number, height: number): PageInfo["label"] {
  const portraitWidth = Math.min(width, height);
  const portraitHeight = Math.max(width, height);
  const close = (a: number, b: number) => Math.abs(a - b) <= 12;
  if (close(portraitWidth, 595.28) && close(portraitHeight, 841.89)) return "A4";
  if (close(portraitWidth, 612) && close(portraitHeight, 792)) return "Letter";
  return "Custom";
}

function pageSizeTypeFromPages(pages: PageInfo[]) {
  const sizes = new Set(pages.map((page) => `${Math.round(page.width)}x${Math.round(page.height)}`));
  const labels = new Set(pages.map((page) => page.label));
  if (sizes.size > 1) return "Mixed";
  return labels.values().next().value ?? "Custom";
}

function detectRisks(pdfText: string, pageCount: number, size: number): DocumentRisk[] {
  const risks: DocumentRisk[] = [];
  const has = (pattern: RegExp) => pattern.test(pdfText);

  if (has(/\/Sig\b|\/ByteRange\b/i)) {
    risks.push({
      title: "Digital signature detected",
      description: "Rewriting this PDF may invalidate existing signatures.",
    });
  }
  if (has(/\/AcroForm\b|\/XFA\b/i)) {
    risks.push({
      title: "Interactive form detected",
      description: "Compression may affect unsupported form features. Review the result before replacing the original.",
    });
  }
  if (has(/\/EmbeddedFiles\b|\/Filespec\b/i)) {
    risks.push({
      title: "Embedded attachments detected",
      description: "Attachments may not be preserved by this browser-first compression pass.",
    });
  }
  if (has(/PDF\/A|\/GTS_PDFA|pdfaid:/i)) {
    risks.push({
      title: "PDF/A marker detected",
      description: "Compression may affect archival conformance. Keep the original if PDF/A status matters.",
    });
  }
  if (has(/\/Encrypt\b/i)) {
    risks.push({
      title: "Encryption marker detected",
      description: "Password-protected or encrypted PDFs may not be supported.",
    });
  }
  if (pageCount > 100 || size > LARGE_FILE_WARNING_BYTES) {
    risks.push({
      title: "Large document",
      description: "Compression will use significant browser memory. Close unnecessary tabs and keep this page open until processing finishes.",
    });
  }

  return risks;
}

function estimateImageHeavyRatio(pdfText: string, pageCount: number, averageBytesPerPage: number) {
  const imageRefs = (pdfText.match(/\/Subtype\s*\/Image\b/g) ?? []).length;
  const imageSignal = Math.min(1, imageRefs / Math.max(1, pageCount));
  const sizeSignal = averageBytesPerPage > 900_000 ? 1 : averageBytesPerPage > 350_000 ? 0.55 : 0.18;
  return Math.max(imageSignal, sizeSignal);
}

function getOpportunity(ratio: number, averageBytesPerPage: number, size: number): Opportunity {
  if (ratio >= 0.7 || averageBytesPerPage > 900_000 || size > 35 * 1024 * 1024) return "High";
  if (ratio >= 0.35 || averageBytesPerPage > 250_000 || size > 8 * 1024 * 1024) return "Moderate";
  return "Low";
}

function recommendProfile(opportunity: Opportunity): CompressProfile {
  if (opportunity === "Low") return "highQuality";
  if (opportunity === "High") return "balanced";
  return "balanced";
}

function profileExplanation(opportunity: Opportunity) {
  if (opportunity === "High") {
    return "This document appears image-heavy and should compress meaningfully without requiring the strongest setting first.";
  }
  if (opportunity === "Moderate") {
    return "This PDF has enough size per page to make Balanced a sensible first pass.";
  }
  return "This PDF already appears relatively compact. High quality is safer before trying stronger compression.";
}

function applyGrayscale(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
  }
  context.putImageData(image, 0, 0);
}

function downloadUrl(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function CompressIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <path d="M8 5.5h10.5L23 10v16.5H8v-21Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M18.3 6v4.2h4.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M13 14.5h6M13 18h4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="m5.5 15.2 3 3 3-3M26.5 15.2l-3 3-3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#CBA052]/22 bg-[#CBA052]/10 text-[#CBA052]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path d="M6.5 3.8h7.8l3.2 3.2v13.2h-11V3.8Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M14.1 4v3.3h3.2M9 12h6M9 15h4.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.55" />
      </svg>
    </span>
  );
}

export default function CompressPdfTool() {
  const { availability, track } = useAnalytics();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openedTrackedRef = useRef(false);
  const pdfJsDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const sessionRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const resultHeadingRef = useRef<HTMLParagraphElement | null>(null);
  const customTargetInputRef = useRef<HTMLInputElement | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const [analysis, setAnalysis] = useState<CompressAnalysis | null>(null);
  const [compressionMode, setCompressionMode] =
    useState<CompressionMode>("quality");
  const [profile, setProfile] = useState<CompressProfile>("balanced");
  const [targetPreset, setTargetPreset] = useState<TargetPreset>("400");
  const [customTargetValue, setCustomTargetValue] = useState("400");
  const [targetUnit, setTargetUnit] = useState<TargetUnit>("KB");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [expertOpen, setExpertOpen] = useState(false);
  const [expertMode, setExpertMode] = useState<ExpertMode>("profile");
  const [resolution, setResolution] = useState<ResolutionPreset>("dpi150");
  const [quality, setQuality] = useState<ImageQuality>("balanced");
  const [colour, setColour] = useState<ColourMode>("preserve");
  const [metadata, setMetadata] = useState<MetadataMode>("preserve");
  const [customDpi, setCustomDpi] = useState(150);
  const [customQuality, setCustomQuality] = useState(74);
  const [outputName, setOutputName] = useState("lumeo-compressed.pdf");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<CompressStage>("Ready");
  const [progressDetail, setProgressDetail] = useState("");
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [previewIssue, setPreviewIssue] = useState("");
  const [blockingError, setBlockingError] = useState("");
  const [isCompressing, setIsCompressing] = useState(false);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  const selectedPlan = useMemo(() => {
    if (expertMode === "custom") {
      return {
        dpi: Math.max(72, Math.min(240, Math.round(customDpi))),
        quality: Math.max(0.35, Math.min(0.92, customQuality / 100)),
        qualityLabel: "balanced" as ImageQuality,
        colour,
        metadata,
      };
    }

    const base = profiles[profile];
    const resolutionDpi = resolutionOptions.find((item) => item.value === resolution)?.dpi ?? base.dpi;
    const qualityValue = qualityOptions.find((item) => item.value === quality)?.quality ?? base.quality;
    return {
      dpi: resolutionDpi,
      quality: qualityValue,
      qualityLabel: quality,
      colour,
      metadata,
    };
  }, [colour, customDpi, customQuality, expertMode, metadata, profile, quality, resolution]);

  const opportunityCopy = useMemo(() => {
    if (!analysis) return "";
    if (analysis.opportunity === "High") {
      return "This document contains image-heavy signals that may respond well to compression.";
    }
    if (analysis.opportunity === "Moderate") {
      return "This document has a moderate size profile. Balanced compression is a good first pass.";
    }
    return "This PDF already appears relatively compact. Stronger compression may reduce clarity with limited savings.";
  }, [analysis]);

  const profileLabel = profiles[profile].label;
  const outputFileName = sanitizePdfFileName(outputName);
  const displayStatus = blockingError ? "Needs attention" : error ? "Retry available" : status;
  const targetBytes = useMemo(() => {
    const numericValue =
      targetPreset === "custom"
        ? customTargetValue.trim()
          ? Number(customTargetValue)
          : Number.NaN
        : Number(targetPreset);
    return targetValueToBytes(
      numericValue,
      targetPreset === "custom" ? targetUnit : "KB",
    );
  }, [customTargetValue, targetPreset, targetUnit]);
  const targetError = useMemo(
    () =>
      compressionMode === "target" && analysis
        ? validateTargetBytes(targetBytes, analysis.size)
        : "",
    [analysis, compressionMode, targetBytes],
  );
  const targetOutlook = useMemo(
    () =>
      analysis
        ? qualityOutlookForTarget(analysis.size, targetBytes, analysis.pageCount)
        : "Good",
    [analysis, targetBytes],
  );
  const canCompress =
    Boolean(analysis) &&
    !isCompressing &&
    !blockingError &&
    (compressionMode === "quality" || !targetError);

  const clearPreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
  }, [previewUrl]);

  const clearResult = useCallback(
    (message = "") => {
      if (result?.url) URL.revokeObjectURL(result.url);
      setResult(null);
      setCleanupMessage(message);
    },
    [result],
  );

  const cleanupTasks = useCallback(async () => {
    try {
      renderTaskRef.current?.cancel();
    } catch {
      // Best-effort render cancellation.
    }
    renderTaskRef.current = null;
    const doc = pdfJsDocRef.current;
    pdfJsDocRef.current = null;
    if (doc) {
      try {
        await (doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
      } catch {
        // PDF.js may already be cleaning itself up.
      }
    }
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      if (result?.url) URL.revokeObjectURL(result.url);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      void cleanupTasks();
    };
  }, [cleanupTasks, previewUrl, result?.url]);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const result = track({ eventName: "tool_opened", toolSlug: "compress" });
    if (result.accepted) {
      openedTrackedRef.current = true;
    }
  }, [availability, track]);

  useEffect(() => {
    if (result) {
      resultHeadingRef.current?.focus();
    }
  }, [result]);

  function resetSettings(
    nextProfile: CompressProfile,
    preserveColour = false,
  ) {
    const base = profiles[nextProfile];
    setProfile(nextProfile);
    setResolution(base.dpi >= 180 ? "dpi220" : base.dpi <= 100 ? "dpi96" : "dpi150");
    setQuality(base.qualityLabel);
    if (!preserveColour) setColour(base.colour);
    setMetadata(base.metadata);
    setExpertMode("profile");
    setCustomDpi(base.dpi);
    setCustomQuality(Math.round(base.quality * 100));
  }

  function resetTool() {
    sessionRef.current += 1;
    clearResult();
    clearPreview();
    void cleanupTasks();
    setAnalysis(null);
    setCompressionMode("quality");
    setTargetPreset("400");
    setCustomTargetValue("400");
    setTargetUnit("KB");
    resetSettings("balanced");
    setOutputName("lumeo-compressed.pdf");
    setError("");
    setPreviewIssue("");
    setBlockingError("");
    setStatus("Ready");
    setProgressDetail("");
    setAdvancedOpen(false);
    setExpertOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function renderPreview(doc: PDFDocumentProxy, pageNumber: number, currentSession: number) {
    try {
      setPreviewIssue("");
      const page = await doc.getPage(pageNumber);
      if (currentSession !== sessionRef.current) return;
      const viewport = page.getViewport({ scale: 0.35 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      context.fillStyle = "#F8F3E4";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const task = page.render({ canvas, canvasContext: context, viewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
      if (currentSession !== sessionRef.current) return;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
      canvas.width = 0;
      canvas.height = 0;
      if (!blob || currentSession !== sessionRef.current) return;
      const url = URL.createObjectURL(blob);
      clearPreview();
      setPreviewUrl(url);
    } catch {
      setPreviewIssue("Preview could not be rendered. Compression can still be attempted.");
    }
  }

  async function readPdfFile(file: File) {
    const nextSession = sessionRef.current + 1;
    sessionRef.current = nextSession;
    setError("");
    setPreviewIssue("");
    setBlockingError("");
    setCleanupMessage("");
    setProgressDetail("");
    setStatus("Analysing document");
    clearResult();
    clearPreview();
    await cleanupTasks();

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setStatus("Ready");
      setError("Please add one PDF file.");
      return;
    }

    try {
      const bytes = await file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(copyArrayBuffer(bytes));
      const pages = sourcePdf.getPages().map((page, index) => {
        const { width, height } = page.getSize();
        return {
          page: index + 1,
          width,
          height,
          orientation: width > height ? "Landscape" : "Portrait",
          label: classifyPageSize(width, height),
        } satisfies PageInfo;
      });

      const pdfText = new TextDecoder("latin1").decode(new Uint8Array(bytes).slice(0, Math.min(bytes.byteLength, 2_500_000)));
      const averageBytesPerPage = file.size / Math.max(1, sourcePdf.getPageCount());
      const estimatedImageHeavyRatio = estimateImageHeavyRatio(pdfText, sourcePdf.getPageCount(), averageBytesPerPage);
      const opportunity = getOpportunity(estimatedImageHeavyRatio, averageBytesPerPage, file.size);
      const recommendation = recommendProfile(opportunity);
      const samplePage = Math.max(1, Math.ceil(sourcePdf.getPageCount() / 2));

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

      const nextAnalysis: CompressAnalysis = {
        name: file.name,
        size: file.size,
        pageCount: sourcePdf.getPageCount(),
        bytes,
        pageSizeType: pageSizeTypeFromPages(pages),
        pages,
        averageBytesPerPage,
        estimatedImageHeavyRatio,
        opportunity,
        recommendation,
        risks: detectRisks(pdfText, sourcePdf.getPageCount(), file.size),
        samplePage,
      };

      setAnalysis(nextAnalysis);
      resetSettings(recommendation);
      setOutputName(sourceOutputName(file.name));
      setStatus("Ready");
      setProgressDetail("Document profile ready.");
      void renderPreview(pdfJsDoc, samplePage, nextSession);
    } catch (readError) {
      const message =
        readError instanceof Error && /password|encrypt/i.test(readError.message)
          ? "This file appears to be password-protected or encrypted."
          : "This file could not be read. It may be damaged or password-protected.";
      setStatus("Ready");
      setError(message);
      setBlockingError(message);
      setAnalysis(null);
    }
  }

  function handleFiles(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;
    void readPdfFile(file);
  }

  async function copyMetadata(source: PDFDocument, output: PDFDocument) {
    try {
      output.setTitle(source.getTitle() || "Compressed PDF");
      const author = source.getAuthor();
      if (author) output.setAuthor(author);
      const subject = source.getSubject();
      if (subject) output.setSubject(subject);
      const keywords = source.getKeywords();
      if (keywords) {
        output.setKeywords(
          keywords
            .split(",")
            .map((keyword) => keyword.trim())
            .filter(Boolean),
        );
      }
    } catch {
      output.setTitle("Compressed PDF");
    }
  }

  async function buildCompressedCandidate({
    processingDoc,
    sourcePdf,
    dpi,
    imageQuality,
    colourMode,
    metadataMode,
    currentSession,
    passLabel,
  }: {
    processingDoc: PDFDocumentProxy;
    sourcePdf: PDFDocument;
    dpi: number;
    imageQuality: number;
    colourMode: ColourMode;
    metadataMode: MetadataMode;
    currentSession: number;
    passLabel: string;
  }) {
    if (!analysis) throw new Error("Document analysis is unavailable.");
    const output = await PDFDocument.create();
    if (metadataMode === "preserve") {
      await copyMetadata(sourcePdf, output);
    } else {
      output.setTitle("Compressed PDF");
      output.setCreator("Lumeo PDF Workspace");
    }

    for (let pageIndex = 1; pageIndex <= analysis.pageCount; pageIndex += 1) {
      if (currentSession !== sessionRef.current) {
        throw new DOMException("Compression cancelled.", "AbortError");
      }

      setStatus("Processing images");
      setProgressDetail(
        `${passLabel} · page ${pageIndex} of ${analysis.pageCount}`,
      );
      const page = await processingDoc.getPage(pageIndex);
      const pageInfo = analysis.pages[pageIndex - 1];
      const baseViewport = page.getViewport({ scale: 1 });
      const requestedScale = Math.max(
        MIN_RENDER_SCALE,
        Math.min(MAX_RENDER_SCALE, dpi / 72),
      );
      const dimensionScale = Math.min(
        requestedScale,
        5200 / Math.max(baseViewport.width, baseViewport.height),
      );
      const viewport = page.getViewport({ scale: Math.max(0.25, dimensionScale) });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new Error("Browser memory limitation while preparing this page.");
      }
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const task = page.render({ canvas, canvasContext: context, viewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
      if (colourMode === "grayscale") applyGrayscale(canvas);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", imageQuality),
      );
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      if (!blob) throw new Error("Compression failed while rebuilding a page.");
      const imageBytes = await blob.arrayBuffer();
      const image = await output.embedJpg(imageBytes);
      const outputPage = output.addPage([pageInfo.width, pageInfo.height]);
      outputPage.drawRectangle({
        x: 0,
        y: 0,
        width: pageInfo.width,
        height: pageInfo.height,
        color: rgb(1, 1, 1),
      });
      outputPage.drawImage(image, {
        x: 0,
        y: 0,
        width: pageInfo.width,
        height: pageInfo.height,
      });

      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    setStatus("Rebuilding document");
    setProgressDetail(`${passLabel} · rebuilding document`);
    return output.save({ useObjectStreams: true });
  }

  async function handleCompress() {
    if (!analysis || isCompressing || blockingError) return;
    if (compressionMode === "target" && targetError) {
      setError(targetError);
      return;
    }
    setIsCompressing(true);
    setError("");
    setBlockingError("");
    setCleanupMessage("");
    clearResult();
    setStatus("Preparing compression plan");
    setProgressDetail("Preparing compression plan.");

    const currentSession = sessionRef.current;
    let processingDoc: PDFDocumentProxy | null = null;
    try {
      const pdfJs = await loadPdfJsModule();
      const loadingTask = pdfJs.getDocument({
        data: new Uint8Array(copyArrayBuffer(analysis.bytes)),
        useWorkerFetch: false,
      });
      processingDoc = await loadingTask.promise;
      if (currentSession !== sessionRef.current) return;

      const sourcePdf = await PDFDocument.load(copyArrayBuffer(analysis.bytes));
      let outputBytes: Uint8Array;
      let targetResult: CompressResult["target"];

      if (compressionMode === "target") {
        const request = createTargetCompressionRequest(
          targetBytes,
          colour === "grayscale",
        );
        const attempts: TargetCompressionAttempt[] = [];
        const outlook = qualityOutlookForTarget(
          analysis.size,
          request.targetBytes,
          analysis.pageCount,
        );
        let parameters = initialTargetParameters(
          analysis.size,
          request.targetBytes,
          analysis.pageCount,
        );
        let largestTooLargeStrength: number | null = null;
        let smallestSuccessfulStrength: number | null = null;
        let bestCandidate: Uint8Array | null = null;
        let bestCandidateBytes: number | null = null;
        let bestUnderTargetBytes: number | null = null;
        let smallestCandidateBytes = Number.POSITIVE_INFINITY;

        for (let pass = 1; pass <= MAX_TARGET_PASSES; pass += 1) {
          setProgressDetail(`Building pass ${pass} of ${MAX_TARGET_PASSES}`);
          const candidate = await buildCompressedCandidate({
            processingDoc,
            sourcePdf,
            dpi: parameters.dpi,
            imageQuality: parameters.imageQuality,
            colourMode: request.grayscale ? "grayscale" : "preserve",
            metadataMode: "preserve",
            currentSession,
            passLabel: `Building pass ${pass} of ${MAX_TARGET_PASSES}`,
          });
          const candidateBytes = candidate.byteLength;
          attempts.push({
            pass,
            dpi: parameters.dpi,
            imageQuality: parameters.imageQuality,
            outputBytes: candidateBytes,
          });
          smallestCandidateBytes = Math.min(
            smallestCandidateBytes,
            candidateBytes,
          );
          if (candidateBytes <= request.targetBytes) {
            bestUnderTargetBytes =
              bestUnderTargetBytes === null
                ? candidateBytes
                : Math.max(bestUnderTargetBytes, candidateBytes);
            smallestSuccessfulStrength =
              smallestSuccessfulStrength === null
                ? parameters.strength
                : Math.min(smallestSuccessfulStrength, parameters.strength);
          } else {
            largestTooLargeStrength =
              largestTooLargeStrength === null
                ? parameters.strength
                : Math.max(largestTooLargeStrength, parameters.strength);
          }

          if (
            chooseBetterTargetCandidate({
              currentBytes: bestCandidateBytes,
              candidateBytes,
              targetBytes: request.targetBytes,
            })
          ) {
            bestCandidate = candidate;
            bestCandidateBytes = candidateBytes;
          }

          const closeEnough =
            candidateBytes <= request.targetBytes &&
            request.targetBytes - candidateBytes <= request.targetBytes * 0.04;
          if (closeEnough || (parameters.strength >= 0.995 && candidateBytes > request.targetBytes)) {
            break;
          }

          setProgressDetail("Refining target");
          const nextStrength = nextTargetStrength({
            currentStrength: parameters.strength,
            outputBytes: candidateBytes,
            targetBytes: request.targetBytes,
            largestTooLargeStrength,
            smallestSuccessfulStrength,
          });
          if (Math.abs(nextStrength - parameters.strength) < 0.01) break;
          parameters = parametersForStrength(nextStrength);
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }

        if (!bestCandidate || bestCandidateBytes === null) {
          throw new Error("No compression candidate could be generated.");
        }
        outputBytes = bestCandidate;
        targetResult = {
          outcome: chooseTargetOutcome({
            targetBytes: request.targetBytes,
            originalBytes: analysis.size,
            bestUnderTargetBytes,
            smallestCandidateBytes,
          }),
          requestedBytes: request.targetBytes,
          attempts,
          qualityOutlook: outlook,
        };
      } else {
        outputBytes = await buildCompressedCandidate({
          processingDoc,
          sourcePdf,
          dpi: selectedPlan.dpi,
          imageQuality: selectedPlan.quality,
          colourMode: selectedPlan.colour,
          metadataMode: selectedPlan.metadata,
          currentSession,
          passLabel: "Processing document",
        });
      }
      const outputBuffer = toArrayBuffer(outputBytes);

      setStatus("Validating output");
      setProgressDetail("Validating output.");
      const validationPdf = await PDFDocument.load(copyArrayBuffer(outputBuffer));
      if (validationPdf.getPageCount() !== analysis.pageCount) {
        throw new Error("Output validation failed. Page count did not match the original.");
      }
      if (outputBytes.byteLength <= 0) {
        throw new Error("Output validation failed. The generated PDF was empty.");
      }

      setStatus("Finalising download");
      const blob = new Blob([outputBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const savedBytes = analysis.size - blob.size;
      const savedPercent = analysis.size > 0 ? (savedBytes / analysis.size) * 100 : 0;
      const tone: ResultTone = savedBytes < 0 ? "larger" : savedPercent < 5 ? "limited" : "success";
      setResult({
        url,
        fileName: outputFileName,
        originalSize: analysis.size,
        compressedSize: blob.size,
        savedBytes,
        savedPercent,
        pageCount: analysis.pageCount,
        mode: compressionMode,
        profile: compressionMode === "quality" ? profile : undefined,
        grayscale: colour === "grayscale",
        tone,
        target: targetResult,
      });
      setStatus("Download ready");
      setProgressDetail(
        compressionMode === "target" ? "Target analysis complete." : "Compression complete.",
      );
    } catch (compressError) {
      if (currentSession !== sessionRef.current) return;
      const message =
        compressError instanceof Error
          ? compressError.message
          : "Compression failed. Try a safer profile or a smaller PDF.";
      setError(
        compressionMode === "target"
          ? `Unable to process. ${message}`
          : message.includes("Document preview engine")
            ? "Compression engine could not start. Reanalyse the document or try again."
            : message,
      );
      setStatus("Ready");
      setProgressDetail("");
    } finally {
      if (processingDoc) {
        try {
          await (processingDoc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
        } catch {
          // Processing document may already be destroyed after cancellation.
        }
      }
      setIsCompressing(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    downloadUrl(result.url, result.fileName);
    const timer = window.setTimeout(() => {
      clearResult("Temporary file cleared from this session.");
      setStatus("Ready");
    }, 900);
    timersRef.current.push(timer);
  }

  const uploadArea = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files ?? []);
          event.target.value = "";
        }}
      />
      <div
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
        className={`lumeo-upload-surface group relative mx-auto w-full max-w-[1040px] overflow-hidden rounded-[24px] border px-5 py-7 shadow-2xl shadow-black/32 transition-all duration-300 sm:px-8 lg:px-10 lg:py-8 ${
          dragActive
            ? "border-[#CBA052]/64 bg-[#CBA052]/14 shadow-[0_24px_70px_rgba(245,158,11,0.2)]"
            : "border-[#FFFFFF]/18 bg-gradient-to-br from-[#111A2B] via-[#0F1727] to-[#0C1220] hover:-translate-y-0.5 hover:border-[#CBA052]/36"
        }`}
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#CBA052]/42 to-transparent opacity-80" />
        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-2xl flex-col gap-4 sm:flex-row sm:items-center">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[#CBA052]/24 bg-[#0C1220]/64 text-[#CBA052] shadow-[0_18px_44px_rgba(0,0,0,0.24)] transition group-hover:scale-[1.02] group-hover:bg-[#CBA052]/14">
              <CompressIcon />
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
            Select PDF
          </button>
        </div>
      </div>
    </>
  );

  if (!analysis) {
    return (
      <section className="pb-4 lg:flex lg:h-full lg:flex-col lg:justify-center lg:pb-0">
        {uploadArea}
        <div className="mt-4 text-center">
          <p className="text-sm font-semibold text-[#FFFFFF]/68">
            Private by design &middot; Browser-only &middot; Cleared after download
          </p>
          <p className="mt-1 text-xs text-[#FFFFFF]/38">
            Files stay on your device for this tool.
          </p>
        </div>
        {error ? (
          <div role="alert" className="mt-4 rounded-lg border border-[#F0A8A8]/20 bg-[#F0A8A8]/10 p-4 text-sm font-medium text-[#F0C0C0]">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="pb-28 lg:h-full lg:overflow-hidden lg:pb-0">
      <div className="grid h-full gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(340px,0.72fr)] lg:overflow-hidden 2xl:grid-cols-[minmax(0,1.95fr)_minmax(360px,0.72fr)]">
        <div className="flex min-h-0 flex-col gap-3 rounded-xl border border-[#FFFFFF]/14 bg-gradient-to-br from-[#111A2B] via-[#0F1727] to-[#0A101C] p-3 shadow-2xl shadow-black/32">
          <section className="shrink-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#CBA052]">
                  Document profile
                </p>
                <p className="mt-0.5 text-xs text-[#FFFFFF]/48">
                  Estimated local analysis.
                </p>
              </div>
              <button
                type="button"
                onClick={resetTool}
                className="rounded-full border border-[#FFFFFF]/12 px-3 py-1.5 text-xs font-semibold text-[#FFFFFF]/56 transition hover:border-[#FFFFFF]/22 hover:text-[#FFFFFF]"
              >
                Start new
              </button>
            </div>
            <div className="grid gap-2 rounded-lg border border-[#FFFFFF]/10 bg-[#0A101C]/74 px-3 py-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <DocumentIcon />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#FFFFFF]">{analysis.name}</p>
                <p className="mt-1 text-xs font-medium text-[#FFFFFF]/42">
                  {analysis.pageCount} page{analysis.pageCount === 1 ? "" : "s"} · {formatFileSize(analysis.size)} · {analysis.pageSizeType}
                </p>
              </div>
              <span className="rounded-full border border-[#CBA052]/24 bg-[#CBA052]/10 px-3 py-1.5 text-xs font-semibold text-[#9FD0B5]">
                {displayStatus}
              </span>
            </div>
          </section>

          <div className="grid gap-3 rounded-xl border border-[#FFFFFF]/10 bg-[#0A101C]/60 p-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#FFFFFF]">
                {analysis.opportunity === "High" ? "Image-heavy document" : analysis.opportunity === "Moderate" ? "Balanced document" : "Already compact document"}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/48">
                Compression opportunity: {analysis.opportunity} · Recommended: {profiles[analysis.recommendation].label}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/38">
                {opportunityCopy}
              </p>
            </div>
            {previewUrl ? (
              <div className="hidden h-24 w-20 overflow-hidden rounded-lg border border-[#FFFFFF]/12 bg-[#FFFFFF]/[0.04] md:block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt={`Representative preview of page ${analysis.samplePage}`} className="h-full w-full object-contain" />
              </div>
            ) : null}
          </div>

          <div className="hidden gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-[#FFFFFF]/10 bg-[#0A101C]/64 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#CBA052]">Compression opportunity</p>
              <p className="mt-2 text-2xl font-bold text-[#FFFFFF]">{analysis.opportunity}</p>
              <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/42">{opportunityCopy}</p>
            </div>
            <div className="rounded-xl border border-[#FFFFFF]/10 bg-[#0A101C]/64 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#CBA052]">Estimated image-heavy pages</p>
              <p className="mt-2 text-2xl font-bold text-[#FFFFFF]">{Math.round(analysis.estimatedImageHeavyRatio * 100)}%</p>
              <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/42">Based on local document signals, not remote analysis.</p>
            </div>
            <div className="rounded-xl border border-[#FFFFFF]/10 bg-[#0A101C]/64 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#CBA052]">Recommended for this document</p>
              <p className="mt-2 text-2xl font-bold text-[#FFFFFF]">{profiles[analysis.recommendation].label}</p>
              <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/42">{profileExplanation(analysis.opportunity)}</p>
            </div>
          </div>

          <div className="hidden min-h-0 flex-1 gap-3 lg:grid-cols-[0.8fr_1.2fr] lg:overflow-hidden">
            <div className="min-h-0 rounded-xl border border-[#FFFFFF]/10 bg-[#0A101C]/62 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#CBA052]">Quality preview</p>
              <p className="mt-1 text-xs text-[#FFFFFF]/40">Representative original preview · Page {analysis.samplePage}</p>
              <div className="mt-3 flex h-64 items-center justify-center overflow-hidden rounded-lg border border-[#FFFFFF]/10 bg-[#FFFFFF]/[0.04] lg:h-full lg:min-h-[16rem]">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt={`Representative preview of page ${analysis.samplePage}`} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#FFFFFF]/28">Preview</span>
                )}
              </div>
            </div>
            <div className="no-scrollbar min-h-0 overflow-y-auto rounded-xl border border-[#FFFFFF]/10 bg-[#0A101C]/62 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#CBA052]">Risk notes</p>
              <div className="mt-3 space-y-2">
                <div className="rounded-lg border border-[#CBA052]/18 bg-[#CBA052]/8 p-3 text-xs leading-5 text-[#FFFFFF]/74">
                  This compression pass rebuilds page appearance as optimized images. Review the output before replacing files that need selectable text, forms, links, signatures, or archival conformance.
                </div>
                {analysis.opportunity === "Low" ? (
                  <div className="rounded-lg border border-[#CBA052]/18 bg-[#CBA052]/8 p-3 text-xs leading-5 text-[#FFFFFF]/74">
                    This PDF already appears well optimised. Strong compression may reduce image clarity without producing meaningful savings.
                  </div>
                ) : null}
                {analysis.risks.length ? (
                  analysis.risks.map((risk) => (
                    <div key={risk.title} className="rounded-lg border border-[#FFFFFF]/10 bg-[#FFFFFF]/[0.035] p-3">
                      <p className="text-sm font-bold text-[#FFFFFF]">{risk.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/46">{risk.description}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-[#FFFFFF]/46">No specific form, signature, attachment, PDF/A, or large-file risk markers were detected in the sampled local analysis.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#CBA052]/20 bg-[#0A101C]/70 px-4 py-2 text-xs text-[#FFFFFF]/54 shadow-inner shadow-black/20">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-semibold text-[#FFFFFF]/74">Private by design &middot; Browser-only &middot; Cleared after download</p>
              <p className="lg:hidden">Files stay on your device. No server upload.</p>
            </div>
          </div>
        </div>

        <aside className="lg:min-h-0">
          <div className="flex h-full min-h-0 flex-col rounded-xl border border-[#FFFFFF]/14 bg-gradient-to-br from-[#111A2B] via-[#0F1727] to-[#0A101C] p-3 shadow-2xl shadow-black/32">
            <div className={result ? "hidden" : "border-b border-[#FFFFFF]/10 pb-3"}>
              <p className="text-xs font-semibold text-[#FFFFFF]/68">
                Compression mode
              </p>
              <div
                className="mt-2 grid grid-cols-2 rounded-xl border border-[#FFFFFF]/10 bg-[#0A101C]/54 p-1"
                aria-label="Compression mode"
              >
                {[
                  ["quality", "Quality mode"],
                  ["target", "Target size"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={compressionMode === value}
                    onClick={() => {
                      setCompressionMode(value as CompressionMode);
                      setAdvancedOpen(false);
                      setExpertOpen(false);
                      setError("");
                      clearResult();
                    }}
                    className={`min-h-11 rounded-lg px-2 text-xs font-bold transition motion-reduce:transition-none ${
                      compressionMode === value
                        ? "bg-[#CBA052]/20 text-[#FFFFFF] ring-1 ring-[#CBA052]/55"
                        : "text-[#FFFFFF]/46 hover:text-[#FFFFFF]"
                    }`}
                  >
                    {compressionMode === value ? "✓ " : ""}
                    {label}
                  </button>
                ))}
              </div>

              {compressionMode === "quality" ? (
                <div className="mt-3 grid gap-2">
                  {(Object.keys(profiles) as CompressProfile[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        resetSettings(item, true);
                        clearResult();
                      }}
                      aria-pressed={profile === item}
                      className={`rounded-xl border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-[#CBA052]/45 motion-reduce:transition-none ${
                        profile === item
                          ? "border-[#CBA052]/55 bg-[#CBA052]/16"
                          : "border-[#FFFFFF]/8 bg-[#FFFFFF]/[0.025] hover:border-[#CBA052]/28"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-3 text-sm font-bold text-[#FFFFFF]">
                        <span>{profile === item ? "✓ " : ""}{profiles[item].label}</span>
                        {analysis.recommendation === item ? <span className="rounded-full bg-[#CBA052]/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#CBA052]">Recommended</span> : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-[#FFFFFF]/42">{profiles[item].description}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-sm font-bold text-[#FFFFFF]">
                    Target Size Studio
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#FFFFFF]/44">
                    Set the maximum size you need. Lumeo adapts resolution and
                    image quality while protecting readability.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["100", "Under 100 KB"],
                      ["200", "Under 200 KB"],
                      ["400", "Under 400 KB"],
                      ["custom", "Custom target"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={targetPreset === value}
                        onClick={() => {
                          setTargetPreset(value as TargetPreset);
                          setError("");
                          clearResult();
                        }}
                        className={`min-h-11 rounded-lg border px-2 text-xs font-bold transition motion-reduce:transition-none ${
                          targetPreset === value
                            ? "border-[#CBA052]/55 bg-[#CBA052]/16 text-[#FFFFFF]"
                            : "border-[#FFFFFF]/9 text-[#FFFFFF]/48 hover:border-[#CBA052]/28"
                        }`}
                      >
                        {targetPreset === value ? "✓ " : ""}
                        {label}
                      </button>
                    ))}
                  </div>
                  {targetPreset === "custom" ? (
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
                      <label className="text-xs font-semibold text-[#FFFFFF]/62">
                        Target size
                        <input
                          ref={customTargetInputRef}
                          type="number"
                          inputMode="decimal"
                          min={targetUnit === "KB" ? 20 : 0.02}
                          step={targetUnit === "KB" ? 10 : 0.1}
                          value={customTargetValue}
                          onChange={(event) => {
                            setCustomTargetValue(event.target.value);
                            setError("");
                            clearResult();
                          }}
                          className="mt-1.5 h-11 w-full rounded-lg border border-[#FFFFFF]/12 bg-[#FFFFFF]/[0.035] px-3 text-base text-[#FFFFFF] outline-none focus:border-[#CBA052]/45"
                        />
                      </label>
                      <label className="text-xs font-semibold text-[#FFFFFF]/62">
                        Unit
                        <select
                          value={targetUnit}
                          onChange={(event) => {
                            setTargetUnit(event.target.value as TargetUnit);
                            setError("");
                            clearResult();
                          }}
                          className="mt-1.5 h-11 w-full rounded-lg border border-[#FFFFFF]/12 bg-[#111A2B] px-2 text-sm font-bold text-[#FFFFFF] outline-none focus:border-[#CBA052]/45"
                        >
                          <option value="KB">KB</option>
                          <option value="MB">MB</option>
                        </select>
                      </label>
                    </div>
                  ) : null}
                  <div aria-live="polite" className="mt-3 rounded-xl border border-[#FFFFFF]/10 bg-[#0A101C]/68 p-3">
                    {targetError ? (
                      <p role="alert" className="text-xs font-semibold text-[#F0C0C0]">
                        {targetError}
                      </p>
                    ) : (
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div><dt className="text-[#FFFFFF]/38">Original</dt><dd className="mt-0.5 font-bold text-[#FFFFFF]">{formatFileSize(analysis.size)}</dd></div>
                        <div><dt className="text-[#FFFFFF]/38">Target</dt><dd className="mt-0.5 font-bold text-[#FFFFFF]">Under {formatFileSize(targetBytes)}</dd></div>
                        <div><dt className="text-[#FFFFFF]/38">Reduction needed</dt><dd className="mt-0.5 font-bold text-[#FFFFFF]">{requiredReductionPercent(analysis.size, targetBytes).toFixed(0)}%</dd></div>
                        <div><dt className="text-[#FFFFFF]/38">Pages</dt><dd className="mt-0.5 font-bold text-[#FFFFFF]">{analysis.pageCount}</dd></div>
                        <div><dt className="text-[#FFFFFF]/38">Quality outlook</dt><dd className="mt-0.5 font-bold text-[#FFFFFF]">{targetOutlook}</dd></div>
                        <div><dt className="text-[#FFFFFF]/38">Method</dt><dd className="mt-0.5 font-bold text-[#FFFFFF]">Adaptive multi-pass</dd></div>
                      </dl>
                    )}
                  </div>
                </div>
              )}

              <button
                type="button"
                aria-pressed={colour === "grayscale"}
                onClick={() => {
                  setColour((current) => current === "grayscale" ? "preserve" : "grayscale");
                  clearResult();
                }}
                className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl border border-[#FFFFFF]/10 px-3 text-left text-xs font-semibold text-[#FFFFFF]/58 transition hover:border-[#CBA052]/28 motion-reduce:transition-none"
              >
                <span>Grayscale</span>
                <span className={colour === "grayscale" ? "text-[#9FD0B5]" : "text-[#FFFFFF]/34"}>
                  {colour === "grayscale" ? "On" : "Off"}
                </span>
              </button>
            </div>

            <div className={result ? "hidden" : "no-scrollbar min-h-0 flex-1 overflow-y-auto py-3"}>
              <button
                type="button"
                onClick={() => setAdvancedOpen((open) => !open)}
                aria-expanded={advancedOpen}
                className={compressionMode === "quality" ? "flex w-full items-center justify-between rounded-xl border border-[#FFFFFF]/10 px-3 py-2 text-left text-xs font-semibold text-[#FFFFFF]/54 transition hover:border-[#CBA052]/30 hover:text-[#FFFFFF]" : "hidden"}
              >
                Advanced options
                <span>{advancedOpen ? "−" : "+"}</span>
              </button>
              {compressionMode === "quality" && advancedOpen ? (
                <div className="mt-3 space-y-4 rounded-xl border border-[#FFFFFF]/10 bg-[#0A101C]/62 p-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#CBA052]">Image resolution</p>
                    <div className="mt-2 grid gap-2">
                      {resolutionOptions.map((item) => (
                        <button key={item.value} type="button" onClick={() => { setResolution(item.value); clearResult(); }} className={`rounded-lg border px-3 py-2 text-left text-xs transition ${resolution === item.value ? "border-[#CBA052]/50 bg-[#CBA052]/14 text-[#FFFFFF]" : "border-[#FFFFFF]/8 text-[#FFFFFF]/52 hover:border-[#CBA052]/28"}`}>
                          <span className="font-bold">{item.label}</span>
                          <span className="mt-0.5 block text-[#FFFFFF]/38">{item.helper}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#CBA052]">Image quality</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {qualityOptions.map((item) => (
                        <button key={item.value} type="button" onClick={() => { setQuality(item.value); clearResult(); }} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${quality === item.value ? "border-[#CBA052]/50 bg-[#CBA052]/14 text-[#9FD0B5]" : "border-[#FFFFFF]/10 text-[#FFFFFF]/48 hover:border-[#CBA052]/30"}`}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setExpertOpen((open) => !open)}
                aria-expanded={expertOpen}
                className={compressionMode === "quality" ? "mt-3 flex w-full items-center justify-between rounded-xl border border-[#FFFFFF]/10 px-3 py-2 text-left text-xs font-semibold text-[#FFFFFF]/54 transition hover:border-[#CBA052]/30 hover:text-[#FFFFFF]" : "hidden"}
              >
                Document and output details
                <span>{expertOpen ? "−" : "+"}</span>
              </button>
              {compressionMode === "quality" && expertOpen ? (
                <div className="mt-3 space-y-3 rounded-xl border border-[#FFFFFF]/10 bg-[#0A101C]/62 p-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-[#FFFFFF]/68">
                    <input type="checkbox" checked={expertMode === "custom"} onChange={(event) => setExpertMode(event.target.checked ? "custom" : "profile")} />
                    Use custom DPI and quality
                  </label>
                  <label className="block text-xs font-bold uppercase tracking-[0.14em] text-[#CBA052]">
                    Custom DPI
                    <input type="number" min={72} max={240} value={customDpi} onChange={(event) => { setCustomDpi(Number(event.target.value)); clearResult(); }} className="mt-2 h-10 w-full rounded-lg border border-[#FFFFFF]/10 bg-[#FFFFFF]/[0.035] px-3 text-sm text-[#FFFFFF] outline-none focus:border-[#CBA052]/45" />
                  </label>
                  <label className="block text-xs font-bold uppercase tracking-[0.14em] text-[#CBA052]">
                    Custom quality
                    <input type="number" min={35} max={92} value={customQuality} onChange={(event) => { setCustomQuality(Number(event.target.value)); clearResult(); }} className="mt-2 h-10 w-full rounded-lg border border-[#FFFFFF]/10 bg-[#FFFFFF]/[0.035] px-3 text-sm text-[#FFFFFF] outline-none focus:border-[#CBA052]/45" />
                  </label>
                </div>
              ) : null}

              <div className={compressionMode === "quality" && expertOpen ? "mt-4 rounded-xl border border-[#FFFFFF]/10 bg-[#0A101C]/66 p-3" : "hidden"}>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#CBA052]">Compression plan</p>
                <ul className="mt-2 space-y-1.5 text-xs text-[#FFFFFF]/50">
                  <li>Images: render at {selectedPlan.dpi} DPI</li>
                  <li>Image quality: {Math.round(selectedPlan.quality * 100)}%</li>
                  <li>Colour: {selectedPlan.colour === "grayscale" ? "Grayscale image content" : "Preserved"}</li>
                  <li>Text, links, forms: review output; page appearance is rebuilt as images</li>
                </ul>
              </div>

              <div className={compressionMode === "quality" && expertOpen ? "mt-4 rounded-xl border border-[#FFFFFF]/10 bg-[#0A101C]/66 p-3" : "hidden"}>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#CBA052]">Output manifest</p>
                <ul className="mt-2 space-y-1.5 text-xs text-[#FFFFFF]/50">
                  <li>1 compressed PDF</li>
                  <li>{profileLabel} profile</li>
                  <li>Original page order preserved</li>
                  <li>Page count validated after generation</li>
                  <li>Output filename verified</li>
                </ul>
              </div>

              <div className="mt-4">
                <label className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFFFFF]/42">
                  Output file name
                  <input value={outputName} onChange={(event) => setOutputName(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#FFFFFF]/10 bg-[#FFFFFF]/[0.035] px-3 text-sm font-semibold normal-case tracking-normal text-[#FFFFFF] outline-none transition placeholder:text-[#FFFFFF]/25 focus:border-[#CBA052]/45" />
                </label>
              </div>

              {error ? <div role="alert" className="mt-4 rounded-xl border border-[#F0A8A8]/20 bg-[#F0A8A8]/10 px-3 py-2 text-sm text-[#F0C0C0]">{error}</div> : null}
              {previewIssue ? <div className="mt-4 rounded-xl border border-[#CBA052]/18 bg-[#CBA052]/8 px-3 py-2 text-xs text-[#FFFFFF]/70">{previewIssue}</div> : null}
              {cleanupMessage ? <div className="mt-4 rounded-xl border border-[#CBA052]/26 bg-[#CBA052]/12 px-3 py-2 text-sm text-[#9FD0B5]">{cleanupMessage}</div> : null}
              {progressDetail ? <div aria-live="polite" className="mt-4 rounded-xl border border-[#FFFFFF]/10 bg-[#FFFFFF]/[0.035] px-3 py-2 text-xs text-[#FFFFFF]/48">{progressDetail}</div> : null}
            </div>

            <div className={result ? "flex min-h-0 flex-1 flex-col justify-center border-0 pt-0" : "border-t border-[#FFFFFF]/10 pt-3"}>
              {result ? (
                <div className={`mb-4 rounded-xl border p-4 ${result.target ? result.target.outcome === "achieved" ? "border-[#CBA052]/28 bg-[#CBA052]/12" : result.target.outcome === "closest-safe" ? "border-[#CBA052]/24 bg-[#CBA052]/10" : "border-[#F0A8A8]/20 bg-[#F0A8A8]/10" : result.tone === "success" ? "border-[#CBA052]/28 bg-[#CBA052]/12" : result.tone === "limited" ? "border-[#CBA052]/24 bg-[#CBA052]/10" : "border-[#F0A8A8]/20 bg-[#F0A8A8]/10"}`}>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#CBA052]">
                    Size Outcome
                  </p>
                  <p ref={resultHeadingRef} tabIndex={-1} className="text-lg font-bold text-[#FFFFFF] outline-none">
                    {result.mode === "target"
                      ? result.target?.outcome === "achieved"
                        ? "Target achieved"
                        : result.target?.outcome === "closest-safe"
                          ? "Closest safe result"
                          : result.target?.outcome === "not-beneficial"
                            ? "Compression not beneficial"
                            : "Unable to process"
                      : result.tone === "success"
                        ? "Compression complete"
                        : result.tone === "limited"
                          ? "Compression completed with limited reduction"
                          : "The compressed result is larger than the original"}
                  </p>
                  <div className="mt-4 grid gap-2 text-sm text-[#FFFFFF]/58">
                    {result.target ? <p>Requested: Under {formatFileSize(result.target.requestedBytes)}</p> : null}
                    <p>Original: {formatFileSize(result.originalSize)}</p>
                    <p>{result.target?.outcome === "closest-safe" ? "Safest result" : "Result"}: {formatFileSize(result.compressedSize)}</p>
                    <p>
                      {result.savedBytes >= 0 ? "Saved" : "Increase"}: {formatFileSize(Math.abs(result.savedBytes))} · {Math.abs(result.savedPercent).toFixed(1)}%
                    </p>
                    <p>Pages: {result.pageCount}</p>
                    {result.mode === "quality" && result.profile ? <p>Profile: {profiles[result.profile].label}</p> : null}
                    {result.target ? <p>Passes: {result.target.attempts.length}</p> : null}
                    {result.target ? <p>Quality: {result.target.qualityOutlook}</p> : null}
                    <p>Grayscale: {result.grayscale ? "On" : "Off"}</p>
                    {result.target?.outcome === "closest-safe" ? <p className="text-[#FFFFFF]/70">Reason: Reducing further would significantly affect readability.</p> : null}
                    {result.tone === "larger" ? <p className="font-semibold text-[#F0C0C0]">Recommendation: keep original.</p> : null}
                  </div>
                </div>
              ) : (
                <p className="mb-3 text-xs text-[#FFFFFF]/42">
                  Ready to compress · {compressionMode === "target" ? `Under ${formatFileSize(targetBytes)}` : profileLabel}
                </p>
              )}

              {result ? (
                <div className="grid gap-2">
                  <button type="button" onClick={handleDownload} className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#CBA052] px-5 text-sm font-bold text-[#FFFFFF] shadow-[0_14px_35px_rgba(245,158,11,0.28)] transition hover:-translate-y-0.5 hover:bg-[#257D58] active:scale-[0.98]">
                    Download compressed PDF
                  </button>
                  <div className={`grid gap-2 ${result.mode === "target" ? "grid-cols-2" : "grid-cols-1"}`}>
                    <button type="button" onClick={() => { clearResult(); setStatus("Ready"); setProgressDetail(""); setError(""); }} className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#FFFFFF]/12 px-3 text-xs font-bold text-[#FFFFFF]/62 transition hover:border-[#CBA052]/30 hover:text-[#FFFFFF]">
                      Compress again
                    </button>
                    {result.mode === "target" ? (
                      <button type="button" onClick={() => { clearResult(); setStatus("Ready"); setProgressDetail(""); setError(""); window.setTimeout(() => customTargetInputRef.current?.focus(), 0); }} className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#FFFFFF]/12 px-3 text-xs font-bold text-[#FFFFFF]/62 transition hover:border-[#CBA052]/30 hover:text-[#FFFFFF]">
                        Change target
                      </button>
                    ) : null}
                  </div>
                  <button type="button" onClick={resetTool} className="inline-flex h-10 w-full items-center justify-center rounded-full border border-[#FFFFFF]/12 px-5 text-sm font-bold text-[#FFFFFF]/62 transition hover:border-[#CBA052]/30 hover:text-[#FFFFFF]">
                    Clear and start new
                  </button>
                </div>
              ) : (
                <button type="button" disabled={!canCompress} onClick={handleCompress} className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#CBA052] px-5 text-sm font-bold text-[#FFFFFF] shadow-[0_14px_35px_rgba(245,158,11,0.28)] transition hover:-translate-y-0.5 hover:bg-[#257D58] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55">
                  {isCompressing ? "Compressing in your browser..." : error ? "Retry compression" : "Compress PDF"}
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
