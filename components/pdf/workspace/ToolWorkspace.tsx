"use client";

import type { ReactNode } from "react";
import {
  AuraButton,
  AuraCard,
  AuraNotice,
  AuraPanel,
  AuraSectionHeader,
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
