export const ZETAJS_HELPER_VERSION = "1.2.0";
export const ZETAJS_HELPER_URL =
  `https://cdn.jsdelivr.net/npm/zetajs@${ZETAJS_HELPER_VERSION}/source/zetaHelper.js`;

export const DEV_ZETAOFFICE_BASE_URL =
  "https://cdn.zetaoffice.net/zetaoffice_latest/";

export const OFFICE_RUNTIME_MANIFEST_FILE = "lumeo-office-runtime.json";

export const OFFICE_RUNTIME_REQUIRED_FILES = {
  "soffice.js": ["text/javascript", "application/javascript"],
  "soffice.wasm": ["application/wasm"],
  "soffice.data": ["application/octet-stream", "binary/octet-stream"],
  "soffice.data.js.metadata": [
    "application/json",
    "text/json",
    "application/octet-stream",
  ],
} as const;

const OFFICE_ASSET_BASE_ENV = process.env.NEXT_PUBLIC_LUMEO_OFFICE_ASSET_BASE_URL;
const PREFLIGHT_RETRY_DELAYS_MS = [250, 750] as const;

export type OfficeAssetMode = "development" | "production";

export type OfficeRuntimeFileManifest = {
  bytes: number;
  sha256: string;
  contentType: string;
};

export type OfficeRuntimeManifest = {
  schemaVersion: 1;
  releaseId: string;
  zetaJsVersion: string;
  zetaOfficeBranch: string;
  createdAt: string;
  files: Record<string, OfficeRuntimeFileManifest>;
};

export type OfficeAssetConfig = {
  helperUrl: string;
  officeBaseUrl: string;
  mode: OfficeAssetMode;
  externallyHosted: boolean;
  releaseId: string | null;
  manifestUrl: string | null;
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

function releaseIdFromUrl(value: string): string {
  const parsed = parseAbsoluteHttpUrl(value);
  const segments = parsed.pathname.split("/").filter(Boolean);
  const releaseId = segments.at(-1)?.trim();
  if (!releaseId) {
    throw new Error("Production office asset URL must end with an immutable release ID.");
  }
  return releaseId;
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
  releaseIdFromUrl(value);
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Conversion cancelled", "AbortError");
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Conversion cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (!signal) return;

    const cleanup = () => signal.removeEventListener("abort", onAbort);
    setTimeout(cleanup, delayMs + 1);
  });
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= PREFLIGHT_RETRY_DELAYS_MS.length; attempt += 1) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("Conversion cancelled", "AbortError");
    }

    try {
      const response = await fetch(input, { ...init, signal });
      if (!isTransientStatus(response.status) || attempt === PREFLIGHT_RETRY_DELAYS_MS.length) {
        return response;
      }
      await response.body?.cancel().catch(() => {});
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      if (attempt === PREFLIGHT_RETRY_DELAYS_MS.length) throw error;
    }

    await waitForRetry(PREFLIGHT_RETRY_DELAYS_MS[attempt], signal);
  }

  throw lastError ?? new Error("Office runtime request failed.");
}

function normalizeContentType(value: string | null): string {
  return (value ?? "").split(";")[0].trim().toLowerCase();
}

function assertRuntimeFileManifest(
  name: string,
  entry: unknown,
): asserts entry is OfficeRuntimeFileManifest {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Office runtime manifest is missing ${name}.`);
  }

  const candidate = entry as Partial<OfficeRuntimeFileManifest>;
  if (!Number.isFinite(candidate.bytes) || Number(candidate.bytes) <= 0) {
    throw new Error(`Office runtime manifest has an invalid size for ${name}.`);
  }
  if (typeof candidate.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(candidate.sha256)) {
    throw new Error(`Office runtime manifest has an invalid SHA-256 for ${name}.`);
  }
  if (typeof candidate.contentType !== "string" || !candidate.contentType.trim()) {
    throw new Error(`Office runtime manifest has an invalid content type for ${name}.`);
  }
}

export function validateOfficeRuntimeManifest(
  value: unknown,
  expectedReleaseId: string,
): OfficeRuntimeManifest {
  if (!value || typeof value !== "object") {
    throw new Error("Office runtime manifest is invalid.");
  }

  const manifest = value as Partial<OfficeRuntimeManifest>;
  if (manifest.schemaVersion !== 1) {
    throw new Error("Office runtime manifest schema is not supported.");
  }
  if (manifest.releaseId !== expectedReleaseId) {
    throw new Error("Office runtime release does not match the configured asset URL.");
  }
  if (manifest.zetaJsVersion !== ZETAJS_HELPER_VERSION) {
    throw new Error("Office runtime and ZetaJS helper versions do not match.");
  }
  if (typeof manifest.zetaOfficeBranch !== "string" || !manifest.zetaOfficeBranch.trim()) {
    throw new Error("Office runtime manifest is missing its ZetaOffice branch.");
  }
  if (typeof manifest.createdAt !== "string" || !Number.isFinite(Date.parse(manifest.createdAt))) {
    throw new Error("Office runtime manifest has an invalid creation timestamp.");
  }
  if (!manifest.files || typeof manifest.files !== "object") {
    throw new Error("Office runtime manifest has no file inventory.");
  }

  for (const name of Object.keys(OFFICE_RUNTIME_REQUIRED_FILES)) {
    assertRuntimeFileManifest(name, manifest.files[name]);
  }

  return manifest as OfficeRuntimeManifest;
}

/**
 * The heavy LibreOffice payload is intentionally outside the Next application
 * bundle. Production points to one immutable, versioned release directory.
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
      releaseId: null,
      manifestUrl: null,
    };
  }

  if (!configured) {
    throw new Error(
      "NEXT_PUBLIC_LUMEO_OFFICE_ASSET_BASE_URL is required for browser Office conversion in production.",
    );
  }

  const officeBaseUrl = ensureTrailingSlash(configured);
  assertProductionAssetUrl(officeBaseUrl);
  const releaseId = releaseIdFromUrl(officeBaseUrl);

  return {
    helperUrl: ZETAJS_HELPER_URL,
    officeBaseUrl,
    mode,
    externallyHosted: true,
    releaseId,
    manifestUrl: new URL(OFFICE_RUNTIME_MANIFEST_FILE, officeBaseUrl).toString(),
  };
}

async function probeRuntimeAsset(
  config: OfficeAssetConfig,
  name: string,
  manifestEntry: OfficeRuntimeFileManifest | null,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetchWithRetry(
    new URL(name, config.officeBaseUrl),
    {
      method: "GET",
      cache: "force-cache",
      credentials: "omit",
      headers: { Range: "bytes=0-0" },
    },
    signal,
  );

  if (response.status !== 200 && response.status !== 206) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Office runtime file ${name} is unavailable (HTTP ${response.status}).`);
  }

  const actualType = normalizeContentType(response.headers.get("content-type"));
  const expectedTypes =
    OFFICE_RUNTIME_REQUIRED_FILES[name as keyof typeof OFFICE_RUNTIME_REQUIRED_FILES];

  if (expectedTypes && !actualType) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Office runtime file ${name} is missing its content type.`);
  }

  if (
    expectedTypes &&
    !(expectedTypes as readonly string[]).includes(actualType)
  ) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Office runtime file ${name} has an unexpected content type.`);
  }

  if (manifestEntry && actualType) {
    const manifestType = normalizeContentType(manifestEntry.contentType);
    if (manifestType && manifestType !== actualType) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Office runtime file ${name} does not match its manifest content type.`);
    }
  }

  const contentEncoding = normalizeContentType(
    response.headers.get("content-encoding"),
  );
  const responseIsIdentityEncoded =
    !contentEncoding || contentEncoding === "identity";
  const contentRange = response.headers.get("content-range");
  const contentLength = response.headers.get("content-length");

  if (manifestEntry && responseIsIdentityEncoded) {
    if (contentRange) {
      const totalMatch = /\/(\d+)$/.exec(contentRange.trim());
      if (totalMatch && Number(totalMatch[1]) !== manifestEntry.bytes) {
        await response.body?.cancel().catch(() => {});
        throw new Error(
          `Office runtime file ${name} does not match its manifest size.`,
        );
      }
    } else if (
      response.status === 200 &&
      contentLength &&
      Number(contentLength) !== manifestEntry.bytes
    ) {
      await response.body?.cancel().catch(() => {});
      throw new Error(
        `Office runtime file ${name} does not match its manifest size.`,
      );
    }
  }

  const cacheControl = response.headers.get("cache-control");
  if (
    config.mode === "production" &&
    (!cacheControl ||
      !/max-age=31536000/i.test(cacheControl) ||
      !/immutable/i.test(cacheControl))
  ) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Office runtime file ${name} is not served with immutable caching.`);
  }

  if (config.mode === "production" && typeof location !== "undefined") {
    const assetOrigin = new URL(config.officeBaseUrl).origin;
    if (assetOrigin !== location.origin) {
      const resourcePolicy = response.headers
        .get("cross-origin-resource-policy")
        ?.trim()
        .toLowerCase();
      if (resourcePolicy !== "cross-origin") {
        await response.body?.cancel().catch(() => {});
        throw new Error(
          `Office runtime file ${name} is missing Cross-Origin-Resource-Policy: cross-origin.`,
        );
      }
    }
  }

  await response.body?.cancel().catch(() => {});
}

export async function preflightOfficeAssetOrigin(
  config: OfficeAssetConfig,
  signal?: AbortSignal,
): Promise<OfficeRuntimeManifest | null> {
  if (config.mode === "development") {
    await probeRuntimeAsset(config, "soffice.js", null, signal);
    return null;
  }

  if (!config.releaseId || !config.manifestUrl) {
    throw new Error("Production office runtime configuration is incomplete.");
  }

  const manifestResponse = await fetchWithRetry(
    config.manifestUrl,
    {
      method: "GET",
      cache: "force-cache",
      credentials: "omit",
      headers: { Accept: "application/json" },
    },
    signal,
  );

  if (!manifestResponse.ok) {
    await manifestResponse.body?.cancel().catch(() => {});
    throw new Error(
      `Office runtime manifest is unavailable (HTTP ${manifestResponse.status}).`,
    );
  }

  let manifestJson: unknown;
  try {
    manifestJson = await manifestResponse.json();
  } catch {
    throw new Error("Office runtime manifest could not be read.");
  }

  const manifest = validateOfficeRuntimeManifest(manifestJson, config.releaseId);

  for (const name of Object.keys(OFFICE_RUNTIME_REQUIRED_FILES)) {
    await probeRuntimeAsset(config, name, manifest.files[name], signal);
  }

  return manifest;
}

export function isImmutableOfficeAssetUrl(url: string): boolean {
  try {
    assertProductionAssetUrl(url);
    return true;
  } catch {
    return false;
  }
}
