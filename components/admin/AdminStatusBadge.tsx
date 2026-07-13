export function AdminStatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "gold";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "border-[#E8DFC8]/12 bg-[#F0EAD6]/[0.04] text-[#F0EAD6]/68",
    success: "border-[#1E6B4A]/45 bg-[#1E6B4A]/16 text-[#DDF5E9]",
    warning: "border-[#CBA052]/45 bg-[#CBA052]/12 text-[#F0EAD6]",
    danger: "border-[#9B3B3B]/45 bg-[#9B3B3B]/14 text-[#FFD9D9]",
    gold: "border-[#CBA052]/45 bg-[#CBA052]/12 text-[#F0EAD6]",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}
