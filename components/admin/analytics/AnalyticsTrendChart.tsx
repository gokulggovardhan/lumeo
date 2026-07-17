type TrendPoint = {
  date: string;
  events: number;
  pageViews: number;
  toolOpens: number;
};

export function AnalyticsTrendChart({ points }: { points: TrendPoint[] }) {
  const max = Math.max(
    1,
    ...points.map((point) => Math.max(point.pageViews, point.toolOpens)),
  );

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#F0EAD6]">Seven-day activity</h3>
          <p className="mt-1 text-xs text-[#F0EAD6]/46">
            Page views and tool opens only.
          </p>
        </div>
      </div>
      <div className="mt-5 flex h-32 items-end gap-2" aria-label="Seven-day page views and tool opens">
        {points.map((point) => (
          <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-full w-full items-end gap-1">
              <div
                title={`${point.date}: ${point.pageViews} page views`}
                className="min-h-[5px] flex-1 rounded-t-lg border border-[#CBA052]/16 bg-[#1E6B4A]/80"
                style={{
                  height: `${Math.max(5, (point.pageViews / max) * 100)}%`,
                }}
              />
              <div
                title={`${point.date}: ${point.toolOpens} tool opens`}
                className="min-h-[5px] flex-1 rounded-t-lg border border-[#CBA052]/22 bg-[#CBA052]/78"
                style={{
                  height: `${Math.max(5, (point.toolOpens / max) * 100)}%`,
                }}
              />
            </div>
            <span className="truncate text-[0.62rem] text-[#F0EAD6]/42">
              {point.date.slice(5)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#F0EAD6]/50">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#1E6B4A]" />
          Page views
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#CBA052]" />
          Tool opens
        </span>
      </div>
      <p className="mt-3 text-xs text-[#F0EAD6]/46">
        Text summary:{" "}
        {points
          .map(
            (point) =>
              `${point.date} ${point.pageViews} page views, ${point.toolOpens} tool opens`,
          )
          .join(", ")}
      </p>
    </div>
  );
}
