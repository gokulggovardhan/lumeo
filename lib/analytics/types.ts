export type AnalyticsEventName =
  | "page_view"
  | "tool_opened"
  | "processing_started"
  | "processing_succeeded"
  | "processing_failed"
  | "download_started";

export type AnalyticsSizeBucket =
  | "under_1mb"
  | "1mb_to_5mb"
  | "5mb_to_20mb"
  | "20mb_to_50mb"
  | "over_50mb"
  | "unknown";

export type AnalyticsDeviceClass = "desktop" | "tablet" | "mobile" | "unknown";

export type AnalyticsErrorCode =
  | "unsupported_file"
  | "file_too_large"
  | "invalid_pdf"
  | "processing_error"
  | "browser_limit"
  | "cancelled"
  | "unknown";

export type AnalyticsBrowserFamily =
  | "Chrome"
  | "Edge"
  | "Firefox"
  | "Safari"
  | "Other"
  | "Unknown";

export type AnalyticsOperatingSystem =
  | "Windows"
  | "macOS"
  | "Linux"
  | "Android"
  | "iOS"
  | "Other"
  | "Unknown";

export type AnalyticsEventInput = {
  eventName: AnalyticsEventName;
  toolSlug?: string | null;
  durationMs?: number | null;
  inputSizeBucket?: AnalyticsSizeBucket | null;
  outputSizeBucket?: AnalyticsSizeBucket | null;
  success?: boolean | null;
  errorCode?: AnalyticsErrorCode | null;
};

export type AnalyticsAvailability = "loading" | "enabled" | "disabled";

export type AnalyticsProviderTrackResult =
  | { accepted: true }
  | {
      accepted: false;
      reason:
        | "loading"
        | "disabled"
        | "do_not_track"
        | "invalid_event"
        | "unavailable";
    };

export type AnalyticsRemoteTrackResult =
  | { success: true; eventId: number | null }
  | { success: false };
