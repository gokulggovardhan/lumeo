"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileDown, FileText, Loader2 } from "lucide-react";
import {
  L2ActionArea,
  L2FileCard,
  L2ToolMainColumn,
  L2ToolSettingsPanel,
  L2ToolWorkspace,
  L2UploadStage,
} from "@/components/pdf/workspace/ToolWorkspace";
import { AuraStatus } from "@/components/ui/Aura";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import { formatBytes as formatFileSize } from "@/lib/pdf/formatBytes";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import {
  checkWordFileSize,
  isWordNamedFile,
  removeWordUpload,
  uploadWordFileForConversion,
} from "@/lib/supabase/wordToPdfStorage";

type Stage = "idle" | "uploading" | "converting" | "success" | "error";

type SelectedFile = {
  file: File;
};

type ConversionResult = {
  blob: Blob;
  fileName: string;
};

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function WordIcon() {
  return <FileText aria-hidden="true" className="h-8 w-8" />;
}

// Ping the API's warm-up handler (GET) so the sleepy converter starts
// booting while the user reads the confirmation and reaches for "Convert".
// Fire-and-forget: it must never block or surface an error in the UI.
function warmConverter() {
  void fetch("/api/tools/word-to-pdf", { method: "GET" }).catch(() => {});
}

// This tool uploads to Supabase and converts server-side (LibreOffice), so
// the shared L2PrivacyNote's "Browser-only" claim would be false here --
// this states the real, still-private handling instead.
function ServerPrivacyNote() {
  return (
    <div className="mx-auto flex w-fit max-w-[560px] items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-raised)] px-4 py-2 text-center text-xs font-extrabold text-[var(--text-muted)]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[var(--text-premium)]" fill="none">
        <path d="M8 2.5 12 4v3.1c0 2.6-1.5 4.9-4 6.1-2.5-1.2-4-3.5-4-6.1V4l4-1.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
      </svg>
      <span>Uploaded securely · Converted on our server · Deleted immediately after</span>
    </div>
  );
}

export default function WordToPdfTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);
  const sessionRef = useRef(0);

  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [statusLabel, setStatusLabel] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConversionResult | null>(null);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const outcome = track({ eventName: "tool_opened", toolSlug: "word-to-pdf" });
    if (outcome.accepted) openedTrackedRef.current = true;
  }, [availability, track]);

  function resetTool() {
    sessionRef.current += 1;
    setSelected(null);
    setStage("idle");
    setStatusLabel("");
    setError("");
    setResult(null);
  }

  function handleFiles(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;

    if (!isWordNamedFile(file)) {
      setError("Please add one Word document (.docx or .doc).");
      return;
    }
    const sizeError = checkWordFileSize(file);
    if (sizeError) {
      setError(sizeError);
      return;
    }

    sessionRef.current += 1;
    setSelected({ file });
    setStage("idle");
    setStatusLabel("Ready to convert");
    setError("");
    setResult(null);
    warmConverter();
  }

  async function handleConvert() {
    if (!selected || stage === "uploading" || stage === "converting") return;
    const currentSession = sessionRef.current;
    const { file } = selected;

    setError("");
    setResult(null);
    setStage("uploading");
    setStatusLabel("Uploading to secure cloud...");

    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "word-to-pdf" });

    let uploadPath = "";
    try {
      const upload = await uploadWordFileForConversion(file);
      if (currentSession !== sessionRef.current) return;
      uploadPath = upload.path;

      setStage("converting");
      setStatusLabel("Converting layout...");

      const response = await fetch("/api/tools/word-to-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          filePathInSupabase: upload.path,
        }),
      });

      if (currentSession !== sessionRef.current) return;

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "Conversion failed. Please try again.");
      }

      setStatusLabel("Finalizing PDF...");
      const blob = await response.blob();
      const outputName = `${sanitizeFileStem(file.name, "converted")}.pdf`;

      setResult({ blob, fileName: outputName });
      setStage("success");
      setStatusLabel("Download ready");
      track({
        eventName: "processing_succeeded",
        toolSlug: "word-to-pdf",
        durationMs: performance.now() - startedAt,
        success: true,
      });
    } catch (conversionError) {
      if (currentSession !== sessionRef.current) return;
      if (uploadPath) await removeWordUpload(uploadPath).catch(() => {});
      const message =
        conversionError instanceof Error
          ? conversionError.message
          : "Conversion failed. Please try again.";
      setError(message);
      setStage("error");
      setStatusLabel("");
      track({
        eventName: "processing_failed",
        toolSlug: "word-to-pdf",
        durationMs: performance.now() - startedAt,
        success: false,
        errorCode: "processing_error",
      });
    }
  }

  function handleDownload() {
    if (!result) return;
    track({ eventName: "download_started", toolSlug: "word-to-pdf" });
    downloadBlob(result.blob, result.fileName);
  }

  const isBusy = stage === "uploading" || stage === "converting";

  const uploadArea = (
    <div className="mx-auto w-full max-w-[1040px]">
      <L2UploadStage
        inputId="word-to-pdf-upload"
        title="Drop your Word document here"
        description="or choose a file from your device"
        acceptedNote="DOCX or DOC · One file · up to 1.5MB while we add more capacity"
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
      <section className="l2-tool-empty-state grid gap-4 pb-4 lg:pb-0">
        {uploadArea}
        <ServerPrivacyNote />
        {error ? (
          <div role="alert" className="mt-4 flex items-center gap-2 rounded-lg border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
            <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
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
            <div className="mb-1 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--lumeo-gold)]">
                  Word to PDF
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-primary)]/48">
                  Converted via free, self-hosted LibreOffice.
                </p>
              </div>
              <button
                type="button"
                onClick={resetTool}
                disabled={isBusy}
                className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/56 transition hover:border-[var(--text-primary)]/22 hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start new
              </button>
            </div>

            <div className="rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/74 px-3 py-2">
              <L2FileCard
                name={selected.file.name}
                meta={formatFileSize(selected.file.size)}
                icon={<FileText aria-hidden="true" className="h-6 w-6 text-[var(--text-accent)]" />}
                action={<AuraStatus tone={stage === "error" ? "danger" : "neutral"} label={statusLabel || "Ready"} />}
              />
            </div>

            {isBusy ? (
              <div className="flex items-center gap-3 rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/62 p-4">
                <Loader2 aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin text-[var(--text-accent)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">{statusLabel}</p>
              </div>
            ) : null}

            {stage === "success" && result ? (
              <div className="aura-success-reveal flex items-center gap-3 rounded-xl border border-[rgb(var(--emerald-rgb)/0.36)] bg-[var(--surface-success)] p-4">
                <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--text-success)]" />
                <div>
                  <p className="text-sm font-bold text-[var(--text-success)]">PDF ready</p>
                  <p className="mt-0.5 text-xs text-[var(--text-primary)]/56">{result.fileName} · {formatFileSize(result.blob.size)}</p>
                </div>
              </div>
            ) : null}

            {error ? (
              <div role="alert" className="flex items-center gap-2 rounded-xl border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 px-3 py-2 text-sm text-[var(--text-danger)]">
                <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                {error}
              </div>
            ) : null}
          </div>
        </L2ToolMainColumn>

        <L2ToolSettingsPanel
          title="Convert to PDF"
          description="Your document is uploaded securely, converted on our server, and deleted immediately after."
        >
          <div className="flex h-full min-h-0 flex-col justify-end">
            {result ? (
              <L2ActionArea
                primary={
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] shadow-[var(--shadow-success)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98]"
                  >
                    <FileDown aria-hidden="true" className="h-4 w-4" />
                    Download PDF
                  </button>
                }
                secondary={
                  <button
                    type="button"
                    onClick={resetTool}
                    className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--text-primary)]/12 px-5 text-sm font-bold text-[var(--text-primary)]/62 transition hover:border-[var(--lumeo-gold)]/30 hover:text-[var(--text-primary)]"
                  >
                    Convert another
                  </button>
                }
              />
            ) : (
              <button
                type="button"
                disabled={isBusy}
                onClick={handleConvert}
                className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] shadow-[var(--shadow-success)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isBusy ? (
                  <>
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    {statusLabel}
                  </>
                ) : error ? (
                  "Retry conversion"
                ) : (
                  "Convert to PDF"
                )}
              </button>
            )}
          </div>
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>
    </section>
  );
}
