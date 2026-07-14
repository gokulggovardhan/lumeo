"use client";

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "planned" | "unavailable";
type ButtonVariant = "primary" | "secondary" | "ghost" | "premium" | "danger";
type Size = "sm" | "md" | "lg";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const toneClasses: Record<Tone, string> = {
  neutral: "border-[var(--border-default)] bg-[rgba(var(--lumeo-paper-rgb),0.06)] text-[var(--lumeo-paper-100)]",
  success: "border-[rgba(var(--lumeo-seal-rgb),0.36)] bg-[rgba(var(--lumeo-seal-rgb),0.13)] text-[var(--lumeo-seal-400)]",
  warning: "border-[rgba(var(--lumeo-gold-rgb),0.4)] bg-[rgba(var(--lumeo-gold-rgb),0.12)] text-[var(--lumeo-gold-300)]",
  danger: "border-[rgba(217,113,113,0.42)] bg-[rgba(217,113,113,0.12)] text-[var(--lumeo-danger)]",
  info: "border-[rgba(var(--lumeo-aura-rgb),0.38)] bg-[rgba(var(--lumeo-aura-rgb),0.12)] text-[var(--lumeo-aura-300)]",
  planned: "border-[rgba(var(--lumeo-paper-rgb),0.16)] bg-[rgba(var(--lumeo-paper-rgb),0.07)] text-[var(--lumeo-paper-200)]",
  unavailable: "border-[rgba(var(--lumeo-paper-rgb),0.12)] bg-[rgba(var(--lumeo-paper-rgb),0.035)] text-[var(--lumeo-paper-400)]",
};

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border-[rgba(var(--lumeo-seal-rgb),0.55)] bg-[var(--lumeo-seal-500)] text-[var(--lumeo-paper-50)] shadow-[var(--shadow-success)] hover:bg-[var(--lumeo-seal-400)]",
  secondary: "border-[var(--border-default)] bg-[rgba(var(--lumeo-paper-rgb),0.08)] text-[var(--lumeo-paper-50)] hover:bg-[rgba(var(--lumeo-paper-rgb),0.13)]",
  ghost: "border-transparent bg-transparent text-[var(--lumeo-paper-200)] hover:border-[var(--border-subtle)] hover:bg-[rgba(var(--lumeo-paper-rgb),0.06)]",
  premium: "border-[var(--border-premium)] bg-[rgba(var(--lumeo-gold-rgb),0.12)] text-[var(--lumeo-gold-300)] hover:bg-[rgba(var(--lumeo-gold-rgb),0.18)]",
  danger: "border-[rgba(217,113,113,0.42)] bg-[rgba(217,113,113,0.14)] text-[var(--lumeo-danger)] hover:bg-[rgba(217,113,113,0.2)]",
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
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] border font-extrabold transition duration-[var(--motion-standard)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.22)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
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
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[var(--border-default)] bg-[rgba(var(--lumeo-paper-rgb),0.07)] text-[var(--lumeo-paper-100)] transition duration-[var(--motion-standard)] hover:border-[var(--border-premium)] hover:bg-[rgba(var(--lumeo-paper-rgb),0.12)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.22)]",
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
        "rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-sm)] transition duration-[var(--motion-standard)]",
        interactive && "hover:-translate-y-1 hover:border-[var(--border-premium)] hover:shadow-[var(--shadow-md)]",
        className,
      )}
    />
  );
}

export function AuraPanel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={cx("rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-6 shadow-[var(--shadow-md)]", className)} />;
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
      <span className={cx("relative h-7 w-12 shrink-0 rounded-full border transition", checked ? "border-[rgba(var(--lumeo-seal-rgb),0.62)] bg-[var(--lumeo-seal-500)]" : "border-[var(--border-default)] bg-[var(--lumeo-ink-750)]")}>
        <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-[var(--lumeo-paper-50)] shadow-[var(--shadow-xs)] transition-transform duration-[var(--motion-standard)]", checked ? "translate-x-6" : "translate-x-1")} />
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
  return (
    <div className={className}>
      <p className="mb-2 text-sm font-extrabold text-[var(--lumeo-paper-50)]">{label}</p>
      <div role="radiogroup" aria-label={label} className="relative flex overflow-x-auto rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.05)] p-1">
        <span aria-hidden="true" className="absolute bottom-1 top-1 rounded-[var(--radius-pill)] bg-[rgba(var(--lumeo-seal-rgb),0.28)] transition-all duration-[var(--motion-standard)]" style={{ left: `calc(${currentIndex} * (100% / ${options.length}) + 0.25rem)`, width: `calc((100% - 0.5rem) / ${options.length})` }} />
        {options.map((option) => (
          <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)} className="relative z-10 min-h-10 flex-1 whitespace-nowrap rounded-[var(--radius-pill)] px-4 text-sm font-extrabold text-[var(--lumeo-paper-100)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]">
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

export function AuraUploadSurface({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="lumeo-upload-surface rounded-[var(--radius-2xl)] border border-dashed border-[var(--border-premium)] bg-[rgba(var(--lumeo-paper-rgb),0.055)] p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-aura-rgb),0.12)] text-[var(--lumeo-aura-300)]">PDF</div>
      <h3 className="mt-4 text-xl font-black text-[var(--lumeo-paper-50)]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--lumeo-paper-400)]">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function AuraFileCard({ name, meta, action }: { name: string; meta: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.055)] p-3 transition hover:-translate-y-0.5 hover:border-[var(--border-premium)]">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-[var(--lumeo-paper-50)]">{name}</p>
        <p className="mt-1 text-xs text-[var(--lumeo-paper-400)]">{meta}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function AuraResultCard({ tone = "success", title, children, action }: { tone?: Tone; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <AuraCard className="aura-success-reveal">
      <AuraStatus tone={tone} label={title} />
      {children ? <div className="mt-4 text-sm leading-6 text-[var(--lumeo-paper-200)]">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </AuraCard>
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
