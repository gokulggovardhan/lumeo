import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";

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
  return (
    <div className="aura-card-lift rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-sm)] transition duration-200 hover:border-[var(--border-premium)] motion-reduce:hover:translate-y-0">
      <div className="flex items-start justify-between gap-3">
        <p className="aura-text-label text-[var(--lumeo-paper-400)]">{label}</p>
        <AdminStatusBadge tone={tone}>Live</AdminStatusBadge>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-[var(--lumeo-paper-50)] [font-variant-numeric:tabular-nums]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--lumeo-paper-400)]">{detail}</p>
    </div>
  );
}
