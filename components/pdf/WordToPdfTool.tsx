"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileDown, FileText } from "lucide-react";

import {
  ConversionStageIndicator,
  LocalConversionPrivacyNote,
} from "@/components/pdf/conversion/LocalConversionExperience";
import {
  L2FileCard,
  L2ToolbarButton,
  L2UploadStage,
  L2WorkspaceGrid,
  L2WorkspaceHeader,
  L2WorkspaceInspector,
  L2WorkspacePanel,
  L2WorkspaceToolbar,
  ToolActionBar,
} from "@/components/pdf/workspace/ToolWorkspace";
import { AuraStatus } from "@/components/ui/Aura";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import { ConversionCoordinator } from "@/lib/conversion/ConversionCoordinator";
import { BrowserWordToPdfEngine } from "@/lib/conversion/browser/BrowserWordToPdfEngine";
import {
  canRunThreadedBrowserOffice,
  detectBrowserConversionCapabilities,
  missingThreadedBrowserOfficeCapabilities,
} from "@/lib/conversion/browser/capabilities";
import { getBrowserLibreOfficeRuntime } from "@/lib/conversion/browser/libreoffice/BrowserLibreOfficeRuntime";
import { ensureWordToPdfCrossOriginIsolation } from "@/lib/conversion/browser/wordToPdfIsolation";
import { cleanupOrphanedConversionJobs } from "@/lib/conversion/browser/workspace";
import {
  conversionUserError,
  normalizeConversionError,
  toAnalyticsConversionErrorCode,
  type ConversionUserError,
} from "@/lib/conversion/errors";
import {
  isWordNamedFile,
  validateWordConversionFile,
} from "@/lib/conversion/fileValidation";
import { checkBrowserConversionFileSize } from "@/lib/conversion/limits";
import type {
  ConversionPhase,
  ConversionResult,
} from "@/lib/conversion/types";
import { formatBytes as formatFileSize } from "@/lib/pdf/formatBytes";
import { recordRecentFile } from "@/lib/recent-files";

type Stage =
  | "idle"
  | "selected"
  | "preparing"
  | "converting"
  | "finalizing"
  | "success"
  | "cancelled"
  | "recoverable-error"
  | "unsupported";

type SelectedFile = {
  file: File;
};

const conversionCoordinator = new ConversionCoordinator(new BrowserWordToPdfEngine());

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function WordIcon() {
  return <FileText aria-hidden="true" className="h-8 w-8" />;
}

function stageForPhase(phase: ConversionPhase): Stage {
  if (phase === "preparing" || phase === "uploading") return "preparing";
  if (phase === "validating" || phase === "finalizing") return "finalizing";
  return "converting";
}

function selectedFileType(file: File): string {
  const match = /\.([a-z0-9]+)$/i.exec(file.name);
  return match ? match[1].toUpperCase() : "Word document";
}

export default function WordToPdfTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);
  const sessionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [phase, setPhase] = useState<ConversionPhase | null>(null);
  const [statusLabel, setStatusLabel] = useState("");
  const [error, setError] = useState<ConversionUserError | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [engineReady, setEngineReady] = useState(false);

  useEffect(() => {
    ensureWordToPdfCrossOriginIsolation();
  }, []);

  useEffect(() => {
    if (
      !shouldAttemptOnce({
        availability,
        alreadyAccepted: openedTrackedRef.current,
      })
    ) {
      return;
    }
    const outcome = track({
      eventName: "tool_opened",
      toolSlug: "word-to-pdf",
    });
    if (outcome.accepted) openedTrackedRef.current = true;
  }, [availability, track]);

  useEffect(() => {
    void cleanupOrphanedConversionJobs().catch(() => {});
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  function resetTool() {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionRef.current += 1;
    setSelected(null);
    setStage("idle");
    setPhase(null);
    setStatusLabel("");
    setError(null);
    setResult(null);
    setEngineReady(false);
  }

  async function prepareSelectedFile(file: File, currentSession: number) {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    setEngineReady(false);
    setError(null);
    setResult(null);
    setStage("preparing");
    setPhase("preparing");
    setStatusLabel("Validating document");

    try {
      const validation = await validateWordConversionFile(file);
      if (currentSession !== sessionRef.current) return;

      if (!validation.ok) {
        throw conversionUserError(validation.code, {
          message: validation.message,
        });
      }

      setStatusLabel("Checking browser capabilities");
      const capabilities = await detectBrowserConversionCapabilities();
      if (currentSession !== sessionRef.current) return;

      if (!canRunThreadedBrowserOffice(capabilities)) {
        const missing = missingThreadedBrowserOfficeCapabilities(capabilities);
        throw conversionUserError("browser-unsupported", {
          recoverable: false,
          message:
            missing.length === 1
              ? `Local Word to PDF requires ${missing[0]}, which is not available in this browser session.`
              : `Local Word to PDF cannot start because this browser session is missing: ${missing.join(", ")}.`,
          technicalMessage: `Missing local Office capabilities: ${missing.join(", ") || "unknown"}.`,
        });
      }

      setPhase("loading-engine");
      setStatusLabel("Loading conversion engine");

      const runtime = getBrowserLibreOfficeRuntime();
      try {
        await runtime.start(controller.signal);
      } catch (runtimeError) {
        throw normalizeConversionError(runtimeError, "runtime");
      }

      if (currentSession !== sessionRef.current) return;

      setEngineReady(true);
      setStage("selected");
      setPhase(null);
      setStatusLabel("Ready to convert");
    } catch (prepareError) {
      if (currentSession !== sessionRef.current) return;

      const normalized = normalizeConversionError(prepareError);
      if (normalized.code === "cancelled" || controller.signal.aborted) {
        setPhase(null);
        setStage("cancelled");
        setStatusLabel("Preparation cancelled");
        setError(null);
        return;
      }

      setPhase(null);
      setError(normalized);
      setStage(
        normalized.code === "browser-unsupported"
          ? "unsupported"
          : "recoverable-error",
      );
      setStatusLabel(
        normalized.code === "browser-unsupported"
          ? "Browser capability missing"
          : "Engine needs attention",
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function handleFiles(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;

    if (!isWordNamedFile(file)) {
      setError(
        conversionUserError("unsupported-file", {
          message: "Choose a DOCX or DOC Word document.",
        }),
      );
      return;
    }

    const sizeError = checkBrowserConversionFileSize(file);
    if (sizeError) {
      setError(
        conversionUserError("file-too-large", {
          technicalMessage: sizeError,
        }),
      );
      return;
    }

    sessionRef.current += 1;
    const currentSession = sessionRef.current;
    setSelected({ file });
    setStage("preparing");
    setPhase("preparing");
    setStatusLabel("Validating document");
    setError(null);
    setResult(null);
    setEngineReady(false);
    void prepareSelectedFile(file, currentSession);
  }

  function handlePrepareRetry() {
    if (!selected || isBusy) return;
    sessionRef.current += 1;
    void prepareSelectedFile(selected.file, sessionRef.current);
  }

  async function handleConvert() {
    if (!selected || isBusy || !engineReady) return;

    const currentSession = sessionRef.current;
    const { file } = selected;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    setError(null);
    setResult(null);
    setPhase("preparing");
    setStage("preparing");
    setStatusLabel("Preparing document");

    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "word-to-pdf" });

    try {
      const conversionResult = await conversionCoordinator.convert(
        { file },
        {
          onProgress: (progress) => {
            if (currentSession !== sessionRef.current) return;
            setPhase(progress.phase);
            setStage(stageForPhase(progress.phase));
            setStatusLabel(progress.message);
          },
        },
        controller.signal,
      );

      if (currentSession !== sessionRef.current) return;

      setResult(conversionResult);
      setPhase(null);
      setStage("success");
      setStatusLabel("Ready to download");
      track({
        eventName: "processing_succeeded",
        toolSlug: "word-to-pdf",
        durationMs: performance.now() - startedAt,
        success: true,
      });
      recordRecentFile({
        tool: "word-to-pdf",
        filename: conversionResult.fileName,
        fileSize: conversionResult.blob.size,
      });
    } catch (conversionError) {
      if (currentSession !== sessionRef.current) return;

      const normalized = normalizeConversionError(conversionError);
      if (process.env.NODE_ENV === "development") {
        console.error("Word to PDF conversion failed", conversionError);
      }

      if (normalized.code === "cancelled" || controller.signal.aborted) {
        setPhase(null);
        setStage("cancelled");
        setStatusLabel("Conversion cancelled");
        setError(null);
        return;
      }

      setPhase(null);
      setError(normalized);
      setStage(
        normalized.code === "browser-unsupported"
          ? "unsupported"
          : "recoverable-error",
      );
      setStatusLabel(
        normalized.code === "browser-unsupported"
          ? "Browser not supported"
          : "Conversion needs attention",
      );
      track({
        eventName: "processing_failed",
        toolSlug: "word-to-pdf",
        durationMs: performance.now() - startedAt,
        success: false,
        errorCode: toAnalyticsConversionErrorCode(normalized.code),
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionRef.current += 1;
    setPhase(null);
    setStage("cancelled");
    setStatusLabel(engineReady ? "Conversion cancelled" : "Preparation cancelled");
    setError(null);
    setResult(null);
  }

  function handleDownload() {
    if (!result) return;
    track({ eventName: "download_started", toolSlug: "word-to-pdf" });
    downloadBlob(result.blob, result.fileName);
  }

  const isBusy =
    stage === "preparing" ||
    stage === "converting" ||
    stage === "finalizing";

  const uploadArea = (
    <div className="mx-auto w-full max-w-[1040px]">
      <L2UploadStage
        inputId="word-to-pdf-upload"
        title="Drop your Word document here"
        description="or choose a file from your device"
        acceptedNote="DOCX or DOC · One file · up to 250 MB · processed locally"
        accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
        multiple={false}
        icon={<WordIcon />}
        buttonLabel="Select Word document"
        onFilesSelected={handleFiles}
        disabled={isBusy}
      />
    </div>
  );

  if (!selected) {
    return (
      <section className="l2-workspace grid gap-5 pb-4 lg:pb-0">
        <div className="aura-glass-regular mx-auto w-full max-w-[720px] rounded-[var(--radius-2xl)] p-2 shadow-[var(--v2-elevation-3)]">
          {uploadArea}
        </div>

        <LocalConversionPrivacyNote />

        {error ? (
          <div
            role="alert"
            className="mx-auto flex w-full max-w-[720px] items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]"
          >
            <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {error.message}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="l2-workspace-deep grid min-w-0 gap-4 pb-28 lg:pb-6">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {statusLabel}
      </p>

      <L2WorkspaceHeader
        title="Word to PDF"
        description={`${selectedFileType(selected.file)} · ${formatFileSize(selected.file.size)}`}
      />

      <L2WorkspaceToolbar>
        <L2ToolbarButton onClick={resetTool} disabled={isBusy}>
          Replace file
        </L2ToolbarButton>
        <span
          className="ml-auto min-w-0 max-w-[55vw] truncate text-xs font-bold text-[var(--text-subtle)] sm:max-w-[420px]"
          title={selected.file.name}
        >
          {selected.file.name}
        </span>
      </L2WorkspaceToolbar>

      <L2WorkspaceGrid
        main={
          <L2WorkspacePanel variant="flat">
            <L2FileCard
              name={selected.file.name}
              meta={`${selectedFileType(selected.file)} · ${formatFileSize(selected.file.size)}`}
              icon={
                <FileText
                  aria-hidden="true"
                  className="h-6 w-6 text-[var(--text-accent)]"
                />
              }
              action={
                <AuraStatus
                  tone={
                    stage === "recoverable-error" || stage === "unsupported"
                      ? "danger"
                      : "neutral"
                  }
                  label={statusLabel || "File selected"}
                />
              }
              onRemove={isBusy ? undefined : resetTool}
              removeLabel={`Remove ${selected.file.name}`}
            />

            {isBusy && phase ? (
              <ConversionStageIndicator
                kind="word-to-pdf"
                phase={phase}
                detail={statusLabel}
              />
            ) : null}

            {stage === "cancelled" ? (
              <div
                role="status"
                className="mt-3 rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/62 p-4"
              >
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Conversion cancelled
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-subtle)]">
                  Your selected document is still ready if you want to try again.
                </p>
              </div>
            ) : null}

            {stage === "success" && result ? (
              <div className="aura-success-reveal mt-3 flex min-w-0 items-start gap-3 rounded-xl border border-[rgb(var(--emerald-rgb)/0.36)] bg-[var(--surface-success)] p-4">
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-success)]"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--text-success)]">
                    PDF ready
                  </p>
                  <p
                    className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]/70"
                    title={result.fileName}
                  >
                    {result.fileName}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-primary)]/56">
                    PDF · {formatFileSize(result.blob.size)}
                  </p>
                </div>
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 px-3 py-3 text-sm text-[var(--text-danger)]"
              >
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="min-w-0 break-words">{error.message}</span>
              </div>
            ) : null}
          </L2WorkspacePanel>
        }
        inspector={
          <L2WorkspaceInspector
            title="Convert to PDF"
            description="Processed locally in your browser. Your document is not uploaded for conversion."
          >
            <p className="mt-3 text-xs leading-5 text-[var(--text-subtle)]">
              Lumeo uses a local Office engine to preserve document layout,
              tables, images, pagination, and formatting as closely as the
              document allows.
            </p>
          </L2WorkspaceInspector>
        }
      />

      <ToolActionBar>
        {result ? (
          <>
            <button
              type="button"
              onClick={resetTool}
              className="lumeo-focus-ring inline-flex h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--text-primary)]/12 px-5 text-sm font-bold text-[var(--text-primary)]/62 transition hover:border-[var(--lumeo-gold)]/30 hover:text-[var(--text-primary)]"
            >
              Convert another
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="lumeo-primary-action lumeo-focus-ring inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] shadow-[var(--shadow-success)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98] sm:w-auto"
            >
              <FileDown aria-hidden="true" className="h-4 w-4" />
              Download PDF
            </button>
          </>
        ) : isBusy ? (
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Cancel Word to PDF conversion"
            className="lumeo-focus-ring inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--text-primary)]/14 px-5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--text-danger)]/45 hover:text-[var(--text-danger)] sm:w-auto"
          >
            Cancel conversion
          </button>
        ) : stage === "unsupported" ? (
          <button
            type="button"
            onClick={handlePrepareRetry}
            className="lumeo-focus-ring inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--text-primary)]/14 px-5 text-sm font-bold text-[var(--text-primary)] sm:w-auto"
          >
            Retry compatibility check
          </button>
        ) : (
          <button
            type="button"
            onClick={
              !engineReady &&
              (stage === "recoverable-error" || stage === "cancelled")
                ? handlePrepareRetry
                : handleConvert
            }
            disabled={
              !selected ||
              (!engineReady &&
                stage !== "recoverable-error" &&
                stage !== "cancelled")
            }
            className="lumeo-primary-action lumeo-focus-ring inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] shadow-[var(--shadow-success)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
          >
            {!engineReady &&
            (stage === "recoverable-error" || stage === "cancelled")
              ? "Retry engine"
              : stage === "recoverable-error" || stage === "cancelled"
                ? "Retry conversion"
                : "Convert to PDF"}
          </button>
        )}
      </ToolActionBar>

      <LocalConversionPrivacyNote />
    </section>
  );
}
