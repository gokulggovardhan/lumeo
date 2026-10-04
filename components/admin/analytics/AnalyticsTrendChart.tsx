type TrendPoint = {
  date: string;
  pageViews: number;
  uniqueVisitors: number;
  sessions: number;
};

function barHeight(value: number, max: number) {
  if (value <= 0) return "0%";
  return `${Math.max(5, (value / max) * 100)}%`;
}

export function AnalyticsTrendChart({
  points,
  rangeLabel = "Last 7 days",
}: {
  points: TrendPoint[];
  rangeLabel?: string;
}) {
  const max = Math.max(
    1,
    ...points.map((point) =>
      Math.max(point.pageViews, point.uniqueVisitors, point.sessions),
    ),
  );
  const minChartWidth = points.length > 14 ? points.length * 42 : undefined;

  return (
    <div className="min-w-0 max-w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#F0EAD6]">Real Audience daily trend</h3>
          <p className="mt-1 text-xs text-[#F0EAD6]/46">
            {rangeLabel} · verified page views, visitors and sessions.
          </p>
        </div>
      </div>
      {points.length === 0 ? (
        <div className="mt-5 rounded-xl border border-[var(--border-hairline)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          No Real Audience traffic in this date range.
        </div>
      ) : (
      <div className="mt-5 w-full max-w-full overflow-x-auto overscroll-x-contain pb-1">
        <div
          className="flex h-32 items-end gap-2"
          style={minChartWidth ? { minWidth: `${minChartWidth}px` } : undefined}
          aria-label={`Daily page views, visitors and sessions for ${rangeLabel}`}
        >
          {points.map((point) => (
            <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-full w-full items-end gap-1">
                <div
                  title={`${point.date}: ${point.pageViews} page views`}
                  className="flex-1 rounded-t-lg border border-[#CBA052]/16 bg-[#1E6B4A]/80"
                  style={{ height: barHeight(point.pageViews, max) }}
                />
                <div
                  title={`${point.date}: ${point.uniqueVisitors} visitors`}
                  className="flex-1 rounded-t-lg border border-[#CBA052]/22 bg-[#CBA052]/78"
                  style={{ height: barHeight(point.uniqueVisitors, max) }}
                />
                <div
                  title={`${point.date}: ${point.sessions} sessions`}
                  className="flex-1 rounded-t-lg border border-[#F0EAD6]/16 bg-[#6E8FB8]/78"
                  style={{ height: barHeight(point.sessions, max) }}
                />
              </div>
              <span className="truncate text-[0.62rem] text-[#F0EAD6]/42">
                {point.date.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#F0EAD6]/50">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#1E6B4A]" />
          Page views
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#CBA052]" />
          Visitors
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#6E8FB8]" />
          Sessions
        </span>
      </div>
      {points.length > 0 ? (
        <p className="mt-3 text-xs leading-5 text-[#F0EAD6]/46">
          Text summary:{" "}
          {points
            .map(
              (point) =>
                `${point.date} ${point.pageViews} page views, ${point.uniqueVisitors} visitors, ${point.sessions} sessions`,
            )
            .join(", ")}
        </p>
      ) : null}
    </div>
  );
}
