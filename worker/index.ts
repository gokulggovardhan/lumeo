import handler from "vinext/server/fetch-handler";
import {
  publicHtmlCacheKey,
  mayCachePublicHtml,
  publicHtmlCacheStorageCopy,
  publicHtmlCacheBrowserCopy,
} from "./public-html-cache";
import { canonicalRedirectUrl } from "./canonical-routing";
import { withProductionSecurityHeaders } from "./response-policy";
import { maybeHandleOfficeRuntimeRequest } from "./office-runtime";

type FetchArgs = Parameters<typeof handler.fetch>;

const worker = {
  async fetch(...args: FetchArgs) {
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

    const officeRuntimeResponse = await maybeHandleOfficeRuntimeRequest(request);
    if (officeRuntimeResponse) return officeRuntimeResponse;

    // Workers Free permits only 10 ms of CPU per request. Repeated public
    // SSR can exceed that ceiling on cold or busy isolates. Cache ONLY audited
    // non-personal HTML. Never cache RSC/Flight or browser document data.
    const edgeCache = (
      globalThis as typeof globalThis & { caches?: { default?: Cache } }
    ).caches?.default;
    const cacheKey = edgeCache
      ? publicHtmlCacheKey(request, process.env.LUMEO_BUILD_SHA ?? "")
      : null;
    if (edgeCache && cacheKey) {
      try {
        const hit = await edgeCache.match(cacheKey);
        if (hit) {
          return withProductionSecurityHeaders(
            request,
            publicHtmlCacheBrowserCopy(hit),
          );
        }
      } catch {
        // Cache failures must never prevent a normal public request.
      }
    }

    const response = await handler.fetch(...args);
    const secured = withProductionSecurityHeaders(request, response);
    if (edgeCache && cacheKey && mayCachePublicHtml(secured)) {
      try {
        const cacheEntry = publicHtmlCacheStorageCopy(secured);
        const write = edgeCache.put(cacheKey, cacheEntry).catch(() => {});
        const ctx = args[2] as { waitUntil?: (task: Promise<unknown>) => void } | undefined;
        ctx?.waitUntil?.(write);
      } catch {
        // Best-effort cache only. The original response always takes priority.
      }
    }
    return secured;
  },
};

export default worker;
