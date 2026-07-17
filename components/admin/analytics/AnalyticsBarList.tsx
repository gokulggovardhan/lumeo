type BarItem = {
  label: string;
  value: number;
};

export function AnalyticsBarList({
  title,
  items,
  emptyText = "No data yet.",
}: {
  title: string;
  items: BarItem[];
  emptyText?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
      <h3 className="text-sm font-bold text-[#F0EAD6]">{title}</h3>
      {items.length ? (
        <div className="mt-4 space-y-3" aria-label={title}>
          {items.map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-[#F0EAD6]/74">{item.label}</span>
                <span className="text-[#CBA052]">{item.value}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#F0EAD6]/8">
                <div
                  className="h-full rounded-full bg-[#1E6B4A]"
                  style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#F0EAD6]/48">{emptyText}</p>
      )}
    </div>
  );
}
