"use client";

import { createClient } from "@/lib/supabase/client";
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
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/analytics", {
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
      }),
      signal: controller.signal,
    });

    return response.ok ? { success: true } : { success: false };
  } catch {
    return { success: false };
  } finally {
    window.clearTimeout(timer);
  }
}
