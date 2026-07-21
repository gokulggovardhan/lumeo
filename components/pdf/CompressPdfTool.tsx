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
import { AuraOptionCard, AuraSegmentedControl, AuraStatus } from "@/components/ui/Aura";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import { loadPdfJsModule, renderPageWithTimeout } from "@/lib/pdf/pdfjs";
import { formatBytes as formatFileSize } from "@/lib/pdf/formatBytes";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { copyArrayBuffer, toArrayBuffer } from "@/lib/pdf/arrayBuffer";
import {
  hasPdfMagicBytes,
  isPdfNamedFile,
  checkPdfFileSize,
} from "@/lib/pdf/uploadValidation";

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

const LARGE_FILE_WARNING_BYTES = 80 * 1024 * 1024;
const MAX_RENDER_SCALE = 2.35;
const MIN_RENDER_SCALE = 0.75;

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

function sanitizePdfFileName(value: string, fallback = "lumeo-compressed") {
  const stem = sanitizeFileStem(value.replace(/\.pdf$/i, ""), fallback);
  return `${stem}.pdf`;
}

function sourceOutputName(name: string) {
  return sanitizePdfFileName(`${name.replace(/\.[^/.]+$/, "")}-compressed`, "lumeo-compressed");
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

export default function CompressPdfTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);
  const pdfJsDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const sessionRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const resultHeadingRef = useRef<HTMLParagraphElement | null>(null);
  const customTargetInputRef = useRef<HTMLInputElement | null>(null);

  const [analysis, setAnalysis] = useState<CompressAnalysis | null>(null);
  const [compressionMode, setCompressionMode] =
    useState<CompressionMode>("quality");
  const [profile, setProfile] = useState<CompressProfile>("balanced");
  const [targetPreset, setTargetPreset] = useState<TargetPreset>("400");
  const [customTargetValue, setCustomTargetValue] = useState("400");
  const [targetUnit, setTargetUnit] = useState<TargetUnit>("KB");
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
  }

  // Renders one representative page for the sidebar preview, then destroys
  // the pdfjs document -- it's only ever used for this single render.
  // handleCompress opens its own separate document for the actual
  // compression pass, so keeping this one alive afterward just holds a full
  // decoded PDF in memory for the rest of the session for no reason.
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
    } finally {
      if (currentSession === sessionRef.current && pdfJsDocRef.current === doc) {
        pdfJsDocRef.current = null;
      }
      try {
        await (doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
      } catch {
        // PDF.js may already be cleaning itself up.
      }
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

    if (!isPdfNamedFile(file)) {
      setStatus("Ready");
      setError("Please add one PDF file.");
      return;
    }

    const sizeError = checkPdfFileSize(file);
    if (sizeError) {
      setStatus("Ready");
      setError(sizeError);
      return;
    }

    try {
      const bytes = await file.arrayBuffer();

      if (!hasPdfMagicBytes(bytes)) {
        setStatus("Ready");
        setError("This doesn't look like a valid PDF file.");
        return;
      }

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
      await renderPageWithTimeout(task, pageIndex);
      renderTaskRef.current = null;
      if (colourMode === "grayscale") applyGrayscale(canvas);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", imageQuality),
      );
      canvas.width = 0;
      canvas.height = 0;
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

    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "compress" });

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
          setProgressDetail(
            `Pass ${pass} of ${MAX_TARGET_PASSES} · ${formatFileSize(candidateBytes)} so far${
              candidateBytes <= request.targetBytes ? " · under target" : ""
            }`,
          );
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
      track({
        eventName: "processing_succeeded",
        toolSlug: "compress",
        durationMs: performance.now() - startedAt,
        success: true,
      });
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
      track({
        eventName: "processing_failed",
        toolSlug: "compress",
        durationMs: performance.now() - startedAt,
        success: false,
        errorCode: "processing_error",
      });
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
    track({ eventName: "download_started", toolSlug: "compress" });
    downloadUrl(result.url, result.fileName);
    const timer = window.setTimeout(() => {
      clearResult("Temporary file cleared from this session.");
      setStatus("Ready");
    }, 900);
    timersRef.current.push(timer);
  }

  const uploadArea = (
    <>
      <div className="mx-auto w-full max-w-[1040px]">
        <L2UploadStage
          inputId="compress-pdf-upload"
          accept="application/pdf,.pdf"
          acceptedNote="PDF only · One file"
          multiple={false}
          icon={<CompressIcon />}
          buttonLabel="Select PDF"
          onFilesSelected={handleFiles}
        />
      </div>
    </>
  );

  if (!analysis) {
    return (
      <section className="l2-tool-empty-state grid gap-4 pb-4 lg:pb-0">
        {uploadArea}
        <L2PrivacyNote />
        {error ? (
          <div role="alert" className="mt-4 rounded-lg border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="l2-tool-deep-workspace pb-4 lg:pb-0">
      <L2ToolWorkspace>
        <L2ToolMainColumn>
        <div className="flex min-h-0 flex-col gap-3 rounded-xl border border-[var(--text-primary)]/14 bg-gradient-to-br from-[var(--atelier-surface-3)] via-[var(--atelier-surface-2)] to-[var(--atelier-surface-2)] p-3 shadow-2xl shadow-black/32">
          <section className="shrink-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--lumeo-gold)]">
                  Document profile
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-primary)]/48">
                  Estimated local analysis.
                </p>
              </div>
              <button
                type="button"
                onClick={resetTool}
                className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/56 transition hover:border-[var(--text-primary)]/22 hover:text-[var(--text-primary)]"
              >
                Start new
              </button>
            </div>
            <div className="rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/74 px-3 py-2">
              <L2FileCard
                name={analysis.name}
                meta={`${analysis.pageCount} page${analysis.pageCount === 1 ? "" : "s"} · ${formatFileSize(analysis.size)} · ${analysis.pageSizeType}`}
                icon={<FileIcon />}
                action={<AuraStatus tone="success" label={displayStatus} />}
              />
            </div>
          </section>

          <div className="grid gap-3 rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/60 p-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {analysis.opportunity === "High" ? "Image-heavy document" : analysis.opportunity === "Moderate" ? "Balanced document" : "Already compact document"}
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-primary)]/48">
                Compression opportunity: {analysis.opportunity} · Recommended: {profiles[analysis.recommendation].label}
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-primary)]/38">
                {opportunityCopy}
              </p>
            </div>
            {previewUrl ? (
              <div className="hidden h-24 w-20 overflow-hidden rounded-lg border border-[var(--text-primary)]/12 bg-[var(--text-primary)]/[0.04] md:block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt={`Representative preview of page ${analysis.samplePage}`} className="h-full w-full object-contain" />
              </div>
            ) : null}
          </div>

          <div className="hidden gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/64 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--lumeo-gold)]">Compression opportunity</p>
              <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{analysis.opportunity}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-primary)]/42">{opportunityCopy}</p>
            </div>
            <div className="rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/64 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--lumeo-gold)]">Estimated image-heavy pages</p>
              <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{Math.round(analysis.estimatedImageHeavyRatio * 100)}%</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-primary)]/42">Based on local document signals, not remote analysis.</p>
            </div>
            <div className="rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/64 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--lumeo-gold)]">Recommended for this document</p>
              <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{profiles[analysis.recommendation].label}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-primary)]/42">{profileExplanation(analysis.opportunity)}</p>
            </div>
          </div>

          <div className="hidden min-h-0 flex-1 gap-3 lg:grid-cols-[0.8fr_1.2fr] lg:overflow-hidden">
            <div className="min-h-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--atelier-surface-2)]/62 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--lumeo-gold)]">Quality preview</p>
              <p className="mt-1 text-xs text-[var(--text-primary)]/40">Representative original preview · Page {analysis.samplePage}</p>
              <div className="mt-3 flex h-64 items-center justify-center overflow-hidden rounded-lg border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.04] lg:h-full lg:min-h-[16rem]">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt={`Representative preview of page ${analysis.samplePage}`} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]/28">Preview</span>
                )}
              </div>
            </div>
            <div className="no-scrollbar min-h-0 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--atelier-surface-2)]/62 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--lumeo-gold)]">Risk notes</p>
              <div className="mt-3 space-y-2">
                <div className="rounded-lg border border-[var(--lumeo-gold)]/18 bg-[var(--lumeo-gold)]/8 p-3 text-xs leading-5 text-[var(--text-primary)]/74">
                  This compression pass rebuilds page appearance as optimized images. Review the output before replacing files that need selectable text, forms, links, signatures, or archival conformance.
                </div>
                {analysis.opportunity === "Low" ? (
                  <div className="rounded-lg border border-[var(--lumeo-gold)]/18 bg-[var(--lumeo-gold)]/8 p-3 text-xs leading-5 text-[var(--text-primary)]/74">
                    This PDF already appears well optimised. Strong compression may reduce image clarity without producing meaningful savings.
                  </div>
                ) : null}
                {analysis.risks.length ? (
                  analysis.risks.map((risk) => (
                    <div key={risk.title} className="rounded-lg border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.035] p-3">
                      <p className="text-sm font-bold text-[var(--text-primary)]">{risk.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-primary)]/46">{risk.description}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-[var(--text-primary)]/46">No specific form, signature, attachment, PDF/A, or large-file risk markers were detected in the sampled local analysis.</p>
                )}
              </div>
            </div>
          </div>
        </div>
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="Compression settings" description="Choose a quality profile or target size, then compress locally.">
          <div className="flex h-full min-h-0 flex-col">
            <div className={result ? "hidden" : "border-b border-[var(--text-primary)]/10 pb-3"}>
              <AuraSegmentedControl
                label="Compression mode"
                options={[
                  { value: "quality", label: "Quality mode" },
                  { value: "target", label: "Target size" },
                ]}
                value={compressionMode}
                onChange={(value) => {
                  setCompressionMode(value as CompressionMode);
                  setError("");
                  clearResult();
                }}
              />

              {compressionMode === "quality" ? (
                <div className="mt-3 grid gap-2">
                  {(Object.keys(profiles) as CompressProfile[]).map((item) => (
                    <AuraOptionCard
                      key={item}
                      label={profiles[item].label}
                      description={profiles[item].description}
                      selected={profile === item}
                      recommended={analysis.recommendation === item}
                      onClick={() => {
                        resetSettings(item, true);
                        clearResult();
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    Target Size Studio
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-primary)]/44">
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
                            ? "border-[var(--border-selected)] bg-[var(--surface-selected)] text-[var(--text-primary)]"
                            : "border-[var(--text-primary)]/9 text-[var(--text-primary)]/48 hover:border-[var(--border-selected)]"
                        }`}
                      >
                        {targetPreset === value ? "✓ " : ""}
                        {label}
                      </button>
                    ))}
                  </div>
                  {targetPreset === "custom" ? (
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
                      <label className="text-xs font-semibold text-[var(--text-primary)]/62">
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
                          className="mt-1.5 h-11 w-full rounded-lg border border-[var(--text-primary)]/12 bg-[var(--text-primary)]/[0.035] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--lumeo-gold)]/45"
                        />
                      </label>
                      <label className="text-xs font-semibold text-[var(--text-primary)]/62">
                        Unit
                        <select
                          value={targetUnit}
                          onChange={(event) => {
                            setTargetUnit(event.target.value as TargetUnit);
                            setError("");
                            clearResult();
                          }}
                          className="mt-1.5 h-11 w-full rounded-lg border border-[var(--text-primary)]/12 bg-[var(--atelier-surface-3)] px-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--lumeo-gold)]/45"
                        >
                          <option value="KB">KB</option>
                          <option value="MB">MB</option>
                        </select>
                      </label>
                    </div>
                  ) : null}
                  <div aria-live="polite" className="mt-3 rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/68 p-3">
                    {targetError ? (
                      <p role="alert" className="text-xs font-semibold text-[var(--text-danger)]">
                        {targetError}
                      </p>
                    ) : (
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div><dt className="text-[var(--text-primary)]/38">Original</dt><dd className="mt-0.5 font-bold text-[var(--text-primary)]">{formatFileSize(analysis.size)}</dd></div>
                        <div><dt className="text-[var(--text-primary)]/38">Target</dt><dd className="mt-0.5 font-bold text-[var(--text-primary)]">Under {formatFileSize(targetBytes)}</dd></div>
                        <div><dt className="text-[var(--text-primary)]/38">Reduction needed</dt><dd className="mt-0.5 font-bold text-[var(--text-primary)]">{requiredReductionPercent(analysis.size, targetBytes).toFixed(0)}%</dd></div>
                        <div><dt className="text-[var(--text-primary)]/38">Pages</dt><dd className="mt-0.5 font-bold text-[var(--text-primary)]">{analysis.pageCount}</dd></div>
                        <div><dt className="text-[var(--text-primary)]/38">Quality outlook</dt><dd className="mt-0.5 font-bold text-[var(--text-primary)]">{targetOutlook}</dd></div>
                        <div><dt className="text-[var(--text-primary)]/38">Method</dt><dd className="mt-0.5 font-bold text-[var(--text-primary)]">Adaptive multi-pass</dd></div>
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
                className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl border border-[var(--text-primary)]/10 px-3 text-left text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--lumeo-gold)]/28 motion-reduce:transition-none"
              >
                <span>Grayscale</span>
                <span className={colour === "grayscale" ? "text-[var(--lumeo-mint-subtle)]" : "text-[var(--text-primary)]/34"}>
                  {colour === "grayscale" ? "On" : "Off"}
                </span>
              </button>
            </div>

            <div className={result ? "hidden" : "no-scrollbar min-h-0 flex-1 overflow-y-auto py-3"}>
              {compressionMode === "quality" ? (
                <L2AdvancedDisclosure title="Advanced options">
                  <div className="space-y-4 rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/62 p-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--lumeo-gold)]">Image resolution</p>
                      <div className="mt-2 grid gap-2">
                        {resolutionOptions.map((item) => (
                          <AuraOptionCard
                            key={item.value}
                            label={item.label}
                            description={item.helper}
                            selected={resolution === item.value}
                            onClick={() => { setResolution(item.value); clearResult(); }}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <AuraSegmentedControl
                        label="Image quality"
                        options={qualityOptions.map((item) => ({ value: item.value, label: item.label }))}
                        value={quality}
                        onChange={(value) => { setQuality(value as ImageQuality); clearResult(); }}
                      />
                    </div>
                  </div>
                </L2AdvancedDisclosure>
              ) : null}

              {compressionMode === "quality" ? (
                <div className="mt-3">
                  <L2AdvancedDisclosure title="Document and output details">
                    <div className="space-y-3 rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/62 p-3">
                      <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]/68">
                        <input type="checkbox" checked={expertMode === "custom"} onChange={(event) => setExpertMode(event.target.checked ? "custom" : "profile")} />
                        Use custom DPI and quality
                      </label>
                      <label className="block text-xs font-bold uppercase tracking-[0.14em] text-[var(--lumeo-gold)]">
                        Custom DPI
                        <input type="number" min={72} max={240} value={customDpi} onChange={(event) => { setCustomDpi(Number(event.target.value)); clearResult(); }} className="mt-2 h-10 w-full rounded-lg border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.035] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--lumeo-gold)]/45" />
                      </label>
                      <label className="block text-xs font-bold uppercase tracking-[0.14em] text-[var(--lumeo-gold)]">
                        Custom quality
                        <input type="number" min={35} max={92} value={customQuality} onChange={(event) => { setCustomQuality(Number(event.target.value)); clearResult(); }} className="mt-2 h-10 w-full rounded-lg border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.035] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--lumeo-gold)]/45" />
                      </label>
                    </div>
                    <div className="mt-4 rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/66 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--lumeo-gold)]">Compression &amp; output summary</p>
                      <ul className="mt-2 space-y-1.5 text-xs text-[var(--text-primary)]/50">
                        <li>Images: {selectedPlan.dpi} DPI · {Math.round(selectedPlan.quality * 100)}% quality · {selectedPlan.colour === "grayscale" ? "grayscale" : "colour preserved"}</li>
                        <li>Text, links, forms: rebuilt as images — review output</li>
                        <li>Output: 1 compressed PDF · {profileLabel} profile · original page order preserved</li>
                        <li>Verified: page count and output filename checked after generation</li>
                      </ul>
                    </div>
                  </L2AdvancedDisclosure>
                </div>
              ) : null}

              <div className="mt-4">
                <label className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]/42">
                  Output file name
                  <input value={outputName} onChange={(event) => setOutputName(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.035] px-3 text-sm font-semibold normal-case tracking-normal text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-primary)]/25 focus:border-[var(--lumeo-gold)]/45" />
                </label>
              </div>

              {error ? <div role="alert" className="mt-4 rounded-xl border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 px-3 py-2 text-sm text-[var(--text-danger)]">{error}</div> : null}
              {previewIssue ? <div className="mt-4 rounded-xl border border-[var(--lumeo-gold)]/18 bg-[var(--lumeo-gold)]/8 px-3 py-2 text-xs text-[var(--text-primary)]/70">{previewIssue}</div> : null}
              {cleanupMessage ? <div className="mt-4 rounded-xl border border-[rgb(var(--emerald-rgb)/0.36)] bg-[var(--surface-success)] px-3 py-2 text-sm text-[var(--text-success)]">{cleanupMessage}</div> : null}
              {progressDetail ? <div aria-live="polite" className="mt-4 rounded-xl border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.035] px-3 py-2 text-xs text-[var(--text-primary)]/48">{progressDetail}</div> : null}
            </div>

            <div className={result ? "flex min-h-0 flex-1 flex-col justify-center border-0 pt-0" : "border-t border-[var(--text-primary)]/10 pt-3"}>
              {result ? (
                <div className={`aura-success-reveal mb-4 rounded-xl border p-4 ${result.target ? result.target.outcome === "achieved" ? "border-[rgb(var(--emerald-rgb)/0.36)] bg-[var(--surface-success)]" : result.target.outcome === "closest-safe" ? "border-[var(--border-subtle)] bg-[var(--surface-elevated)]" : "border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10" : result.tone === "success" ? "border-[rgb(var(--emerald-rgb)/0.36)] bg-[var(--surface-success)]" : result.tone === "limited" ? "border-[var(--border-subtle)] bg-[var(--surface-elevated)]" : "border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10"}`}>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--lumeo-gold)]">
                    Size Outcome
                  </p>
                  <p ref={resultHeadingRef} tabIndex={-1} className="text-lg font-bold text-[var(--text-primary)] outline-none">
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
                  <div className="mt-4 grid gap-2 text-sm text-[var(--text-primary)]/58">
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
                    {result.target?.outcome === "closest-safe" ? <p className="text-[var(--text-primary)]/70">Reason: Reducing further would significantly affect readability.</p> : null}
                    {result.tone === "larger" ? <p className="font-semibold text-[var(--text-danger)]">Recommendation: keep original.</p> : null}
                  </div>
                </div>
              ) : (
                <p className="mb-3 text-xs text-[var(--text-primary)]/42">
                  Ready to compress · {compressionMode === "target" ? `Under ${formatFileSize(targetBytes)}` : profileLabel}
                </p>
              )}

              {result ? (
                <div className="grid gap-2">
                  <L2ActionArea
                    primary={(
                      <button type="button" onClick={handleDownload} className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] shadow-[var(--shadow-success)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98]">
                        Download compressed PDF
                      </button>
                    )}
                    secondary={(
                      <>
                        <button type="button" onClick={() => { clearResult(); setStatus("Ready"); setProgressDetail(""); setError(""); }} className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--text-primary)]/12 px-3 text-xs font-bold text-[var(--text-primary)]/62 transition hover:border-[var(--lumeo-gold)]/30 hover:text-[var(--text-primary)]">
                          Compress again
                        </button>
                        {result.mode === "target" ? (
                          <button type="button" onClick={() => { clearResult(); setStatus("Ready"); setProgressDetail(""); setError(""); window.setTimeout(() => customTargetInputRef.current?.focus(), 0); }} className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--text-primary)]/12 px-3 text-xs font-bold text-[var(--text-primary)]/62 transition hover:border-[var(--lumeo-gold)]/30 hover:text-[var(--text-primary)]">
                            Change target
                          </button>
                        ) : null}
                        <button type="button" onClick={resetTool} className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--text-primary)]/12 px-5 text-sm font-bold text-[var(--text-primary)]/62 transition hover:border-[var(--lumeo-gold)]/30 hover:text-[var(--text-primary)]">
                          Clear and start new
                        </button>
                      </>
                    )}
                  />
                </div>
              ) : (
                <button type="button" disabled={!canCompress} onClick={handleCompress} className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] shadow-[var(--shadow-success)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55">
                  {isCompressing ? "Compressing in your browser..." : error ? "Retry compression" : "Compress PDF"}
                </button>
              )}
            </div>
          </div>
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>
    </section>
  );
}
