"use client";

import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ComponentProps,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "planned" | "unavailable";
type ButtonVariant = "primary" | "secondary" | "ghost" | "premium" | "danger" | "success" | "icon";
type Size = "sm" | "md" | "lg";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const toneClasses: Record<Tone, string> = {
  neutral: "border-[var(--border-default)] bg-[rgba(var(--paper-rgb),0.06)] text-[var(--text-secondary)]",
  success: "border-[rgba(var(--emerald-rgb),0.36)] bg-[var(--surface-success)] text-[var(--text-success)]",
  warning: "border-[rgba(var(--champagne-rgb),0.4)] bg-[rgba(var(--champagne-rgb),0.12)] text-[var(--text-warning)]",
  danger: "border-[var(--border-danger)] bg-[var(--surface-danger)] text-[var(--text-danger)]",
  info: "border-[rgba(var(--sky-rgb),0.38)] bg-[rgba(var(--sky-rgb),0.12)] text-[var(--text-info)]",
  planned: "border-[rgba(var(--paper-rgb),0.16)] bg-[rgba(var(--paper-rgb),0.07)] text-[var(--text-secondary)]",
  unavailable: "border-[rgba(var(--paper-rgb),0.12)] bg-[rgba(var(--paper-rgb),0.035)] text-[var(--text-subtle)]",
};

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border-[rgba(var(--emerald-rgb),0.58)] bg-[linear-gradient(180deg,var(--emerald-400),var(--emerald-600))] text-[var(--text-on-accent)] shadow-[0_16px_38px_rgba(var(--emerald-rgb),0.28),inset_0_1px_0_rgba(255,253,248,0.22)] hover:brightness-110",
  secondary: "border-[var(--border-hairline)] bg-[var(--surface-interactive)] text-[var(--text-primary)] shadow-[var(--shadow-xs)] hover:border-[var(--border-default)] hover:bg-[rgba(var(--paper-rgb),0.12)]",
  ghost: "border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[rgba(var(--paper-rgb),0.06)]",
  premium: "border-[rgba(var(--champagne-rgb),0.34)] bg-[linear-gradient(180deg,rgba(var(--champagne-rgb),0.16),rgba(var(--champagne-rgb),0.075))] text-[var(--text-accent)] hover:bg-[rgba(var(--champagne-rgb),0.18)]",
  danger: "border-[var(--border-danger)] bg-[var(--surface-danger)] text-[var(--text-danger)] hover:bg-[rgba(var(--ruby-rgb),0.2)]",
  success: "border-[var(--border-selected)] bg-[var(--surface-success)] text-[var(--text-success)] shadow-[var(--shadow-success)] hover:bg-[rgba(var(--emerald-rgb),0.18)]",
  icon: "min-w-11 border-[var(--border-default)] bg-[rgba(var(--paper-rgb),0.07)] px-0 text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:bg-[rgba(var(--paper-rgb),0.12)]",
};

const sizeClasses: Record<Size, string> = {
  sm: "min-h-10 px-3 text-sm",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

export function AuraButton({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cx(
        "lumeo2-button-press inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border font-extrabold transition duration-[var(--motion-standard)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.22)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
        buttonVariants[variant],
        sizeClasses[size],
        className,
      )}
    >
      {loading ? <span aria-hidden="true" className="h-4 w-4 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" /> : null}
      {children}
    </button>
  );
}

export function AuraIconButton({
  label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={cx(
        "lumeo2-button-press inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[rgba(var(--paper-rgb),0.07)] text-[var(--text-secondary)] transition duration-[var(--motion-standard)] hover:border-[var(--border-premium)] hover:bg-[rgba(var(--paper-rgb),0.12)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.22)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function AuraSurface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("aura-surface rounded-[var(--radius-2xl)]", className)} />;
}

export function AuraCard({ className, interactive = false, ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      {...props}
      className={cx(
        "aura-luminous-card rounded-[var(--radius-xl)] p-5 transition duration-[var(--motion-standard)]",
        interactive && "lumeo2-soft-card-lift focus-within:shadow-[var(--shadow-focus)]",
        className,
      )}
    />
  );
}

export function AuraPanel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={cx("aura-luminous-card rounded-[var(--radius-2xl)] p-6", className)} />;
}

function fieldClass(className?: string) {
  return cx(
    "min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm font-semibold text-[var(--lumeo-paper-50)] placeholder:text-[var(--lumeo-paper-400)] transition duration-[var(--motion-standard)] focus:border-[var(--border-focus)] focus:outline-none focus:ring-4 focus:ring-[rgba(var(--lumeo-aura-rgb),0.14)] disabled:cursor-not-allowed disabled:opacity-60",
    className,
  );
}

export function AuraFormField({
  label,
  description,
  error,
  children,
  className,
}: {
  label: string;
  description?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("grid gap-2", className)}>
      <div>
        <p className="text-sm font-extrabold text-[var(--lumeo-paper-50)]">{label}</p>
        {description ? <p className="mt-1 text-xs leading-5 text-[var(--lumeo-paper-400)]">{description}</p> : null}
      </div>
      {children}
      {error ? <p aria-live="polite" className="text-xs font-bold text-[var(--lumeo-danger)]">{error}</p> : null}
    </div>
  );
}

export function AuraInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={fieldClass(props.className)} />;
}

export function AuraSearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <AuraInput {...props} type={props.type ?? "search"} className={cx("pl-4", props.className)} />;
}

export function AuraTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldClass(props.className), "min-h-28 py-3 leading-6")} />;
}

export function AuraSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={fieldClass(props.className)} />;
}

export function AuraCheckbox({
  label,
  description,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  return (
    <label className={cx("flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-3 transition hover:border-[var(--border-premium)]", className)}>
      <input {...props} type="checkbox" className="mt-1 h-4 w-4 accent-[var(--lumeo-seal-500)]" />
      <span>
        <span className="block text-sm font-extrabold text-[var(--lumeo-paper-50)]">{label}</span>
        {description ? <span className="mt-1 block text-xs leading-5 text-[var(--lumeo-paper-400)]">{description}</span> : null}
      </span>
    </label>
  );
}

export function AuraSwitch({
  checked,
  onCheckedChange,
  label,
  description,
  impact,
  disabledReason,
  className,
}: {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label: string;
  description?: string;
  impact?: string;
  disabledReason?: string;
  className?: string;
}) {
  const disabled = Boolean(disabledReason);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cx("flex min-h-11 w-full items-center justify-between gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-3 text-left transition hover:border-[var(--border-premium)] disabled:cursor-not-allowed disabled:opacity-60", className)}
    >
      <span>
        <span className="block text-sm font-extrabold text-[var(--lumeo-paper-50)]">{label}</span>
        {description ? <span className="mt-1 block text-xs leading-5 text-[var(--lumeo-paper-400)]">{description}</span> : null}
        {impact || disabledReason ? <span className="mt-1 block text-xs font-bold text-[var(--lumeo-gold-300)]">{disabledReason ?? impact}</span> : null}
      </span>
      <span className={cx("relative h-7 w-12 shrink-0 rounded-full border transition", checked ? "border-[rgba(var(--emerald-rgb),0.62)] bg-[var(--emerald-500)]" : "border-[var(--border-default)] bg-[var(--canvas-750)]")}>
        <span aria-hidden="true" className={cx("absolute left-2 top-1 text-[10px] font-black text-[var(--text-on-accent)] transition-opacity", checked ? "opacity-100" : "opacity-0")}>✓</span>
        <span className={cx("lumeo2-switch-slide absolute top-1 h-5 w-5 rounded-full bg-[var(--paper-50)] shadow-[var(--shadow-xs)]", checked ? "translate-x-6" : "translate-x-1")} />
      </span>
    </button>
  );
}

export function AuraRadioGroup({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: Array<{ value: string; label: string; description?: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <fieldset className={cx("grid gap-2", className)}>
      <legend className="text-sm font-extrabold text-[var(--lumeo-paper-50)]">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className="flex min-h-11 cursor-pointer gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.04)] p-3">
          <input type="radio" name={label} checked={value === option.value} onChange={() => onChange(option.value)} className="mt-1 accent-[var(--lumeo-seal-500)]" />
          <span>
            <span className="block text-sm font-bold text-[var(--lumeo-paper-50)]">{option.label}</span>
            {option.description ? <span className="mt-1 block text-xs text-[var(--lumeo-paper-400)]">{option.description}</span> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function AuraSegmentedControl({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const currentIndex = Math.max(0, options.findIndex((option) => option.value === value));
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const lastIndex = options.length - 1;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? lastIndex
          : event.key === "ArrowLeft"
            ? Math.max(0, currentIndex - 1)
            : Math.min(lastIndex, currentIndex + 1);
    onChange(options[nextIndex]?.value ?? value);
  }
  return (
    <div className={className}>
      <p className="mb-2 text-sm font-extrabold text-[var(--lumeo-paper-50)]">{label}</p>
      <div role="radiogroup" aria-label={label} onKeyDown={handleKeyDown} className="relative flex overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-hairline)] bg-[rgba(var(--paper-rgb),0.05)] p-1">
        <span aria-hidden="true" className="lumeo2-segmented-indicator absolute bottom-1 top-1 rounded-[var(--radius-md)] bg-[var(--surface-selected)]" style={{ left: `calc(${currentIndex} * (100% / ${options.length}) + 0.25rem)`, width: `calc((100% - 0.5rem) / ${options.length})` }} />
        {options.map((option) => (
          <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)} className="relative z-10 min-h-10 flex-1 whitespace-nowrap rounded-[var(--radius-md)] px-4 text-sm font-extrabold text-[var(--lumeo-paper-100)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]">
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AuraTabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ value: string; label: string; content: ReactNode }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const selected = tabs.find((tab) => tab.value === value) ?? tabs[0];
  return (
    <div className={className}>
      <AuraSegmentedControl label="Tabs" options={tabs.map(({ value: tabValue, label }) => ({ value: tabValue, label }))} value={selected.value} onChange={onChange} />
      <div className="mt-4">{selected.content}</div>
    </div>
  );
}

export function AuraBadge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span {...props} className={cx("inline-flex items-center rounded-[var(--radius-pill)] border px-2.5 py-1 text-xs font-extrabold", toneClasses[tone], className)} />;
}

export function AuraStatus({ tone = "neutral", label }: { tone?: Tone; label: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-2.5 py-1 text-xs font-extrabold", toneClasses[tone])}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function AuraTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-floating)] px-2 py-1 text-xs font-bold text-[var(--lumeo-ink-950)] shadow-[var(--shadow-floating)] group-hover:block group-focus-within:block">
        {label}
      </span>
    </span>
  );
}

export function AuraPopover({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex">
      <span onClick={() => setOpen((value) => !value)}>{trigger}</span>
      {open ? <div className="aura-menu-reveal absolute right-0 top-full z-30 mt-2 min-w-64 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--lumeo-ink-850)] p-3 shadow-[var(--shadow-lg)]">{children}</div> : null}
    </div>
  );
}

export function AuraDropdown({
  label,
  items,
}: {
  label: string;
  items: Array<{ label: string; onSelect: () => void; description?: string }>;
}) {
  return (
    <AuraPopover trigger={<AuraButton variant="secondary">{label}</AuraButton>}>
      <div className="grid gap-1">
        {items.map((item) => (
          <button key={item.label} type="button" onClick={item.onSelect} className="rounded-[var(--radius-lg)] px-3 py-2 text-left transition hover:bg-[rgba(var(--lumeo-paper-rgb),0.07)]">
            <span className="block text-sm font-extrabold text-[var(--lumeo-paper-50)]">{item.label}</span>
            {item.description ? <span className="text-xs text-[var(--lumeo-paper-400)]">{item.description}</span> : null}
          </button>
        ))}
      </div>
    </AuraPopover>
  );
}

export function AuraDialog({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="aura-dialog-title" className="fixed inset-0 z-50 grid place-items-center bg-[var(--surface-overlay)] p-4">
      <div className="aura-scale-in w-full max-w-lg rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--lumeo-ink-850)] p-6 shadow-[var(--shadow-xl)]">
        <div className="flex items-center justify-between gap-4">
          <h2 id="aura-dialog-title" className="text-xl font-extrabold text-[var(--lumeo-paper-50)]">{title}</h2>
          <AuraIconButton label="Close dialog" onClick={onClose}>×</AuraIconButton>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function AuraDrawer({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <aside role="dialog" aria-modal="true" aria-labelledby="aura-drawer-title" className="fixed inset-0 z-50 bg-[var(--surface-overlay)]">
      <div className="aura-drawer-enter ml-auto h-full w-full max-w-md border-l border-[var(--border-subtle)] bg-[var(--lumeo-ink-850)] p-6 shadow-[var(--shadow-xl)]">
        <div className="flex items-center justify-between gap-4">
          <h2 id="aura-drawer-title" className="text-xl font-extrabold text-[var(--lumeo-paper-50)]">{title}</h2>
          <AuraIconButton label="Close drawer" onClick={onClose}>×</AuraIconButton>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </aside>
  );
}

export function AuraToast({ tone = "info", title, message }: { tone?: Tone; title: string; message?: string }) {
  return (
    <div role="status" className={cx("rounded-[var(--radius-xl)] border p-4 shadow-[var(--shadow-md)]", toneClasses[tone])}>
      <p className="font-extrabold">{title}</p>
      {message ? <p className="mt-1 text-sm opacity-80">{message}</p> : null}
    </div>
  );
}

export function AuraProgress({ value, label }: { value: number; label: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs font-bold text-[var(--lumeo-paper-400)]">
        <span>{label}</span>
        <span>{safeValue}%</span>
      </div>
      <div className="h-2 rounded-full bg-[rgba(var(--lumeo-paper-rgb),0.08)]">
        <div className="aura-progress-sheen h-full rounded-full" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

export function AuraSkeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("aura-shimmer min-h-10 rounded-[var(--radius-lg)] bg-[rgba(var(--lumeo-paper-rgb),0.07)]", className)} />;
}

export function AuraEmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <AuraCard className="grid place-items-center py-10 text-center">
      <div className="max-w-md">
        <h3 className="text-xl font-extrabold text-[var(--lumeo-paper-50)]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--lumeo-paper-400)]">{message}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </AuraCard>
  );
}

export function AuraNotice({ tone = "info", title, children }: { tone?: Tone; title: string; children?: ReactNode }) {
  return (
    <div className={cx("rounded-[var(--radius-xl)] border p-4", toneClasses[tone])}>
      <p className="font-extrabold">{title}</p>
      {children ? <div className="mt-2 text-sm leading-6 opacity-85">{children}</div> : null}
    </div>
  );
}

export function AuraMetric({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail?: string; tone?: Tone }) {
  return (
    <AuraCard>
      <AuraStatus tone={tone} label={label} />
      <p className="aura-tabular mt-4 text-3xl font-black text-[var(--lumeo-paper-50)]">{value}</p>
      {detail ? <p className="mt-2 text-sm text-[var(--lumeo-paper-400)]">{detail}</p> : null}
    </AuraCard>
  );
}

export function AuraTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-xl)] border border-[var(--border-subtle)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[rgba(var(--lumeo-paper-rgb),0.07)] text-xs uppercase tracking-[0.08em] text-[var(--lumeo-paper-400)]">
          <tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-extrabold">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.join("-") || index} className="border-t border-[var(--border-subtle)]">
              {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className="px-4 py-3 text-[var(--lumeo-paper-100)]">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuraPageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div>
        {eyebrow ? <p className="aura-text-label text-[var(--lumeo-gold-300)]">{eyebrow}</p> : null}
        <h1 className="mt-2 font-serif text-[var(--text-heading-xl)] leading-[var(--leading-heading)] text-[var(--lumeo-paper-50)]">{title}</h1>
        {description ? <p className="mt-3 max-w-3xl text-[var(--text-body-md)] leading-[var(--leading-body)] text-[var(--lumeo-paper-400)]">{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}

export function AuraSectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h2 className="text-lg font-black text-[var(--lumeo-paper-50)]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--lumeo-paper-400)]">{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function AuraBreadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-[var(--lumeo-paper-400)]">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-2">
          {index > 0 ? <span aria-hidden="true">/</span> : null}
          <span className={index === items.length - 1 ? "font-bold text-[var(--lumeo-paper-100)]" : ""}>{item.label}</span>
        </span>
      ))}
    </nav>
  );
}

export function AuraCommandMenu({ placeholder = "Search commands..." }: { placeholder?: string }) {
  return <AuraSearchInput aria-label="Command search" placeholder={placeholder} />;
}

export function AuraUploadSurface({
  title,
  description,
  supportedTypes,
  privacyNote,
  icon,
  action,
  dragActive = false,
  loading = false,
  error,
  multiple = false,
  onActivate,
}: {
  title: string;
  description: string;
  supportedTypes?: string;
  privacyNote?: string;
  icon?: ReactNode;
  action?: ReactNode;
  dragActive?: boolean;
  loading?: boolean;
  error?: string;
  multiple?: boolean;
  onActivate?: () => void;
}) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!onActivate || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onActivate();
  }

  return (
    <div
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : undefined}
      aria-busy={loading || undefined}
      aria-invalid={Boolean(error) || undefined}
      aria-label={onActivate ? `${title}. ${description}` : undefined}
      data-multiple={multiple ? "true" : "false"}
      onClick={onActivate}
      onKeyDown={handleKeyDown}
      className={cx(
        "lumeo-upload-surface aura-luminous-card rounded-[var(--radius-2xl)] p-8 text-center shadow-[var(--shadow-lg)] transition duration-200 hover:shadow-[var(--shadow-xl)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)]",
        dragActive && "lumeo2-drag-highlight border-[var(--border-focus)] bg-[rgba(var(--sky-rgb),0.08)]",
        onActivate && "cursor-pointer",
      )}
    >
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-[var(--radius-xl)] bg-[linear-gradient(145deg,rgba(var(--sky-rgb),0.18),rgba(var(--champagne-rgb),0.11))] text-[var(--text-info)] shadow-[inset_0_1px_0_rgba(255,253,248,0.16)]">
        {loading ? <span aria-hidden="true" className="h-5 w-5 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" /> : icon ?? "PDF"}
      </div>
      <h3 className="mt-4 text-xl font-black text-[var(--text-primary)]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
      {supportedTypes ? <p className="mt-3 text-xs font-bold text-[var(--text-subtle)]">{supportedTypes}</p> : null}
      {privacyNote ? <p className="mx-auto mt-2 max-w-md text-xs font-bold text-[var(--text-accent)]">{privacyNote}</p> : null}
      {error ? <p aria-live="polite" className="mx-auto mt-3 max-w-md text-xs font-bold text-[var(--text-danger)]">{error}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function AuraFileCard({
  name,
  meta,
  status,
  action,
  onRemove,
  removeLabel,
  onMoveUp,
  onMoveDown,
  moveUpLabel,
  moveDownLabel,
}: {
  name: string;
  meta: string;
  status?: string;
  action?: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  moveUpLabel?: string;
  moveDownLabel?: string;
}) {
  return (
    <div className="lumeo2-soft-card-lift flex min-h-16 items-center justify-between gap-4 rounded-[var(--radius-xl)] bg-[rgba(var(--paper-rgb),0.06)] p-3 shadow-[inset_0_1px_0_rgba(255,253,248,0.06)] transition hover:bg-[rgba(var(--paper-rgb),0.09)]">
      <div aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-lg)] bg-[rgba(var(--champagne-rgb),0.11)] text-xs font-black text-[var(--text-accent)]">PDF</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-[var(--lumeo-paper-50)]">{name}</p>
        <p className="mt-1 text-xs text-[var(--lumeo-paper-400)]">{meta}</p>
        {status ? <p className="mt-1 text-xs font-bold text-[var(--text-success)]">{status}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onMoveUp ? <AuraIconButton label={moveUpLabel ?? `Move ${name} up`} onClick={onMoveUp}>↑</AuraIconButton> : null}
        {onMoveDown ? <AuraIconButton label={moveDownLabel ?? `Move ${name} down`} onClick={onMoveDown}>↓</AuraIconButton> : null}
        {onRemove ? <AuraIconButton label={removeLabel ?? `Remove ${name}`} onClick={onRemove}>×</AuraIconButton> : null}
        {action ? <div>{action}</div> : null}
      </div>
    </div>
  );
}

export function AuraResultCard({
  tone = "success",
  title,
  details,
  localMessage,
  children,
  action,
  primaryAction,
  secondaryAction,
}: {
  tone?: Tone;
  title: string;
  details?: Array<{ label: string; value: string }>;
  localMessage?: string;
  children?: ReactNode;
  action?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
}) {
  return (
    <AuraCard className="aura-success-reveal">
      <AuraStatus tone={tone} label={title} />
      {details?.length ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {details.map((detail) => (
            <div key={detail.label} className="rounded-[var(--radius-lg)] bg-[rgba(var(--paper-rgb),0.055)] p-3">
              <dt className="text-xs font-bold text-[var(--text-subtle)]">{detail.label}</dt>
              <dd className="mt-1 font-black text-[var(--text-primary)]">{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children ? <div className="mt-4 text-sm leading-6 text-[var(--lumeo-paper-200)]">{children}</div> : null}
      {localMessage ? <p className="mt-4 text-xs font-bold text-[var(--text-accent)]">{localMessage}</p> : null}
      {action || primaryAction || secondaryAction ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {primaryAction}
          {secondaryAction}
          {action}
        </div>
      ) : null}
    </AuraCard>
  );
}

type L2ToolCardData = {
  toolName: string;
  shortDescription: string;
  route: string;
  iconKey: string;
  status?: string;
};

function L2Arrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
      <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function L2ToolIcon({ iconKey }: { iconKey: string }) {
  const label = iconKey === "all" ? "All" : "PDF";
  return (
    <span aria-hidden="true" className="lumeo-card-icon grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-lg)] bg-[linear-gradient(145deg,rgba(var(--champagne-rgb),0.16),rgba(var(--sky-rgb),0.08))] text-xs font-black text-[var(--text-accent)] shadow-[inset_0_1px_0_rgba(255,253,248,0.12)]">
      {label}
    </span>
  );
}

export function L2PublicHeader({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <header
      {...props}
      className={cx(
        "l2-public-header sticky top-0 z-40 px-4 py-3 sm:px-6",
        className,
      )}
    >
      <div className="mx-auto max-w-[var(--container-wide)] rounded-[var(--radius-xl)] bg-[linear-gradient(180deg,rgba(22,39,64,0.88),rgba(8,17,31,0.78))] px-3 shadow-[0_18px_50px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,253,248,0.09)] backdrop-blur-xl">
        {children}
      </div>
    </header>
  );
}

export function L2PublicNavLink({
  active = false,
  className,
  ...props
}: { active?: boolean } & ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      aria-current={active ? "page" : props["aria-current"]}
      className={cx(
        "inline-flex min-h-11 items-center rounded-[var(--radius-md)] px-3 text-sm font-extrabold text-[var(--text-secondary)] transition hover:bg-[rgba(var(--paper-rgb),0.075)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)]",
        active && "bg-[rgba(var(--paper-rgb),0.08)] text-[var(--text-primary)]",
        className,
      )}
    />
  );
}

export function L2MenuSurface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cx(
        "l2-menu-surface rounded-[var(--radius-2xl)] bg-[var(--surface-floating)] p-3 shadow-[var(--shadow-xl)] ring-1 ring-[var(--border-hairline)]",
        className,
      )}
    />
  );
}

function L2ToolCardInner({
  tool,
  action,
  featured = false,
  allTools = false,
}: {
  tool: L2ToolCardData;
  action: string;
  featured?: boolean;
  allTools?: boolean;
}) {
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(var(--champagne-rgb),0.48)] to-transparent opacity-70" />
      <div className="flex items-start justify-between gap-4">
        <L2ToolIcon iconKey={tool.iconKey} />
        {tool.status && tool.status !== "active" ? <AuraStatus tone="planned" label={tool.status === "beta" ? "Beta" : "Soon"} /> : null}
      </div>
      <div className="mt-5 flex flex-1 flex-col">
        <h2 className={cx("font-black tracking-[-0.025em] text-[var(--text-primary)]", featured ? "text-2xl sm:text-3xl" : "text-xl")}>{tool.toolName}</h2>
        <p className={cx("mt-2 leading-6 text-[var(--text-secondary)]", featured ? "max-w-xl text-base" : "text-sm")}>{tool.shortDescription}</p>
        <span className={cx("lumeo-arrow mt-auto inline-flex items-center gap-2 pt-6 text-sm font-black", allTools ? "text-[var(--text-info)]" : "text-[var(--text-accent)]")}>
          {action}
          <span className="transition group-hover:translate-x-1 motion-reduce:transform-none"><L2Arrow /></span>
        </span>
      </div>
    </>
  );
}

export function L2FeaturedToolCard({ tool, className }: { tool: L2ToolCardData; className?: string }) {
  return (
    <Link
      href={tool.route}
      aria-label={`Open ${tool.toolName}`}
      className={cx(
        "l2-featured-tool-card lumeo-card aura-luminous-card group relative flex min-h-[16rem] flex-col overflow-hidden rounded-[var(--radius-2xl)] p-6 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)] motion-reduce:transform-none sm:p-7 lg:col-span-2",
        className,
      )}
    >
      <L2ToolCardInner tool={tool} action="Open tool" featured />
    </Link>
  );
}

export function L2ToolCard({ tool, allTools = false, className }: { tool: L2ToolCardData; allTools?: boolean; className?: string }) {
  return (
    <Link
      href={tool.route}
      aria-label={allTools ? "Browse all PDF tools" : `Open ${tool.toolName}`}
      className={cx(
        "l2-tool-card lumeo-card aura-luminous-card group relative flex min-h-[13rem] flex-col overflow-hidden rounded-[var(--radius-2xl)] p-5 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)] motion-reduce:transform-none",
        allTools && "bg-[linear-gradient(180deg,rgba(var(--sky-rgb),0.12),rgba(var(--paper-rgb),0.045))]",
        className,
      )}
    >
      <L2ToolCardInner tool={tool} action={allTools ? "Browse all tools" : "Open tool"} allTools={allTools} />
    </Link>
  );
}

export function L2DirectoryToolCard({ tool, className }: { tool: L2ToolCardData; className?: string }) {
  return (
    <Link
      href={tool.route}
      aria-label={`Open ${tool.toolName}`}
      className={cx(
        "l2-directory-tool-card group flex min-h-40 flex-col rounded-[var(--radius-xl)] bg-[rgba(var(--paper-rgb),0.055)] p-4 shadow-[inset_0_1px_0_rgba(255,253,248,0.06)] transition hover:-translate-y-[2px] hover:bg-[rgba(var(--paper-rgb),0.08)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.18)] motion-reduce:transform-none",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <L2ToolIcon iconKey={tool.iconKey} />
        {tool.status && tool.status !== "active" ? <AuraStatus tone="planned" label={tool.status === "beta" ? "Beta" : "Soon"} /> : null}
      </div>
      <h3 className="mt-4 text-base font-black text-[var(--text-primary)]">{tool.toolName}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{tool.shortDescription}</p>
      <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-black text-[var(--text-accent)]">
        Open workspace <span className="transition group-hover:translate-x-1 motion-reduce:transform-none"><L2Arrow /></span>
      </span>
    </Link>
  );
}

export function L2TrustRail({ items, className }: { items: string[]; className?: string }) {
  return (
    <section className={cx("l2-trust-rail rounded-[var(--radius-2xl)] bg-[rgba(var(--paper-rgb),0.045)] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,253,248,0.06)]", className)} aria-label="Lumeo trust notes">
      <ul className="grid gap-3 text-sm font-bold text-[var(--text-secondary)] md:grid-cols-3">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-3">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--emerald-400)]" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function L2PublicFooter({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return <footer {...props} className={cx("l2-public-footer aura-public-footer", className)}>{children}</footer>;
}

export function L2PublicEmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <AuraEmptyState title={title} message={message} action={action} />;
}

export function L2PublicErrorState({ title, message, actions }: { title: string; message: string; actions?: ReactNode }) {
  return (
    <section className="l2-public-error-state aura-luminous-card mx-auto max-w-xl rounded-[var(--radius-2xl)] p-6 text-center">
      <AuraStatus tone="warning" label="Needs a refresh" />
      <h1 className="mt-4 text-3xl font-black tracking-[-0.03em] text-[var(--text-primary)]">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{message}</p>
      {actions ? <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </section>
  );
}

export function L2SkeletonCard({ featured = false }: { featured?: boolean }) {
  return (
    <div className={cx("l2-skeleton-card aura-shimmer rounded-[var(--radius-2xl)] bg-[rgba(var(--paper-rgb),0.055)] shadow-[var(--shadow-sm)]", featured ? "min-h-[16rem] lg:col-span-2" : "min-h-[13rem]")} />
  );
}

type TabsContextValue = { selected: string; setSelected: (value: string) => void };
const TabsContext = createContext<TabsContextValue | null>(null);

export function AuraTabsRoot({ defaultValue, children }: { defaultValue: string; children: ReactNode }) {
  const [selected, setSelected] = useState(defaultValue);
  return <TabsContext.Provider value={{ selected, setSelected }}>{children}</TabsContext.Provider>;
}

export function AuraTabsList({ items }: { items: Array<{ value: string; label: string }> }) {
  const context = useContext(TabsContext);
  if (!context) return null;
  return <AuraSegmentedControl label="Sections" options={items} value={context.selected} onChange={context.setSelected} />;
}

export function AuraTabsPanel({ value, children }: { value: string; children: ReactNode }) {
  const context = useContext(TabsContext);
  if (!context || context.selected !== value) return null;
  return <div className="mt-4">{children}</div>;
}

export function AuraLabeledControl({ label, children, className }: LabelHTMLAttributes<HTMLLabelElement> & { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx("grid gap-2 text-sm font-bold text-[var(--lumeo-paper-100)]", className)}>
      {label}
      {children}
    </label>
  );
}

export function useAuraInitialFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}
