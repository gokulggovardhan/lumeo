import handler from "vinext/server/fetch-handler";
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
    // SSR can exceed that ceiling on cold or busy isolates. Cache O    // Serve document HTML directly. Lumeo's release-freshness contract
    // forbids CF-Cache-Status HIT for these pages, and browser document
    // sessions must never be replayed from the edge.
    const response = await handler.fetch(...args);
    return withProductionSecurityHeaders(request, response);
  },
};

export default worker;
