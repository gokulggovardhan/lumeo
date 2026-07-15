"use client";

import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { useId, useRef, useState } from "react";
import {
  AuraButton,
  AuraCard,
  AuraFileCard,
  AuraNotice,
  AuraPanel,
  AuraResultCard,
  AuraSectionHeader,
  AuraSegmentedControl,
  AuraStatus,
  AuraUploadSurface,
} from "@/components/ui/Aura";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function ToolWorkspaceShell({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="aura-tool-workspace-shell mx-auto grid min-h-[70dvh] w-full max-w-[var(--container-wide)] gap-5 px-[var(--page-gutter)] py-5">
      <ToolStepHeader title={title} description={description} action={action} />
      <div className="aura-tool-workspace-layout grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.75fr)]">
        {children}
      </div>
      <ToolPrivacyNote />
    </section>
  );
}

export function ToolStepHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className="aura-text-label text-[var(--lumeo-gold-300)]">Lumeo tool workspace</p>
        <h1 className="mt-2 font-serif text-[var(--text-heading-xl)] leading-[var(--leading-heading)] text-[var(--lumeo-paper-50)]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--lumeo-paper-400)]">
          {description}
        </p>
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}

export function ToolUploadStage({
  title = "Drop PDFs here",
  description = "or choose files from your device",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <AuraUploadSurface
      title={title}
      description={description}
      supportedTypes="PDF documents"
      privacyNote="Private by design · Browser-only"
      multiple
      action={action ?? <AuraButton>Select files</AuraButton>}
    />
  );
}

export function ToolSettingsStage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AuraPanel className="aura-tool-workspace-inspector">
      <AuraSectionHeader title={title} description="Primary options first. Advanced controls appear only when useful." />
      <div className="mt-5 grid gap-3">{children}</div>
    </AuraPanel>
  );
}

export function ToolProcessingStage({ label = "Processing in your browser" }: { label?: string }) {
  return (
    <AuraNotice tone="info" title={label}>
      Lumeo keeps the interface responsive and does not show fake progress.
    </AuraNotice>
  );
}

export function ToolResultStage({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <AuraCard className="aura-success-reveal">
      <AuraStatus tone="success" label={title} />
      <div className="mt-4 text-sm leading-6 text-[var(--lumeo-paper-400)]">{children}</div>
      {action ? <div className="mt-5">{action}</div> : null}
    </AuraCard>
  );
}

export function ToolPrivacyNote({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cx("rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] px-4 py-2 text-center text-xs font-bold text-[var(--lumeo-paper-400)]", compact && "inline-flex")}>
      Private by design · Browser-only · Cleared after download
    </div>
  );
}

export function ToolActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-3 z-10 rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--lumeo-ink-850)] p-3 shadow-[var(--shadow-lg)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">{children}</div>
    </div>
  );
}

export function ToolDocumentSummary({ title, details }: { title: string; details: string[] }) {
  return (
    <AuraCard className="aura-tool-workspace-main">
      <p className="truncate text-base font-black text-[var(--lumeo-paper-50)]">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {details.map((detail) => <AuraStatus key={detail} tone="neutral" label={detail} />)}
      </div>
    </AuraCard>
  );
}

export function ToolModeCard({
  title,
  description,
  selected = false,
}: {
  title: string;
  description: string;
  selected?: boolean;
}) {
  return (
    <AuraCard interactive className={selected ? "border-[var(--border-selected)] bg-[var(--surface-selected)]" : ""}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-black text-[var(--lumeo-paper-50)]">{title}</p>
          <p className="mt-1 text-sm leading-6 text-[var(--lumeo-paper-400)]">{description}</p>
        </div>
        {selected ? <AuraStatus tone="success" label="Selected" /> : null}
      </div>
    </AuraCard>
  );
}

export function ToolOptionRow({
  title,
  description,
  control,
}: {
  title: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex min-h-14 flex-col justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.04)] p-3 sm:flex-row sm:items-center">
      <div>
        <p className="text-sm font-black text-[var(--lumeo-paper-50)]">{title}</p>
        {description ? <p className="mt-1 text-xs leading-5 text-[var(--lumeo-paper-400)]">{description}</p> : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function L2ToolPageHeader({
  title,
  description,
  categoryLabel = "PDF TOOL",
  privacy = "Browser-first · Files stay on your device",
  action,
}: {
  title: string;
  description: string;
  categoryLabel?: string;
  privacy?: string;
  action?: ReactNode;
}) {
  return (
    <header className="l2-tool-page-header lumeo-fade-up flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div className="max-w-3xl">
        <p className="aura-text-label text-[var(--text-accent)]">{categoryLabel}</p>
        <h1 className="mt-2.5 font-serif text-[2.35rem] leading-[0.94] tracking-[-0.04em] text-[var(--text-primary)] sm:text-[3rem]">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
          {description}
        </p>
        <p className="mt-3 inline-flex rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.055)] px-3 py-1.5 text-xs font-extrabold text-[var(--text-subtle)]">
          {privacy}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function L2ToolWorkspace({ children }: { children: ReactNode }) {
  return (
    <section className="l2-tool-workspace mx-auto grid w-full max-w-[1240px] gap-5">
      <div className="l2-tool-workspace-grid grid gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(330px,1fr)] xl:gap-7">
        {children}
      </div>
    </section>
  );
}

export function L2ToolMainColumn({ children }: { children: ReactNode }) {
  return <div className="l2-tool-main-column grid min-w-0 gap-5">{children}</div>;
}

export function L2ToolSettingsPanel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <aside className="l2-tool-settings-panel aura-luminous-card rounded-[var(--radius-2xl)] p-5 lg:sticky lg:top-24 lg:self-start">
      <AuraSectionHeader title={title} description={description} />
      <div className="mt-5 grid gap-4">{children}</div>
      {action ? <div className="l2-tool-action-area mt-5">{action}</div> : null}
    </aside>
  );
}

export function L2ToolSectionHeader({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h2 className="text-lg font-black text-[var(--text-primary)]">{title}</h2>
        {detail ? <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function L2UploadStage({
  title = "Drop PDFs here",
  description = "or choose files from your device",
  acceptedNote = "PDF documents",
  privacyNote = "Browser-first processing for supported live tools",
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
  const canSelect = Boolean(onFilesSelected) && !disabled && !loading;
  const isDragActive = dragActive || internalDragActive;

  function openFileChooser() {
    if (!canSelect) return;
    inputRef.current?.click();
    onActivate?.();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
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

  const defaultAction = (
    <button
      type="button"
      disabled={!canSelect}
      aria-controls={resolvedInputId}
      onClick={(event) => {
        event.stopPropagation();
        openFileChooser();
      }}
      className="lumeo-primary-action lumeo-press lumeo-focus-ring inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[linear-gradient(180deg,var(--emerald-500),var(--emerald-700))] px-6 py-3 text-sm font-extrabold text-[var(--text-on-accent)] shadow-[var(--shadow-success)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
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

export function L2FileList({ children }: { children: ReactNode }) {
  return <div className="l2-file-list grid gap-3">{children}</div>;
}

export function L2FileCard({
  name,
  meta,
  status,
  order,
  action,
  onRemove,
  removeLabel,
  onMoveUp,
  onMoveDown,
}: {
  name: string;
  meta: string;
  status?: string;
  order?: number;
  action?: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div className="l2-file-card flex min-w-0 items-center gap-3">
      {typeof order === "number" ? (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[rgba(var(--champagne-rgb),0.12)] text-xs font-black text-[var(--text-accent)]">
          {order}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <AuraFileCard
          name={name}
          meta={meta}
          status={status}
          action={action}
          onRemove={onRemove}
          removeLabel={removeLabel}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      </div>
    </div>
  );
}

export function L2DocumentProfile({
  title,
  details,
  status,
}: {
  title: string;
  details: Array<{ label: string; value: string }>;
  status?: string;
}) {
  return (
    <AuraCard className="l2-document-profile">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-base font-black text-[var(--text-primary)]">{title}</p>
          {status ? <p className="mt-1 text-xs font-bold text-[var(--text-success)]">{status}</p> : null}
        </div>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {details.map((detail) => (
          <div key={detail.label} className="rounded-[var(--radius-lg)] bg-[rgba(var(--paper-rgb),0.055)] p-3">
            <dt className="text-xs font-bold text-[var(--text-subtle)]">{detail.label}</dt>
            <dd className="mt-1 text-sm font-black text-[var(--text-primary)]">{detail.value}</dd>
          </div>
        ))}
      </dl>
    </AuraCard>
  );
}

export function L2SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="l2-settings-group rounded-[var(--radius-xl)] bg-[rgba(var(--paper-rgb),0.045)] p-4">
      <h3 className="text-sm font-black text-[var(--text-primary)]">{title}</h3>
      {description ? <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{description}</p> : null}
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

export function L2OptionRow({
  title,
  description,
  control,
}: {
  title: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="l2-option-row flex min-h-14 flex-col justify-between gap-3 rounded-[var(--radius-lg)] bg-[rgba(var(--paper-rgb),0.045)] p-3 sm:flex-row sm:items-center">
      <div>
        <p className="text-sm font-black text-[var(--text-primary)]">{title}</p>
        {description ? <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{description}</p> : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function L2ModeSelector({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return <AuraSegmentedControl label={label} options={options} value={value} onChange={onChange} className="l2-mode-selector" />;
}

export function L2AdvancedDisclosure({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="l2-advanced-disclosure rounded-[var(--radius-xl)] bg-[rgba(var(--paper-rgb),0.04)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--radius-xl)] px-4 py-3 text-left font-black text-[var(--text-primary)] transition hover:bg-[rgba(var(--paper-rgb),0.055)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.22)]"
      >
        <span>
          {title}
          {description ? <span className="mt-1 block text-xs font-bold leading-5 text-[var(--text-secondary)]">{description}</span> : null}
        </span>
        <span aria-hidden="true" className={cx("transition duration-[var(--motion-standard)]", open && "rotate-180")}>⌄</span>
      </button>
      {open ? <div className="aura-menu-reveal px-4 pb-4">{children}</div> : null}
    </section>
  );
}

export function L2ActionArea({
  primary,
  secondary,
  note,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  note?: string;
}) {
  return (
    <div className="l2-tool-action-area grid gap-3">
      <div className="grid gap-3">{primary}</div>
      {secondary ? <div className="flex flex-wrap gap-3">{secondary}</div> : null}
      {note ? <p className="text-xs font-bold leading-5 text-[var(--text-subtle)]">{note}</p> : null}
    </div>
  );
}

export function L2ProgressState({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <AuraNotice tone="info" title={title}>
      <div className="grid gap-3">
        {detail ? <p>{detail}</p> : null}
        <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[rgba(var(--paper-rgb),0.08)]">
          <span className="aura-progress-sheen block h-full w-2/5 rounded-full" />
        </div>
      </div>
    </AuraNotice>
  );
}

export function L2ResultState({
  title,
  details,
  primaryAction,
  secondaryAction,
  note = "Private by design · Browser-only · Cleared after download",
}: {
  title: string;
  details?: Array<{ label: string; value: string }>;
  primaryAction: ReactNode;
  secondaryAction?: ReactNode;
  note?: string;
}) {
  return (
    <AuraResultCard
      title={title}
      details={details}
      localMessage={note}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
    />
  );
}

export function L2PrivacyNote({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cx("l2-privacy-note rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.055)] px-4 py-2 text-center text-xs font-extrabold text-[var(--text-subtle)]", compact && "inline-flex")}>
      Private by design · Browser-only · Cleared after download
    </div>
  );
}
