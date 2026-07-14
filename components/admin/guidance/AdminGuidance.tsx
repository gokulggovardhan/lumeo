"use client";

import type { ReactNode } from "react";
import { AuraBadge, AuraCard, AuraNotice, AuraStatus } from "@/components/ui/Aura";

type RiskLevel = "low" | "medium" | "high" | "stored-only" | "requires-setup";

const riskTone: Record<RiskLevel, "success" | "warning" | "danger" | "planned" | "info"> = {
  low: "success",
  medium: "warning",
  high: "danger",
  "stored-only": "planned",
  "requires-setup": "info",
};

export function AdminWhatThisControls({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <AuraNotice tone="info" title={title}>
      {children}
    </AuraNotice>
  );
}

export function AdminImpactPreview({
  enabled,
  disabled,
}: {
  enabled: string;
  disabled: string;
}) {
  return (
    <AuraCard>
      <p className="text-sm font-black text-[var(--lumeo-paper-50)]">Impact preview</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-[rgba(var(--lumeo-seal-rgb),0.28)] bg-[rgba(var(--lumeo-seal-rgb),0.09)] p-3">
          <AuraStatus tone="success" label="Enabled" />
          <p className="mt-2 text-sm leading-6 text-[var(--lumeo-paper-200)]">{enabled}</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.04)] p-3">
          <AuraStatus tone="unavailable" label="Disabled" />
          <p className="mt-2 text-sm leading-6 text-[var(--lumeo-paper-400)]">{disabled}</p>
        </div>
      </div>
    </AuraCard>
  );
}

export function AdminDependencyList({ items }: { items: string[] }) {
  return (
    <AuraCard>
      <p className="text-sm font-black text-[var(--lumeo-paper-50)]">Dependencies</p>
      <ul className="mt-3 grid gap-2 text-sm text-[var(--lumeo-paper-400)]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--lumeo-gold-300)]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </AuraCard>
  );
}

export function AdminStoredOnlyNotice() {
  return (
    <AuraNotice tone="planned" title="Stored only">
      This setting is saved in the Control Center but does not change public runtime behaviour until a later wiring phase.
    </AuraNotice>
  );
}

export function AdminRiskIndicator({ level, label }: { level: RiskLevel; label?: string }) {
  return <AuraStatus tone={riskTone[level]} label={label ?? level.replace("-", " ")} />;
}

export function AdminChangeSummary({ changes }: { changes: Array<{ label: string; value: string }> }) {
  return (
    <AuraCard>
      <p className="text-sm font-black text-[var(--lumeo-paper-50)]">Change summary</p>
      <dl className="mt-3 grid gap-2">
        {changes.map((change) => (
          <div key={change.label} className="flex justify-between gap-4 rounded-[var(--radius-md)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] px-3 py-2">
            <dt className="text-sm text-[var(--lumeo-paper-400)]">{change.label}</dt>
            <dd className="text-right text-sm font-bold text-[var(--lumeo-paper-50)]">{change.value}</dd>
          </div>
        ))}
      </dl>
    </AuraCard>
  );
}

export function AdminGuideLink({ href = "/admin/design-system", label = "Open design guidance" }: { href?: string; label?: string }) {
  return (
    <a href={href} className="inline-flex min-h-10 items-center rounded-[var(--radius-pill)] border border-[var(--border-premium)] px-4 text-sm font-extrabold text-[var(--lumeo-gold-300)] transition hover:bg-[rgba(var(--lumeo-gold-rgb),0.12)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.2)]">
      {label}
    </a>
  );
}

export function AdminSettingExplanation({
  title,
  runtime,
  deployment,
  history,
}: {
  title: string;
  runtime: string;
  deployment: string;
  history: string;
}) {
  return (
    <AuraCard>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-black text-[var(--lumeo-paper-50)]">{title}</p>
        <AuraBadge tone="info">Explainer</AuraBadge>
      </div>
      <div className="mt-3 grid gap-2 text-sm text-[var(--lumeo-paper-400)]">
        <p><strong className="text-[var(--lumeo-paper-100)]">Runtime:</strong> {runtime}</p>
        <p><strong className="text-[var(--lumeo-paper-100)]">Deployment:</strong> {deployment}</p>
        <p><strong className="text-[var(--lumeo-paper-100)]">History:</strong> {history}</p>
      </div>
    </AuraCard>
  );
}
