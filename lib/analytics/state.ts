import type {
  AnalyticsAvailability,
  AnalyticsEventInput,
  AnalyticsProviderTrackResult,
} from "./types";

const allowedEvents = new Set([
  "page_view",
  "tool_opened",
  "processing_started",
  "processing_succeeded",
  "processing_failed",
  "download_started",
]);

export function providerTrackDecision({
  availability,
  doNotTrack,
  event,
}: {
  availability: AnalyticsAvailability;
  doNotTrack: boolean;
  event: AnalyticsEventInput;
}): AnalyticsProviderTrackResult {
  if (!allowedEvents.has(event.eventName)) {
    return { accepted: false, reason: "invalid_event" };
  }

  if (doNotTrack) {
    return { accepted: false, reason: "do_not_track" };
  }

  if (availability === "loading") {
    return { accepted: false, reason: "loading" };
  }

  if (availability === "disabled") {
    return { accepted: false, reason: "disabled" };
  }

  return { accepted: true };
}

export function shouldAttemptOnce({
  availability,
  alreadyAccepted,
}: {
  availability: AnalyticsAvailability;
  alreadyAccepted: boolean;
}) {
  return availability === "enabled" && !alreadyAccepted;
}
