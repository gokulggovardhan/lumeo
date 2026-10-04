"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import type {
  VerifiedLiveTrafficData,
  LiveTrafficScope,
} from "@/lib/admin/live-analytics-types";
import { formatLocationLabel } from "@/lib/analytics/location-names";

const REFRESH_INTERVAL_MS = 10_000;

function scopeLabel(scope: LiveTrafficScope) {
  if (scope === "real_audience") return "Real audience";
  if (scope === "synthetic") return "Lumeo synthetic tests";
  if (scope === "automation") return "Bots & suspected automation";
  return "All verified traffic";
}

function formatTime(value: string | null) {
  if (!value) return "None yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date) + " IST";
}

function locationLabel(hit: VerifiedLiveTrafficData["recentHits"][number]) {
  const region = hit.regionCode ?? hit.region;
  if (!hit.city || !region || !hit.countryCode) return "Unknown Location";
  return formatLocationLabel(hit.city, region, hit.countryCode);
}

function pageLabel(path: string | null) {
  return path?.trim() || "/";
}

export function LiveTrafficPanel({
  trafficScope,
  initialData,
  initialError,
}: {
  trafficScope: LiveTrafficScope;
  initialData: VerifiedLiveTrafficData | null;
  initialError: string | null;
}) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(initialError);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const response = await fetch(
        `/admin/analytics/live?traffic=${encodeURIComponent(trafficScope)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) {
        throw new Error(`Live analytics returned HTTP ${response.status}.`);
      }
      const payload = (await response.json()) as {
        data?: VerifiedLiveTrafficData | null;
        error?: string | null;
      };
      if (!payload.data) {
        throw new Error(payload.error || "Live analytics are unavailable.");
      }
      setData(payload.data);
      setError(null);
    } catch {
      setError("Live traffic refresh failed. The last verified snapshot is retained.");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, trafficScope]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const maxMinuteHits = useMemo(
    () => Math.max(1, ...(data?.minuteBuckets.map((bucket) => bucket.pageViews) ?? [1])),
    [data],
  );

  return (
    <AdminSectionCard
      title="Live Traffic"
      description={`Near-real-time ${scopeLabel(trafficScope)} page views. Auto-refreshes every 10 seconds; “active” means activity within the last five minutes.`}
      action={
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border-subtle)] px-3 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--border-premium)] hover:text-[var(--text-primary)] disabled:cursor-wait disabled:opacity-60"
        >
          {refreshing ? "Refreshing…" : "Refresh now"}
        </button>
      }
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-[rgba(216,109,109,0.32)] bg-[rgba(216,109,109,0.08)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          {error}
        </div>
      ) : null}

      {data ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AdminMetricCard
              label="Hits · 60 sec"
              value={data.summary.pageViewsLastMinute}
              detail="Verified Page Views in the rolling last 60 seconds."
              tone="gold"
            />
            <AdminMetricCard
              label="Hits · 5 min"
              value={data.summary.pageViewsLastFiveMinutes}
              detail="Verified Page Views in the rolling last five minutes."
            />
            <AdminMetricCard
              label="Active Visitors"
              value={data.summary.activeVisitorsLastFiveMinutes}
              detail="Distinct privacy-preserving visitors with a Page View in the last five minutes."
              tone="success"
            />
            <AdminMetricCard
              label="Active Sessions"
              value={data.summary.activeSessionsLastFiveMinutes}
              detail="Distinct 30-minute sessions with activity in the last five minutes."
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="rounded-xl border border-[var(--border-hairline)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Last 10 minutes</h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Page Views per minute · latest hit {formatTime(data.summary.lastPageViewAt)}
                  </p>
                </div>
                <span className="text-xs font-semibold text-[var(--text-subtle)]">
                  as of {formatTime(data.asOf)}
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {data.minuteBuckets.map((bucket) => (
                  <div
                    key={bucket.minute}
                    className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-xs"
                  >
                    <span className="text-[var(--text-muted)]">{formatTime(bucket.minute).replace(" IST", "")}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-[rgba(var(--lumeo-paper-rgb),0.06)]">
                      <div
                        className="h-full rounded-full bg-[var(--lumeo-gold-400)]"
                        style={{ width: `${Math.max(2, (bucket.pageViews / maxMinuteHits) * 100)}%` }}
                        aria-hidden="true"
                      />
                    </div>
                    <span className="text-right font-semibold tabular-nums text-[var(--text-primary)]">
                      {bucket.pageViews}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border-hairline)] pt-4 text-xs">
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">
                    {data.summary.knownLocationPageViewsLastFiveMinutes}
                  </p>
                  <p className="text-[var(--text-muted)]">Known-location hits · 5 min</p>
                </div>
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">
                    {data.summary.unknownLocationPageViewsLastFiveMinutes}
                  </p>
                  <p className="text-[var(--text-muted)]">Unknown-location hits · 5 min</p>
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-[var(--border-hairline)]">
              <div className="border-b border-[var(--border-hairline)] px-4 py-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent hits</h3>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Latest verified Page Views only. No IP address or visitor/session identifier is displayed.
                </p>
              </div>
              {data.recentHits.length > 0 ? (
                <div className="max-h-[360px] divide-y divide-[var(--border-hairline)] overflow-y-auto">
                  {data.recentHits.map((hit, index) => (
                    <div
                      key={`${hit.occurredAt}-${hit.pagePath ?? ""}-${index}`}
                      className="grid min-w-0 gap-1 px-4 py-3 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-x-4"
                    >
                      <span className="text-xs tabular-nums text-[var(--text-subtle)]">
                        {formatTime(hit.occurredAt).replace(" IST", "")}
                      </span>
                      <div className="min-w-0">
                        <p className="break-all text-sm font-semibold text-[var(--text-primary)]">
                          {pageLabel(hit.pagePath)}
                        </p>
                        <p className="mt-1 break-words text-xs text-[var(--text-muted)]">
                          {locationLabel(hit)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                  No verified Page Views in the last 30 minutes.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-6 text-sm text-[var(--text-muted)]">
          Live traffic is temporarily unavailable.
        </div>
      )}
    </AdminSectionCard>
  );
}
