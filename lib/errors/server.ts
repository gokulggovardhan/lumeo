import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ServerErrorCaptureInput = {
  message: string;
  stack?: string | null;
  route?: string | null;
  component?: string | null;
  source: "server_action" | "route_handler";
  severity?: "low" | "medium" | "high" | "critical";
};

let capturing = false;

/**
 * Reports a server-side error to Supabase. Fire-and-forget: never awaited by
 * callers on the response-critical path, never throws, and guards against
 * re-entrancy so a failure while reporting can't itself trigger a report.
 */
export async function captureServerError(input: ServerErrorCaptureInput): Promise<void> {
  if (capturing) return;
  capturing = true;

  try {
    const supabase = await createClient();
    await supabase.rpc("record_error_event", {
      message: input.message.slice(0, 2000),
      stack: input.stack ? input.stack.slice(0, 4000) : null,
      route: input.route ?? null,
      component: input.component ?? null,
      source: input.source,
      severity: input.severity ?? "medium",
      browser_family: null,
      operating_system: null,
      device_class: null,
      page_url: null,
      anonymous_session_id: null,
      build_version: process.env.npm_package_version ?? null,
      git_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    });
  } catch {
    // Reporting failures are swallowed by design.
  } finally {
    capturing = false;
  }
}

function toErrorInfo(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: error.stack ?? null };
  return { message: String(error), stack: null };
}

/**
 * Wraps a Route Handler so an unexpected throw is captured before the
 * generic 500 response is returned. Does not change response shape for
 * handlers that already handle their own errors -- only fires on an
 * uncaught exception.
 */
export function withRouteHandlerCapture<Args extends unknown[], R>(
  route: string,
  handler: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      const info = toErrorInfo(error);
      void captureServerError({ ...info, route, source: "route_handler", severity: "high" });
      throw error;
    }
  };
}
