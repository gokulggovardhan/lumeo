"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { LOCAL_FIRST_SHORT } from "@/lib/public-site/copy";
import { AuraUploadSurface } from "@/components/ui/Aura";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

// Intentionally keep the exact existing upload and privacy UI logic here.
// This module can load independently of the 30 KB ToolWorkspace collection.
export function ToolPrivacyNote({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cx("l2-tool-privacy-note mx-auto flex w-fit max-w-[560px] items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-raised)] px-4 py-2 text-center text-xs font-bold text-[var(--text-muted)] shadow-[inset_0_1px_0_rgba(255,253,248,0.07)]", compact && "inline-flex")}>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[var(--text-premium)]" fill="none">
        <path d="M8 2.5 12 4v3.1c0 2.6-1.5 4.9-4 6.1-2.5-1.2-4-3.5-4-6.1V4l4-1.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
      </svg>
      <span>{LOCAL_FIRST_SHORT}</span>
    </div>
  );
}

export function L2UploadStage({
  title = "Drop PDFs here",
  description = "or choose files from your device",
  acceptedNote = "PDF documents",
  // No default: L2PrivacyNote already states this once, right below the
  // upload stage on every tool page -- pass an explicit privacyNote only
  // if a specific page genuinely needs a distinct disclosure here.
  privacyNote,
  action,
  inputId,
  accept = "application/pdf,.pdf",
  multiple = true,
  disabled = false,
  icon,
  dragActive = false,
  loading = false,
  error,
  buttonLabel,
  onFilesSelected,
  onActivate,
}: {
  title?: string;
  description?: string;
  acceptedNote?: string;
  privacyNote?: string;
  action?: ReactNode;
  inputId?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  dragActive?: boolean;
  loading?: boolean;
  error?: string;
  buttonLabel?: string;
  onFilesSelected?: (files: FileList) => void;
  onActivate?: () => void;
}) {
  const generatedId = useId();
  const resolvedInputId = inputId ?? `lumeo-upload-${generatedId}`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const [internalDragActive, setInternalDragActive] = useState(false);

  useEffect(() => {
    // The hidden input is server-rendered before React has necessarily
    // attached its onChange handler. Automated production clients can set
    // files directly on that native input; this marker lets them wait until
    // the client handler is live so a synthetic file selection cannot be
    // lost during hydration. Normal pointer/label selection is unchanged.
    inputRef.current?.setAttribute("data-upload-client-ready", "true");
  }, []);
  const canSelect = Boolean(onFilesSelected) && !disabled && !loading;
  const isDragActive = dragActive || internalDragActive;

  function openFileChooser() {
    if (!canSelect) return;
    inputRef.current?.click();
    onActivate?.();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    // Snapshot before clearing: WebKit's FileList is live and may be emptied
    // when the input value is reset after the picker closes.
    const selectedFiles = event.currentTarget.files;
    if (selectedFiles?.length) onFilesSelected?.(selectedFiles);
    event.currentTarget.value = "";
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!canSelect) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setInternalDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!canSelect) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!internalDragActive) setInternalDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!canSelect) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setInternalDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!canSelect) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setInternalDragActive(false);
    if (event.dataTransfer.files.length) onFilesSelected?.(event.dataTransfer.files);
  }

  const defaultAction = canSelect ? (
    <label
      htmlFor={resolvedInputId}
       aria-controls={resolvedInputId}
      onClick={(event) => {
        // Pointer activation is native label -> input. Do not synthesize click().
        event.stopPropagation();
        onActivate?.();
      }}
      className="lumeo-primary-action lumeo-press lumeo-focus-ring inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-[var(--radius-md)] bg-[linear-gradient(180deg,var(--action-primary-hover),var(--action-primary-active))] px-6 py-3 text-sm font-extrabold text-[var(--text-on-accent)] shadow-[var(--shadow-success)] transition-all duration-[var(--v2-motion-normal)] hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98] sm:w-auto"
    >
      {buttonLabel ?? (multiple ? "Select PDFs" : "Select PDF")}
    </label>
  ) : (
    <button
      type="button"
      disabled
      className="lumeo-primary-action inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-[var(--radius-md)] px-6 py-3 text-sm font-extrabold opacity-[var(--v2-interactive-disabled-opacity)] sm:w-auto"
    >
      {buttonLabel ?? (multiple ? "Select PDFs" : "Select PDF")}
    </button>
  );

  return (
    <div
      className="l2-upload-stage"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {onFilesSelected ? (
        <input
          ref={inputRef}
          id={resolvedInputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled || loading}
          className="sr-only"
          onChange={handleInputChange}
        />
      ) : null}
      <AuraUploadSurface
        title={title}
        description={description}
        supportedTypes={acceptedNote}
        privacyNote={privacyNote}
        icon={icon}
        action={action ?? defaultAction}
        multiple={multiple}
        dragActive={isDragActive}
        loading={loading}
        error={error}
        onActivate={canSelect ? openFileChooser : onActivate}
      />
    </div>
  );
}

