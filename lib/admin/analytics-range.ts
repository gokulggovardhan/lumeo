import { istIsoDate } from "./timezone.ts";

export type AnalyticsRangeKey =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "this-month"
  | "previous-month"
  | "custom";

export type AnalyticsRange = {
  key: AnalyticsRangeKey;
  label: string;
  startDate: string;
  endDate: string;
  warning: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseCalendarDate(value: string) {
  if (!ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function shiftIsoDate(value: string, days: number) {
  const date = parseCalendarDate(value);
  if (!date) throw new Error("Invalid ISO calendar date.");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function previousMonthRange(value: string) {
  const current = parseCalendarDate(monthStart(value));
  if (!current) throw new Error("Invalid current month.");
  current.setUTCMonth(current.getUTCMonth() - 1);
  const startDate = current.toISOString().slice(0, 10);
  const next = new Date(current);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(next.getUTCDate() - 1);
  return { startDate, endDate: next.toISOString().slice(0, 10) };
}

function customRange(start: string | undefined, end: string | undefined, today: string): AnalyticsRange | null {
  if (!start || !end) return null;
  const startDate = parseCalendarDate(start);
  const endDate = parseCalendarDate(end);
  if (!startDate || !endDate || startDate > endDate || end > today) return null;
  const spanDays = Math.floor((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1;
  if (spanDays > 90) return null;
  return {
    key: "custom",
    label: `${start} to ${end}`,
    startDate: start,
    endDate: end,
    warning: null,
  };
}

export function resolveAnalyticsRange(
  params: { range?: string; start?: string; end?: string } = {},
  now: Date = new Date(),
): AnalyticsRange {
  const today = istIsoDate(now);

  switch (params.range) {
    case "today":
      return { key: "today", label: "Today", startDate: today, endDate: today, warning: null };
    case "yesterday": {
      const yesterday = shiftIsoDate(today, -1);
      return { key: "yesterday", label: "Yesterday", startDate: yesterday, endDate: yesterday, warning: null };
    }
    case "30d":
      return { key: "30d", label: "Last 30 days", startDate: shiftIsoDate(today, -29), endDate: today, warning: null };
    case "this-month":
      return { key: "this-month", label: "This month", startDate: monthStart(today), endDate: today, warning: null };
    case "previous-month": {
      const previous = previousMonthRange(today);
      return { key: "previous-month", label: "Previous month", ...previous, warning: null };
    }
    case "custom": {
      const custom = customRange(params.start, params.end, today);
      if (custom) return custom;
      return {
        key: "7d",
        label: "Last 7 days",
        startDate: shiftIsoDate(today, -6),
        endDate: today,
        warning: "Custom dates must be valid, ordered, not in the future, and span no more than 90 calendar days.",
      };
    }
    case "7d":
    default:
      return { key: "7d", label: "Last 7 days", startDate: shiftIsoDate(today, -6), endDate: today, warning: null };
  }
}
