import handler from "vinext/server/fetch-handler";
import { canonicalRedirectUrl } from "./canonical-routing";
import { withProductionSecurityHeaders } from "./response-policy";
import {
  cleanupWordToPdfUploads,
  WordToPdfCleanupError,
} from "../lib/supabase/wordToPdfCleanup";

export const WORD_TO_PDF_CLEANUP_CRON = "0 3 * * *";

type FetchArgs = Parameters<typeof handler.fetch>;

type ScheduledControllerLike = {
  cron: string;
  scheduledTime: number;
};

type ScheduledExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

async function runScheduledCleanup(controller: ScheduledControllerLike): Promise<void> {
  const startedAt = Date.now();

  try {
    const result = await cleanupWordToPdfUploads(controller.scheduledTime);

    console.info("word-to-pdf cleanup completed", {
      source: "cloudflare-cron",
      cron: controller.cron,
      scheduledTime: new Date(controller.scheduledTime).toISOString(),
      durationMs: Date.now() - startedAt,
      ...result,
    });
  } catch (error) {
    if (error instanceof WordToPdfCleanupError) {
      console.error("word-to-pdf cleanup failed", {
        source: "cloudflare-cron",
        cron: controller.cron,
        stage: error.stage,
        message: error.message,
        durationMs: Date.now() - startedAt,
      });
    } else {
      console.error("word-to-pdf cleanup failed", {
        source: "cloudflare-cron",
        cron: controller.cron,
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
    }

    // Rejecting the scheduled task makes the platform record a failure.
    // Retrying is safe because selection is age-based and deletion is idempotent.
    throw error;
  }
}

export default {
  fetch(...args: FetchArgs) {
    const request = args[0];
    const redirectUrl = canonicalRedirectUrl(
      request.url,
      request.headers.get("x-forwarded-proto"),
    );

    if (redirectUrl) {
      return withProductionSecurityHeaders(
        request,
        Response.redirect(redirectUrl, 308),
      );
    }

    return Promise.resolve(handler.fetch(...args)).then((response) =>
      withProductionSecurityHeaders(request, response),
    );
  },

  scheduled(
    controller: ScheduledControllerLike,
    _env: unknown,
    ctx: ScheduledExecutionContext,
  ) {
    if (controller.cron !== WORD_TO_PDF_CLEANUP_CRON) {
      console.warn("Ignoring unexpected scheduled trigger", {
        cron: controller.cron,
      });
      return;
    }

    ctx.waitUntil(runScheduledCleanup(controller));
  },
};
