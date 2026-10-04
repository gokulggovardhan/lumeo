"use client";

import { useMemo, useState } from "react";

type TrendPoint = {
  date: string;
  pageViews: number;
  uniqueVisitors: number;
  sessions: number;
};

function barHeight(value: number, max: number) {
  if (value <= 0 || max <= 0) return "0%";
  return `${Math.max(2, (value / max) * 100)}%`;
}

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function tickValue(max: number, fraction: number) {
  return Math.round(max * fraction);
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
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const activePoint =
    points.find((point) => point.date === activeDate) ??
    points.at(-1) ??
    null;
  const labelStep = Math.max(1, Math.ceil(points.length / 8));
  const minChartWidth = points.length > 14 ? points.length * 38 : undefined;

  const accessibleSummary = useMemo(
    () =>
      points
        .map(
          (point) =>
            `${point.date}: ${point.pageViews} page views, ${point.uniqueVisitors} visitors, ${point.sessions} sessions`,
        )
        .join("; "),
    [points],
  );

  return (
    <div className="min-w-0 max-w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#F0EAD6]">
            Real Audience daily trend
          </h3>
          <p className="mt-1 text-xs text-[#F0EAD6]/46">
            {rangeLabel} · verified page views, visitors and sessions.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-[#F0EAD6]/58">
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
      </div>

      {points.length === 0 ? (
        <div className="mt-5 rounded-xl border border-[var(--border-hairline)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          No verified page views in this period.
        </div>
      ) : (
        <>
          <div
            role="tooltip"
            aria-live="polite"
            className="mt-4 min-h-14 rounded-xl border border-[var(--border-hairline)] bg-[rgba(var(--lumeo-paper-rgb),0.025)] px-3 py-2 text-xs text-[var(--text-secondary)]"
          >
            {activePoint ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <strong className="text-[var(--text-primary)]">
                  {shortDate(activePoint.date)}
                </strong>
                <span>{activePoint.pageViews} page views</span>
                <span>{activePoint.uniqueVisitors} visitors</span>
                <span>{activePoint.sessions} sessions</span>
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2">
            <div
              aria-hidden="true"
              className="flex h-36 flex-col justify-between pb-6 text-right text-[10px] tabular-nums text-[#F0EAD6]/38"
            >
              <span>{tickValue(max, 1)}</span>
              <span>{tickValue(max, 2 / 3)}</span>
              <span>{tickValue(max, 1 / 3)}</span>
              <span>0</span>
            </div>

            <div className="min-w-0 overflow-x-auto overscroll-x-contain pb-1">
              <div
                className="relative h-42"
                style={minChartWidth ? { minWidth: `${minChartWidth}px` } : undefined}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-[#F0EAD6]/8"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-1/3 h-[1px] bg-[#F0EAD6]/8"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-2/3 h-[1px] bg-[#F0EAD6]/8"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-6 h-[1px] bg-[#F0EAD6]/14"
                />

                <div className="absolute inset-x-0 bottom-0 top-0 flex items-stretch gap-1.5">
                  {points.map((point, index) => {
                    const showLabel =
                      index % labelStep === 0 || index === points.length - 1;
                    const active = activePoint?.date === point.date;

                    return (
                      <button
                        key={point.date}
                        type="button"
                        aria-label={`${point.date}: ${point.pageViews} page views, ${point.uniqueVisitors} visitors, ${point.sessions} sessions`}
                        onMouseEnter={() => setActiveDate(point.date)}
                        onFocus={() => setActiveDate(point.date)}
                        onClick={() => setActiveDate(point.date)}
                        className="group flex min-w-[1.6rem] flex-1 flex-col items-center focus:outline-none"
                      >
                        <span className="flex h-36 w-full items-end justify-center gap-[2px] border-b border-transparent px-[1px]">
                          <span
                            className={`w-1/3 rounded-t-sm bg-[#1E6B4A] transition-opacity ${active ? "opacity-100" : "opacity-75 group-hover:opacity-100"}`}
                            style={{ height: barHeight(point.pageViews, max) }}
                            aria-hidden="true"
                          />
                          <span
                            className={`w-1/3 rounded-t-sm bg-[#CBA052] transition-opacity ${active ? "opacity-100" : "opacity-75 group-hover:opacity-100"}`}
                            style={{ height: barHeight(point.uniqueVisitors, max) }}
                            aria-hidden="true"
                          />
                          <span
                            className={`w-1/3 rounded-t-sm bg-[#6E8FB8] transition-opacity ${active ? "opacity-100" : "opacity-75 group-hover:opacity-100"}`}
                            style={{ height: barHeight(point.sessions, max) }}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="mt-1 h-5 text-[0.58rem] text-[#F0EAD6]/42">
                          {showLabel ? shortDate(point.date) : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <p className="sr-only">
            Daily Real Audience traffic summary. {accessibleSummary}
          </p>
        </>
      )}
    </div>
  );
}
