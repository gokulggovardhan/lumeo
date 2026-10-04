type AudienceTrendPoint = {
  date: string;
  pageViews: number;
  uniqueVisitors: number;
  sessions: number;
};

export function AudienceTrendChart({
  points,
  rangeLabel,
}: {
  points: AudienceTrendPoint[];
  rangeLabel: string;
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
      <div>
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Traffic trend</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {rangeLabel} · genuine page views, visitors, and sessions by IST day.
        </p>
      </div>
      <div className="mt-5 w-full max-w-full overflow-x-auto overscroll-x-contain pb-1">
        <div
          className="flex h-36 items-end gap-2"
          style={minChartWidth ? { minWidth: `${minChartWidth}px` } : undefined}
          aria-label={`Daily page views, visitors, and sessions for ${rangeLabel}`}
        >
          {points.map((point) => (
            <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-full w-full items-end gap-1">
                <div
                  title={`${point.date}: ${point.pageViews} page views`}
                  className="min-h-[5px] flex-1 rounded-t-lg bg-[var(--action-primary)]"
                  style={{ height: `${Math.max(5, (point.pageViews / max) * 100)}%` }}
                />
                <div
                  title={`${point.date}: ${point.uniqueVisitors} visitors`}
                  className="min-h-[5px] flex-1 rounded-t-lg bg-[var(--text-premium)]"
                  style={{ height: `${Math.max(5, (point.uniqueVisitors / max) * 100)}%` }}
                />
                <div
                  title={`${point.date}: ${point.sessions} sessions`}
                  className="min-h-[5px] flex-1 rounded-t-lg bg-[var(--text-info)]"
                  style={{ height: `${Math.max(5, (point.sessions / max) * 100)}%` }}
                />
              </div>
              <span className="truncate text-[0.62rem] text-[var(--text-subtle)]">
                {point.date.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--text-muted)]">
        <span>Page views</span>
        <span>Visitors</span>
        <span>Sessions</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--text-subtle)]">
        {points
          .map(
            (point) =>
              `${point.date}: ${point.pageViews} page views, ${point.uniqueVisitors} visitors, ${point.sessions} sessions`,
          )
          .join(" · ")}
      </p>
    </div>
  );
}
