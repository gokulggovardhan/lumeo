"use client";

import { createClient } from "@/lib/supabase/client";
import {
  getBrowserFamily,
  getDeviceClass,
  getOperatingSystem,
} from "@/lib/analytics/device";
import { getAnonymousSessionId } from "@/lib/analytics/session";
import type { AnalyticsEventInput, AnalyticsRemoteTrackResult } from "@/lib/analytics/types";

const REQUEST_TIMEOUT_MS = 2500;

type RpcResult<T> = {
  data: T | null;
  error: unknown;
};

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

export async function trackPublicAnalyticsEvent(
  input: AnalyticsEventInput,
): Promise<AnalyticsRemoteTrackResult> {
  try {
    const supabase = createClient();
    const { data, error } = await withTimeout(
      supabase.rpc("record_public_analytics_event", {
        event_name: input.eventName,
        tool_slug: input.toolSlug ?? null,
        anonymous_session_id: getAnonymousSessionId(),
        duration_ms: safeDuration(input.durationMs),
        input_size_bucket: input.inputSizeBucket ?? "unknown",
        output_size_bucket: input.outputSizeBucket ?? "unknown",
        device_class: getDeviceClass(),
        browser_family: getBrowserFamily(),
        operating_system: getOperatingSystem(),
        success: input.success ?? null,
        error_code: input.errorCode ?? null,
      }) as unknown as Promise<RpcResult<number>>,
      REQUEST_TIMEOUT_MS,
    );

    if (error) return { success: false };
    return { success: true, eventId: typeof data === "number" ? data : null };
  } catch {
    return { success: false };
  }
}
