const PRODUCTION_HOSTS = new Set(["lumeo.in", "www.lumeo.in"]);

export function canonicalRedirectUrl(
  requestUrl: string,
  forwardedProto?: string | null,
): string | null {
  const url = new URL(requestUrl);
  const host = url.hostname.toLowerCase();

  if (!PRODUCTION_HOSTS.has(host)) return null;

  const effectiveProtocol = (
    forwardedProto?.trim().toLowerCase() ||
    url.protocol.replace(/:$/, "").toLowerCase()
  );

  if (host === "lumeo.in" && effectiveProtocol === "https") {
    return null;
  }

  url.protocol = "https:";
  url.hostname = "lumeo.in";
  url.port = "";
  return url.toString();
}
