"use client";
import type { AnalyticsEventInput, AnalyticsRemoteTrackResult } from "@/lib/analytics/types";

const REQUEST_TIMEOUT_MS = 3000;
const DELIVERY_TIMEOUT_MS = 8000;

// Delivery is serialized per browser page so the first successful event can
// establish the HttpOnly visitor/session cookies before a second mount event
// (commonly page_view + tool_opened) reaches the server. This prevents a
// first-visit race from creating two pseudonymous visitors for one person.
// Callers never await this queue for PDF work; analytics remains best effort.
let deliveryQueue: Promise<void> = Promise.resolve();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("Analytics timeout.")),
      timeoutMs,
    );
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer));
  });
}

function safeDuration(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(Math.round(value), 86_400_000));
}

export async function fetchPublicAnalyticsEnabled(): Promise<boolean> {
  try {
    // The public setting is resolved by an explicit same-origin, read-only API.
    // Avoid loading the full Supabase browser SDK into the initial public shell.
    const response = await withTimeout(
      fetch("/api/analytics/setting", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      }),
      REQUEST_TIMEOUT_MS,
    );
    if (!response.ok) return false;
    const payload: unknown = await response.json();
    return Boolean(
      payload &&
        typeof payload === "object" &&
        "enabled" in payload &&
        payload.enabled === true,
    );
  } catch {
    return false;
  }
}

async function deliverPublicAnalyticsEvent(
  input: AnalyticsEventInput,
): Promise<AnalyticsRemoteTrackResult> {
  try {
    const response = await withTimeout(
      fetch("/api/analytics", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventName: input.eventName,
          toolSlug: input.toolSlug ?? null,
          durationMs: safeDuration(input.durationMs),
          inputSizeBucket: input.inputSizeBucket ?? null,
          outputSizeBucket: input.outputSizeBucket ?? null,
          success: input.success ?? null,
          errorCode: input.errorCode ?? null,
          failureStage: input.failureStage ?? null,
          pagePath: window.location.pathname,
        }),
      }),
      DELIVERY_TIMEOUT_MS,
    );

    return response.ok
      ? { success: true, eventId: null }
      : { success: false };
  } catch {
    return { success: false };
  }
}

export function trackPublicAnalyticsEvent(
  input: AnalyticsEventInput,
): Promise<AnalyticsRemoteTrackResult> {
  const result = deliveryQueue.then(
    () => deliverPublicAnalyticsEvent(input),
    () => deliverPublicAnalyticsEvent(input),
  );
  deliveryQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
