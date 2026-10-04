"use client";

import { createClient } from "@/lib/supabase/client";
import {
  getBrowserFamily,
  getDeviceClass,
  getOperatingSystem,
} from "@/lib/analytics/device";
import type { AnalyticsEventInput, AnalyticsRemoteTrackResult } from "@/lib/analytics/types";

const REQUEST_TIMEOUT_MS = 2500;

type RpcResult<T> = {
  data: T | null;
  error: unknown;
};

let deliveryQueue: Promise<void> = Promise.resolve();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Analytics timeout.")), timeoutMs);
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
    const supabase = createClient();
    const { data, error } = await withTimeout(
      supabase.rpc("get_public_analytics_setting") as unknown as Promise<RpcResult<boolean>>,
      REQUEST_TIMEOUT_MS,
    );
    if (error || typeof data !== "boolean") return false;
    return data;
  } catch {
    return false;
  }
}

async function sendPublicAnalyticsEvent(
  input: AnalyticsEventInput,
): Promise<AnalyticsRemoteTrackResult> {
  try {
    const response = await withTimeout(
      fetch("/api/analytics", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventName: input.eventName,
          toolSlug: input.toolSlug ?? null,
          durationMs: safeDuration(input.durationMs),
          inputSizeBucket: input.inputSizeBucket ?? "unknown",
          outputSizeBucket: input.outputSizeBucket ?? "unknown",
          deviceClass: getDeviceClass(),
          browserFamily: getBrowserFamily(),
          operatingSystem: getOperatingSystem(),
          success: input.success ?? null,
          errorCode: input.errorCode ?? null,
          failureStage: input.failureStage ?? null,
          pagePath: window.location.pathname,
        }),
      }),
      REQUEST_TIMEOUT_MS,
    );

    if (!response.ok) return { success: false };
    const payload = (await response.json().catch(() => null)) as
      | { ok?: unknown }
      | null;
    return payload?.ok === true
      ? { success: true, eventId: null }
      : { success: false };
  } catch {
    return { success: false };
  }
}

export function trackPublicAnalyticsEvent(
  input: AnalyticsEventInput,
): Promise<AnalyticsRemoteTrackResult> {
  // Serialize delivery so the first event can establish HttpOnly visitor and
  // session cookies before any following event is sent. Analytics remains
  // fire-and-forget to the product UI and never blocks PDF work.
  const result = deliveryQueue.then(() => sendPublicAnalyticsEvent(input));
  deliveryQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
