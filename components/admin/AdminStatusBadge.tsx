export function AdminStatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "gold";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.035)] text-[var(--text-secondary)]",
    success: "border-[rgba(var(--lumeo-seal-rgb),0.36)] bg-[rgba(var(--lumeo-seal-rgb),0.11)] text-[#D7E9DE]",
    warning: "border-[rgba(var(--lumeo-gold-rgb),0.36)] bg-[rgba(var(--lumeo-gold-rgb),0.09)] text-[#E8D8AF]",
    danger: "border-[rgba(224,84,84,0.36)] bg-[rgba(224,84,84,0.1)] text-[#F0C0BC]",
    gold: "border-[rgba(var(--lumeo-gold-rgb),0.36)] bg-[rgba(var(--lumeo-gold-rgb),0.09)] text-[#E8D8AF]",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}
