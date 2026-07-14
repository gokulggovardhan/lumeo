import type {
  AnalyticsBrowserFamily,
  AnalyticsDeviceClass,
  AnalyticsOperatingSystem,
} from "@/lib/analytics/types";

export function getDeviceClass(): AnalyticsDeviceClass {
  if (typeof navigator === "undefined") return "unknown";

  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const width = window.innerWidth || 0;
  const userAgent = navigator.userAgent;

  if (/Mobi|Android|iPhone|iPod/i.test(userAgent) && width < 768) return "mobile";
  if (/iPad|Tablet/i.test(userAgent) || (coarsePointer && width >= 768)) return "tablet";
  if (width > 0) return "desktop";
  return "unknown";
}

export function getBrowserFamily(): AnalyticsBrowserFamily {
  if (typeof navigator === "undefined") return "Unknown";
  const userAgent = navigator.userAgent;

  if (/Edg\//.test(userAgent)) return "Edge";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Chrome\//.test(userAgent) || /CriOS\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "Other";
}

export function getOperatingSystem(): AnalyticsOperatingSystem {
  if (typeof navigator === "undefined") return "Unknown";
  const userAgent = navigator.userAgent;

  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Other";
}
