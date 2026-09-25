import type {
  AnalyticsBrowserFamily,
  AnalyticsDeviceClass,
  AnalyticsOperatingSystem,
} from "@/lib/analytics/types";

export function classifyServerUserAgent(userAgent: string | null): {
  deviceClass: AnalyticsDeviceClass;
  browserFamily: AnalyticsBrowserFamily;
  operatingSystem: AnalyticsOperatingSystem;
} {
  const ua = userAgent ?? "";

  const browserFamily: AnalyticsBrowserFamily =
    /Edg\//.test(ua) ? "Edge"
      : /Firefox\//.test(ua) ? "Firefox"
        : /Chrome\//.test(ua) || /CriOS\//.test(ua) ? "Chrome"
          : /Safari\//.test(ua) ? "Safari"
            : ua ? "Other" : "Unknown";

  const operatingSystem: AnalyticsOperatingSystem =
    /Windows/i.test(ua) ? "Windows"
      : /Android/i.test(ua) ? "Android"
        : /iPhone|iPad|iPod/i.test(ua) ? "iOS"
          : /Mac OS X|Macintosh/i.test(ua) ? "macOS"
            : /Linux/i.test(ua) ? "Linux"
              : ua ? "Other" : "Unknown";

  const deviceClass: AnalyticsDeviceClass =
    /iPad|Tablet/i.test(ua) ? "tablet"
      : /Mobi|Android|iPhone|iPod/i.test(ua) ? "mobile"
        : ua ? "desktop" : "unknown";

  return { deviceClass, browserFamily, operatingSystem };
}
