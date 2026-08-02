"use client";

import { createClient } from "@/lib/supabase/client";
import {
  getBrowserFamily,
  getDeviceClass,
  getOperatingSystem,
} from "@/lib/analytics/device";
import { getAnonymousSessionId } from "@/lib/analytics/session";

const REQUEST_TIMEOUT_MS = 2500;
const MAX_CAPTURES_PER_LOAD = 20;

let captureCount = 0;
let capturing = false;

export type ErrorCaptureInput = {
  message: string;
  stack?: string | null;
  route?: string | null;
  component?: string | null;
  source: "client" | "error_boundary" | "unhandled_rejection";
  severity?: "low" | "medium" | "high" | "critical";
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Error capture timeout.")), timeoutMs);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer));
  });
}

/**
 * Reports a client-side error to Supabase. Never throws, never logs to the
 * console (that would recurse if console.error is itself instrumented), and
 * caps how many reports a single page load can send.
 */
export async function captureClientError(input: ErrorCaptureInput): Promise<void> {
  if (typeof window === "undefined") return;
  if (capturing) return; // re-entrancy guard: a failure inside this function must never re-trigger itself
  if (captureCount >= MAX_CAPTURES_PER_LOAD) return;

  capturing = true;
  captureCount += 1;

  try {
    const supabase = createClient();
    await withTimeout(
      (async () =>
        supabase.rpc("record_error_event", {
          message: input.message.slice(0, 2000),
          stack: input.stack ? input.stack.slice(0, 4000) : null,
          route: input.route ?? window.location.pathname,
          component: input.component ?? null,
          source: input.source,
          severity: input.severity ?? "medium",
          browser_family: getBrowserFamily(),
          operating_system: getOperatingSystem(),
          device_class: getDeviceClass(),
          page_url: window.location.href,
          anonymous_session_id: getAnonymousSessionId(),
          build_version: null,
          git_sha: null,
        }))(),
      REQUEST_TIMEOUT_MS,
    );
  } catch {
    // Reporting failures are swallowed by design -- a broken error reporter
    // must never become a second, louder error for the user.
  } finally {
    capturing = false;
  }
}
