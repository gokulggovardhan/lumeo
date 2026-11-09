/**
 * Bounded upstream retry for the Next.js Office-runtime fallback route.
 *
 * The production Cloudflare Worker already retries transient GitHub release
 * failures. Keep the development/Next fallback equally fail-closed so one
 * short-lived 504 does not incorrectly look like an unusable local Office
 * engine. No response body is ever buffered or transformed here.
 */
const DEFAULT_RETRY_DELAYS_MS = [250, 1_000, 2_500] as const;

function transientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Office runtime request cancelled.", "AbortError");
}

function delayWithAbort(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortReason(signal));

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

export async function fetchRuntimeAssetWithRetry(
  request: Request,
  sourceUrl: string,
  headers: Headers,
  retryDelaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
): Promise<Response> {
  // Tests can supply zero-duration delays without sleeping. All callers are
  // capped to three bounded retries; no infinite retry loop or secret upload.
  const delays = retryDelaysMs.slice(0, DEFAULT_RETRY_DELAYS_MS.length);
  if (delays.some((delay) => !Number.isFinite(delay) || delay < 0 || delay > 5_000)) {
    throw new Error("Invalid Office runtime retry delay.");
  }

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    if (request.signal.aborted) throw abortReason(request.signal);

    try {
      const upstream = await fetch(sourceUrl, {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers,
        redirect: "follow",
        cache: "no-store",
        signal: request.signal,
      });

      if (!transientStatus(upstream.status) || attempt === delays.length) {
        return upstream;
      }

      // Discard only an unsuccessful transient response; the successful
      // response remains a ReadableStream owned by the route handler.
      await upstream.body?.cancel().catch(() => {});
    } catch (error) {
      if (request.signal.aborted || attempt === delays.length) throw error;
    }

    await delayWithAbort(delays[attempt] ?? 0, request.signal);
  }

  throw new Error("Office runtime source retry budget exhausted.");
}
