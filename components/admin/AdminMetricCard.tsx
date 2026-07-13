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
    <div className="rounded-[1.2rem] border border-[#E8DFC8]/10 bg-[#142034] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[#CBA052]/24 motion-reduce:hover:translate-y-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8DFC8]/48">{label}</p>
        <AdminStatusBadge tone={tone}>Live</AdminStatusBadge>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-[#F0EAD6]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/56">{detail}</p>
    </div>
  );
}
