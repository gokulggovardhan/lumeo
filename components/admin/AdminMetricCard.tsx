export function AdminMetricCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "gold";
}) {
  const toneClass = {
    neutral: "bg-[var(--text-subtle)]",
    success: "bg-[var(--lumeo-seal-400)]",
    warning: "bg-[var(--lumeo-gold-400)]",
    danger: "bg-[#D86D6D]",
    gold: "bg-[var(--lumeo-gold-400)]",
  }[tone];

  return (
    <div className="h-full rounded-2xl border border-[var(--border-hairline)] bg-[rgba(var(--lumeo-paper-rgb),0.026)] p-4 transition hover:border-[var(--border-subtle)] sm:p-5">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${toneClass}`} aria-hidden="true" />
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-subtle)]">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)] [font-variant-numeric:tabular-nums] sm:text-[1.75rem]">
        {value}
      </p>
      <p className="mt-1.5 text-xs leading-5 text-[var(--text-muted)]">{detail}</p>
    </div>
  );
}
