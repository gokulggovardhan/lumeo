export function AdminStatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "gold";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.055)] text-[var(--lumeo-paper-200)]",
    success: "border-[rgba(var(--lumeo-seal-rgb),0.45)] bg-[rgba(var(--lumeo-seal-rgb),0.16)] text-[#DDF5E9]",
    warning: "border-[rgba(var(--lumeo-gold-rgb),0.45)] bg-[rgba(var(--lumeo-gold-rgb),0.12)] text-[var(--lumeo-paper-50)]",
    danger: "border-[rgba(224,84,84,0.45)] bg-[rgba(224,84,84,0.14)] text-[#FFD9D9]",
    gold: "border-[rgba(var(--lumeo-gold-rgb),0.45)] bg-[rgba(var(--lumeo-gold-rgb),0.12)] text-[var(--lumeo-paper-50)]",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold shadow-[var(--shadow-xs)] ${tones[tone]}`}>
      {children}
    </span>
  );
}
