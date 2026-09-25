// Every admin console timestamp -- analytics, activity log, inbox -- displays
// in IST (Asia/Kolkata) regardless of where the server or the admin's browser
// is running. Without an explicit timeZone, server-rendered pages fall back
// to the server runtime's timezone and client components fall back to the
// visitor's browser locale, so the same event shows two different times
// depending on which component rendered it.
export const ADMIN_TIMEZONE = "Asia/Kolkata";

export function formatAdminDateTime(value: string | number | Date, timeStyle: "short" | "medium" = "short") {
  const formatted = new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle,
    timeZone: ADMIN_TIMEZONE,
  });
  return `${formatted} IST`;
}

export function formatAdminDate(value: string | number | Date) {
  return new Date(value).toLocaleDateString("en-IN", {
    dateStyle: "medium",
    timeZone: ADMIN_TIMEZONE,
  });
}

// IST has a fixed +05:30 offset (no DST), so a wall-clock string typed into
// a <input type="datetime-local"> can be converted to a UTC instant just by
// appending the offset -- no need for a full tz database lookup.
const IST_OFFSET = "+05:30";
const ISO_CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoCalendarDate(value: string) {
  if (!ISO_CALENDAR_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return date;
}

// Treat an Admin date filter as midnight in India, then convert that instant
// to UTC for database comparison. dayOffset=1 is useful for an exclusive end
// boundary, e.g. 21 Sep IST -> 22 Sep 00:00 IST -> 21 Sep 18:30 UTC.
export function istCalendarDateStartToUtcIso(value: string, dayOffset = 0): string | null {
  const calendarDate = parseIsoCalendarDate(value);
  if (!calendarDate) return null;
  calendarDate.setUTCDate(calendarDate.getUTCDate() + dayOffset);
  const shifted = calendarDate.toISOString().slice(0, 10);
  const instant = new Date(`${shifted}T00:00:00${IST_OFFSET}`);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

// "YYYY-MM-DDTHH:mm" (IST wall clock, from a datetime-local input) -> UTC
// ISO string for storage. Without this, the raw string was being stored
// into a timestamptz column and interpreted in the database session's
// timezone (UTC), silently shifting every schedule by 5.5 hours.
export function istInputValueToUtcIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}:00${IST_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// Stored UTC ISO string -> "YYYY-MM-DDTHH:mm" IST wall clock, for
// pre-filling a datetime-local input when editing.
export function utcIsoToIstInputValue(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ADMIN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}`;
}

// IST calendar date (YYYY-MM-DD) for "today", used to scope admin analytics
// day boundaries -- see 20260730001_admin_analytics_ist_daybounds.sql, which
// interprets these dates as midnight IST rather than midnight UTC.
export function istIsoDate(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ADMIN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}
