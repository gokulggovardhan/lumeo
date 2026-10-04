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

function currentPagePath() {
  return window.location.pathname.slice(0, 220);
}

function externalReferrerHost() {
  if (!document.referrer) return null;
  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin === window.location.origin) return null;
    return referrer.hostname.slice(0, 160);
  } catch {
    return null;
  }
}

function campaignFields() {
  const params = new URLSearchParams(window.location.search);
  const clean = (key: string, max: number) => {
    const value = params.get(key)?.trim();
    return value ? value.slice(0, max) : null;
  };
  return {
    utmSource: clean("utm_source", 100),
    utmMedium: clean("utm_medium", 100),
    utmCampaign: clean("utm_campaign", 120),
  };
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
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const response = await fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
      signal: controller.signal,
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
        pagePath: currentPagePath(),
        referrerHost: externalReferrerHost(),
        ...campaignFields(),
      }),
    }).finally(() => window.clearTimeout(timer));

    if (!response.ok) return { success: false };
    return { success: true, eventId: null };
  } catch {
    return { success: false };
  }
}
