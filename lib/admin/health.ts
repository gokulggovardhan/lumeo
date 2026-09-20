import "server-only";

import { summarizeHealthStatus, type HealthCheckStatus } from "@/lib/admin/health-status";
import { createClient } from "@/lib/supabase/server";
import { createStorageServerClient } from "@/lib/supabase/storageServerClient";

export type { HealthCheckStatus } from "@/lib/admin/health-status";

export type HealthCheck = {
  name: string;
  status: HealthCheckStatus;
  detail: string;
  latencyMs: number | null;
  required: boolean;
};

export type BuildInfo = {
  appVersion: string;
  gitCommitSha: string | null;
  deploymentEnvironment: string;
  deploymentUrl: string | null;
};

export type HealthSnapshot = {
  checks: HealthCheck[];
  overallStatus: HealthCheckStatus;
  buildInfo: BuildInfo;
  generatedAt: string;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T | null; error: unknown; latencyMs: number }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { result, error: null, latencyMs: Date.now() - start };
  } catch (error) {
    return { result: null, error, latencyMs: Date.now() - start };
  }
}

async function checkSupabaseDatabase(): Promise<{
  check: HealthCheck;
  officeConversionRequired: boolean;
}> {
  const supabase = await createClient();
  const { result, error, latencyMs } = await timed(async () =>
    await supabase
      .from("pdf_tools")
      .select("slug, status, is_enabled")
      .in("slug", ["word-to-pdf", "pdf-to-word"]),
  );

  if (error || result?.error) {
    return {
      check: {
        name: "Supabase database",
        status: "down",
        detail: "Query failed.",
        latencyMs,
        required: true,
      },
      officeConversionRequired: false,
    };
  }

  const officeConversionRequired = (result?.data ?? []).some(
    (tool) =>
      tool.is_enabled === true &&
      (tool.status === "active" || tool.status === "beta" || tool.status === "maintenance"),
  );

  return {
    check: {
      name: "Supabase database",
      status: latencyMs > 2000 ? "degraded" : "ok",
      detail: latencyMs > 2000 ? "Reachable, but responding slowly." : "Reachable.",
      latencyMs,
      required: true,
    },
    officeConversionRequired,
  };
}

async function checkSupabaseStorage(required: boolean): Promise<HealthCheck> {
  const supabase = createStorageServerClient();
  const { result, error, latencyMs } = await timed(() =>
    supabase.storage.from("lumeo-temp").list("", { limit: 1 }),
  );

  if (error || result?.error) {
    return {
      name: "Supabase storage",
      status: "down",
      detail: required
        ? "Temporary conversion storage is unreachable for a required Office-conversion dependency."
        : "Temporary conversion storage is unreachable; Office-conversion tools are currently disabled.",
      latencyMs,
      required,
    };
  }

  return {
    name: "Supabase storage",
    status: "ok",
    detail: required
      ? "Reachable and required by an enabled Office-conversion tool."
      : "Reachable; currently optional because Office-conversion tools are disabled.",
    latencyMs,
    required,
  };
}

async function checkLibreOfficeConverter(required: boolean): Promise<HealthCheck> {
  const baseUrl = process.env.WORD_TO_PDF_CONVERTER_URL;
  if (!baseUrl) {
    return {
      name: "LibreOffice converter",
      status: "not_configured",
      detail: required
        ? "Required by an enabled Office-conversion tool, but WORD_TO_PDF_CONVERTER_URL is not set."
        : "Optional while Office-conversion tools are disabled; WORD_TO_PDF_CONVERTER_URL is not set.",
      latencyMs: null,
      required,
    };
  }

  const { result, error, latencyMs } = await timed(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      return await fetch(new URL("/healthz", baseUrl), { signal: controller.signal, cache: "no-store" });
    } finally {
      clearTimeout(timeout);
    }
  });

  if (error || !result) {
    return {
      name: "LibreOffice converter",
      status: "down",
      detail: "Request failed or timed out.",
      latencyMs,
      required,
    };
  }

  if (!result.ok) {
    return {
      name: "LibreOffice converter",
      status: "down",
      detail: `Responded with HTTP ${result.status}.`,
      latencyMs,
      required,
    };
  }

  return {
    name: "LibreOffice converter",
    status: latencyMs > 3000 ? "degraded" : "ok",
    detail: latencyMs > 3000 ? "Reachable, but responding slowly." : "Reachable.",
    latencyMs,
    required,
  };
}

function getBuildInfo(): BuildInfo {
  return {
    appVersion: process.env.npm_package_version ?? "0.1.0",
    gitCommitSha: process.env.LUMEO_BUILD_SHA ?? null,
    deploymentEnvironment: process.env.LUMEO_DEPLOYMENT_ENV ?? "local",
    deploymentUrl: process.env.LUMEO_DEPLOYMENT_URL ?? null,
  };
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const databaseResult = await checkSupabaseDatabase();
  const [storage, libreOffice] = await Promise.all([
    checkSupabaseStorage(databaseResult.officeConversionRequired),
    checkLibreOfficeConverter(databaseResult.officeConversionRequired),
  ]);
  const checks = [databaseResult.check, storage, libreOffice];

  return {
    checks,
    overallStatus: summarizeHealthStatus(checks),
    buildInfo: getBuildInfo(),
    generatedAt: new Date().toISOString(),
  };
}
