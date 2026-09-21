import handler from "vinext/server/fetch-handler";
import { canonicalRedirectUrl } from "./canonical-routing";
import { withProductionSecurityHeaders } from "./response-policy";
import { maybeHandleOfficeRuntimeRequest } from "./office-runtime";

type FetchArgs = Parameters<typeof handler.fetch>;

export default {
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

    const response = await handler.fetch(...args);
    return withProductionSecurityHeaders(request, response);
  },
};
