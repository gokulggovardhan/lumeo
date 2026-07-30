// Every admin console timestamp -- analytics, activity log, inbox -- displays
// in IST (Asia/Kolkata) regardless of where the server or the admin's browser
// is running. Without an explicit timeZone, server-rendered pages fall back
// to the Vercel runtime's UTC and client components fall back to the
// visitor's browser locale, so the same event shows two different times
// depending on which component rendered it.
export const ADMIN_TIMEZONE = "Asia/Kolkata";

export function formatAdminDateTime(value: string | number | Date, timeStyle: "short" | "medium" = "short") {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle,
    timeZone: ADMIN_TIMEZONE,
  });
}

export function formatAdminDate(value: string | number | Date) {
  return new Date(value).toLocaleDateString("en-IN", {
    dateStyle: "medium",
    timeZone: ADMIN_TIMEZONE,
  });
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
