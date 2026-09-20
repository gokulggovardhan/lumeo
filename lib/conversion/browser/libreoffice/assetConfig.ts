export const ZETAJS_HELPER_VERSION = "1.2.0";
export const ZETAJS_HELPER_URL =
  `https://cdn.jsdelivr.net/npm/zetajs@${ZETAJS_HELPER_VERSION}/source/zetaHelper.js`;

export const DEV_ZETAOFFICE_BASE_URL =
  "https://cdn.zetaoffice.net/zetaoffice_latest/";

const OFFICE_ASSET_BASE_ENV = process.env.NEXT_PUBLIC_LUMEO_OFFICE_ASSET_BASE_URL;

export type OfficeAssetMode = "development" | "production";

export type OfficeAssetConfig = {
  helperUrl: string;
  officeBaseUrl: string;
  mode: OfficeAssetMode;
  externallyHosted: boolean;
};

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function parseAbsoluteHttpUrl(value: string): URL {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Office asset base URL must use HTTP(S).");
  }
  return parsed;
}

function assertProductionAssetUrl(value: string): void {
  const parsed = parseAbsoluteHttpUrl(value);
  if (parsed.protocol !== "https:") {
    throw new Error("Production office assets must use HTTPS.");
  }
  if (/latest/i.test(parsed.pathname)) {
    throw new Error(
      "Production office assets must use an immutable/versioned path, not a latest alias.",
    );
  }
}

/**
 * The heavy LibreOffice payload is intentionally outside the Next application
 * bundle. Production must point to a separately deployed static origin (for
 * example a Cloudflare R2 custom domain) with immutable caching.
 */
export function resolveOfficeAssetConfig(
  mode: OfficeAssetMode,
  explicitBaseUrl?: string | null,
): OfficeAssetConfig {
  const configured = explicitBaseUrl?.trim() || OFFICE_ASSET_BASE_ENV?.trim();

  if (mode === "development") {
    const officeBaseUrl = ensureTrailingSlash(configured || DEV_ZETAOFFICE_BASE_URL);
    parseAbsoluteHttpUrl(officeBaseUrl);
    return {
      helperUrl: ZETAJS_HELPER_URL,
      officeBaseUrl,
      mode,
      externallyHosted: true,
    };
  }

  if (!configured) {
    throw new Error(
      "NEXT_PUBLIC_LUMEO_OFFICE_ASSET_BASE_URL is required for browser Office conversion in production.",
    );
  }

  const officeBaseUrl = ensureTrailingSlash(configured);
  assertProductionAssetUrl(officeBaseUrl);

  return {
    helperUrl: ZETAJS_HELPER_URL,
    officeBaseUrl,
    mode,
    externallyHosted: true,
  };
}

export async function preflightOfficeAssetOrigin(
  config: OfficeAssetConfig,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(new URL("soffice.js", config.officeBaseUrl), {
    method: "GET",
    cache: "force-cache",
    credentials: "omit",
    signal,
    headers: {
      Range: "bytes=0-0",
    },
  });

  // Some CDNs ignore Range and return 200; both 200 and 206 prove the runtime
  // entry point is reachable without downloading it into the application
  // bundle.
  if (response.status !== 200 && response.status !== 206) {
    throw new Error(
      `Office runtime asset origin is unreachable (HTTP ${response.status}).`,
    );
  }

  await response.body?.cancel().catch(() => {});
}

export function isImmutableOfficeAssetUrl(url: string): boolean {
  try {
    assertProductionAssetUrl(url);
    return true;
  } catch {
    return false;
  }
}
